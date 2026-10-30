import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createServer, type RequestListener, type Server } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import {
  probeOllama,
  OllamaProbeError,
  type OllamaProbeOptions,
} from '@beonforge/ollama';

const servers: Server[] = [];
const seen: {
  method: string | undefined;
  path: string | undefined;
  body: string;
  headers: object;
}[] = [];
beforeEach(() => {
  seen.length = 0;
  for (const key of [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
  ])
    vi.stubEnv(key, '');
});
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

async function local(
  listener?: RequestListener,
  host = '127.0.0.1',
): Promise<string> {
  const server = createServer((req, res) => {
    const record = {
      method: req.method,
      path: req.url,
      body: '',
      headers: req.headers,
    };
    seen.push(record);
    req.on('data', (chunk: Buffer) => {
      record.body += chunk.toString();
    });
    if (listener) listener(req, res);
    else {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify(
          req.url === '/api/version'
            ? { version: '0.5.1' }
            : {
                models: [
                  { name: 'tiny:latest', private_extra: 'not-returned' },
                ],
              },
        ),
      );
    }
  });
  servers.push(server);
  server.listen(0, host);
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('test server address');
  return `http://${host === '::1' ? '[::1]' : host}:${address.port}`;
}

function options(endpoint: string): OllamaProbeOptions {
  return { endpoint, allowLocalProbe: true };
}

async function denied(value: unknown, code: string): Promise<void> {
  await expect(probeOllama(value as OllamaProbeOptions)).rejects.toMatchObject({
    name: 'OllamaProbeError',
    code,
    message: code,
  });
}

it('compiled export: only two metadata GETs without body, credentials or context', async () => {
  expect(import.meta.resolve('@beonforge/ollama')).toMatch(/dist\/index.js$/);
  expect(await probeOllama(options(await local()))).toEqual({
    schemaVersion: 1,
    status: 'available',
    version: '0.5.1',
    models: ['tiny:latest'],
  });
  expect(
    seen.map(({ method, path, body }) => ({ method, path, body })),
  ).toEqual([
    { method: 'GET', path: '/api/version', body: '' },
    { method: 'GET', path: '/api/tags', body: '' },
  ]);
  for (const record of seen) {
    expect(record.headers).not.toHaveProperty('authorization');
    expect(record.headers).not.toHaveProperty('cookie');
  }
});

it('IPv6 literal loopback is supported without hostname resolution', async () => {
  expect(
    (await probeOllama(options(await local(undefined, '::1')))).status,
  ).toBe('available');
});

it('empty installation differs from unavailable', async () => {
  const endpoint = await local((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify(
        req.url === '/api/version' ? { version: '1.0.0' } : { models: [] },
      ),
    );
  });
  expect((await probeOllama(options(endpoint))).status).toBe(
    'available_no_models',
  );
});

it('stopped service is unavailable and errors contain no endpoint or native cause', async () => {
  const endpoint = await local();
  const server = servers.pop();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  await denied(options(endpoint), 'probe_unavailable');
});

it.each([
  'http://localhost:11434',
  'http://127.1:11434',
  'http://2130706433:11434',
  'http://127.0.0.2:11434',
  'http://0.0.0.0:11434',
  'http://192.168.1.2:11434',
  'https://127.0.0.1:11434',
  'http://[::ffff:127.0.0.1]:11434',
  'http://127.0.0.1:11434/',
  'http://127.0.0.1:11434?x=y',
  'http://user:pass@127.0.0.1:11434',
  'http://127.0.0.1:11434#x',
  'http://127.0.0.1:0',
  'http://127.0.0.1:65536',
  'http://127.0.0.1:011434',
  'http://127.0.0.1:11434\n',
])(
  'rejects ambiguous/unauthorized origin %s with zero traffic',
  async (endpoint) => {
    await denied(options(endpoint), 'probe_denied');
    expect(seen).toEqual([]);
  },
);

it('requires explicit own permission, rejects getters and malformed options', async () => {
  const endpoint = await local();
  await denied({ endpoint }, 'probe_denied');
  await denied({ endpoint, allowLocalProbe: false }, 'probe_denied');
  const inherited = Object.assign(
    Object.create({ allowLocalProbe: true }) as object,
    { endpoint },
  );
  await denied(inherited, 'probe_denied');
  const getter = vi.fn(() => true);
  await denied(
    Object.defineProperty({ endpoint }, 'allowLocalProbe', { get: getter }),
    'probe_invalid_options',
  );
  await denied(null, 'probe_invalid_options');
  expect(getter).not.toHaveBeenCalled();
  expect(seen).toEqual([]);
});

it('revalidates authorization before the second GET', async () => {
  const endpoint = await local((_req, res) => {
    Object.defineProperty(policy, 'allowLocalProbe', { value: false });
    res.setHeader('Content-Type', 'application/json');
    res.end('{"version":"1.0"}');
  });
  const policy = options(endpoint);
  await denied(policy, 'probe_denied');
  expect(seen).toHaveLength(1);
});

it.each([
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
])('rejects proxy %s before any traffic', async (key) => {
  const endpoint = await local();
  vi.stubEnv(key, endpoint);
  vi.stubEnv('NO_PROXY', '*');
  await denied(options(endpoint), 'probe_denied');
  expect(seen).toEqual([]);
});

it('does not use the global environment proxy even when enabled in Node', async () => {
  vi.stubEnv('NODE_USE_ENV_PROXY', '1');
  expect((await probeOllama(options(await local()))).status).toBe('available');
});

it('redirect is rejected and its target receives no request', async () => {
  const target = await local();
  const source = await local((_req, res) => {
    res.writeHead(302, { Location: target });
    res.end();
  });
  await denied(options(source), 'probe_redirect_denied');
  expect(seen).toHaveLength(1);
});

it.each([400, 401, 500])(
  'HTTP %i is typed and does not leak response data',
  async (status) => {
    const endpoint = await local((_req, res) => {
      res.writeHead(status);
      res.end('private server diagnostic');
    });
    await denied(options(endpoint), 'probe_http_error');
  },
);

it.each([
  'not-json',
  '{}',
  'null',
  '[]',
  '{"version":17}',
  '{"version":"bad\\nvalue"}',
])('invalid version JSON/schema %s', async (body) => {
  const endpoint = await local((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(body);
  });
  await denied(options(endpoint), 'probe_invalid_response');
});

it.each([
  {},
  { models: null },
  { models: [null] },
  { models: [{ name: '' }] },
  { models: [{ name: 'a' }, { name: 'a' }] },
])('invalid tags schema %#', async (tags) => {
  const endpoint = await local((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify(req.url === '/api/version' ? { version: '1.0' } : tags),
    );
  });
  await denied(options(endpoint), 'probe_invalid_response');
});

it('rejects malformed UTF8 and unexpected encoding/content type', async () => {
  for (const [contentType, encoding, body] of [
    ['application/json', 'identity', Buffer.from([0xff])],
    ['text/html', 'identity', Buffer.from('{}')],
    ['application/json', 'gzip', Buffer.from('{}')],
  ] as const) {
    const endpoint = await local((_req, res) => {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Encoding': encoding,
      });
      res.end(body);
    });
    await denied(options(endpoint), 'probe_invalid_response');
  }
});

it.each([true, false])(
  'bounds response bytes including chunked=%s',
  async (chunked) => {
    const endpoint = await local((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (!chunked) res.setHeader('Content-Length', 262145);
      res.write('x'.repeat(262145));
      res.end();
    });
    await denied(options(endpoint), 'probe_response_too_large');
  },
);

it.each([false, true])(
  'absolute deadline covers headers/body, partial=%s',
  async (partial) => {
    const endpoint = await local((_req, res) => {
      if (partial) {
        res.setHeader('Content-Type', 'application/json');
        res.write('{');
      }
    });
    await denied({ ...options(endpoint), timeoutMs: 50 }, 'probe_timeout');
  },
);

it('deadline covers both requests, and abort closes the stalled second body', async () => {
  const endpoint = await local((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/version') res.end('{"version":"1.0"}');
    else res.write('{');
  });
  await denied({ ...options(endpoint), timeoutMs: 100 }, 'probe_timeout');
  expect(seen.map((r) => r.path)).toEqual(['/api/version', '/api/tags']);
});

it('caller cancellation before and during network never leaks its reason', async () => {
  const controller = new AbortController();
  const endpoint = await local(() => {
    controller.abort('private reason');
  });
  await denied(
    { ...options(endpoint), signal: controller.signal },
    'probe_cancelled',
  );
  const count = seen.length;
  await denied(
    { ...options(endpoint), signal: controller.signal },
    'probe_cancelled',
  );
  expect(seen).toHaveLength(count);
});

it('connection terminated during response yields typed invalid response', async () => {
  const endpoint = await local((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.write('{');
    setImmediate(() => res.destroy());
  });
  await denied(options(endpoint), 'probe_invalid_response');
});

it.each([0, -1, 30001, 1.5, NaN, '50'])(
  'invalid timeout %s fails before traffic',
  async (timeoutMs) => {
    const endpoint = await local();
    await denied({ ...options(endpoint), timeoutMs }, 'probe_invalid_options');
    expect(seen).toEqual([]);
  },
);

async function cli(
  args: string[],
): Promise<{ code: number | null; out: string; err: string }> {
  const child = spawn(process.execPath, ['dist/cli.js', ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let out = '';
  let err = '';
  child.stdout.on('data', (chunk: Buffer) => {
    out += chunk.toString();
  });
  child.stderr.on('data', (chunk: Buffer) => {
    err += chunk.toString();
  });
  const [code] = (await once(child, 'close')) as [number | null];
  return { code, out, err };
}

it('demo: compiled CLI in a separate process returns metadata only', async () => {
  const endpoint = await local();
  const result = await cli([
    'probe',
    '--endpoint',
    endpoint,
    '--allow-local-probe',
  ]);
  expect(result.code).toBe(0);
  expect(result.err).toBe('');
  expect(JSON.parse(result.out)).toEqual({
    schemaVersion: 1,
    status: 'available',
    version: '0.5.1',
    models: ['tiny:latest'],
  });
  expect(seen.map((r) => r.path)).toEqual(['/api/version', '/api/tags']);
});

it.each(
  [
    [],
    ['probe'],
    ['probe', '--endpoint', 'http://127.0.0.1:11434'],
    [
      'probe',
      '--allow-local-probe',
      '--endpoint',
      'http://127.0.0.1:11434',
      '--timeout-ms',
      '1e3',
    ],
  ].map((args) => ({ args })),
)(
  'CLI rejects invalid/unapproved invocation %# without network',
  async ({ args }) => {
    const result = await cli(args);
    expect(result.code).toBe(1);
    expect(result.out).toBe('');
    expect(JSON.parse(result.err)).toEqual({
      error: { code: 'probe_invalid_options' },
    });
    expect(seen).toEqual([]);
  },
);

it('typed error has only a static diagnostic', () => {
  const error = new OllamaProbeError('probe_denied');
  expect(error.message).toBe('probe_denied');
  expect(error.cause).toBeUndefined();
});

it('rejects oversized headers without exposing their content', async () => {
  const endpoint = await local((_req, res) => {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'X-Large': 'x'.repeat(10000),
    });
    res.end('{}');
  });
  await denied(options(endpoint), 'probe_invalid_response');
});

it('rejects too many models and overlong names within the byte budget', async () => {
  for (const models of [
    Array.from({ length: 1025 }, (_, i) => ({ name: `model${i}` })),
    [{ name: 'a'.repeat(257) }],
  ]) {
    const endpoint = await local((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify(
          req.url === '/api/version' ? { version: '1.0' } : { models },
        ),
      );
    });
    await denied(options(endpoint), 'probe_invalid_response');
  }
});
