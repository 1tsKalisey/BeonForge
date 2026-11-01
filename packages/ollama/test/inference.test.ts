import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import http, {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { once, EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import type { Socket } from 'node:net';
import { allowTestPort } from './fixtures/network-guard.mjs';
import {
  prepareSyntheticInference,
  runSyntheticInference,
  SyntheticInferenceError,
  type SyntheticInferencePreviewV1,
  type SyntheticInferenceGrant,
} from '@beonforge/ollama';

const servers: Server[] = [];
const sockets = new Set<Socket>();
const seen: {
  method: string | undefined;
  path: string | undefined;
  body: Buffer;
  headers: IncomingMessage['headers'];
}[] = [];
const model = 'tiny:latest';
type Handler = (req: IncomingMessage, res: ServerResponse) => void;
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
  for (const socket of sockets) socket.destroy();
  for (const server of servers.splice(0))
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

function json(res: ServerResponse, value: unknown): void {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(value));
}
async function fixture(
  post?: Handler,
  tags?: Handler,
  version?: Handler,
): Promise<SyntheticInferencePreviewV1> {
  const server = createServer((req, res) => {
    const record = {
      method: req.method,
      path: req.url,
      body: Buffer.alloc(0),
      headers: req.headers,
    };
    seen.push(record);
    req.on('data', (chunk: Buffer) => {
      record.body = Buffer.concat([record.body, chunk]);
    });
    req.on('end', () => {
      if (req.url === '/api/version') {
        if (version) version(req, res);
        else json(res, { version: '1.0' });
      } else if (req.url === '/api/tags') {
        if (tags) tags(req, res);
        else json(res, { models: [{ name: model }] });
      } else if (req.url === '/api/generate' && req.method === 'POST') {
        if (post) post(req, res);
        else
          json(res, {
            model,
            done: true,
            response: '{"answer":4}',
            thinking: 'private response not returned',
          });
      } else {
        res.writeHead(500);
        res.end();
      }
    });
  });
  servers.push(server);
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('mock address');
  allowTestPort(addr.port);
  return prepareSyntheticInference({
    endpoint: `http://127.0.0.1:${addr.port}`,
    model,
  });
}
function grant(preview: SyntheticInferencePreviewV1): SyntheticInferenceGrant {
  return {
    canInfer: true,
    allowLocalProbe: true,
    endpoint: preview.endpoint,
    model: preview.model,
    payloadSha256: preview.payloadSha256,
  };
}
async function errorOf(
  promise: Promise<unknown>,
  code: string,
  dispatched = false,
  outcome: string = dispatched ? 'unknown' : 'not_dispatched',
): Promise<SyntheticInferenceError> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(SyntheticInferenceError);
  expect(caught).toMatchObject({
    code,
    message: code,
    requestDispatched: dispatched,
    outcome,
  });
  return caught as SyntheticInferenceError;
}

it('pure canonical preview: fixed public prompt, exact wire SHA256 and stable UTF8 bytes', async () => {
  expect(import.meta.resolve('@beonforge/ollama')).toMatch(/dist\/index.js$/);
  const p = await fixture();
  expect(prepareSyntheticInference({ endpoint: p.endpoint, model })).toEqual(p);
  expect(p.classification).toBe('synthetic-public-v1');
  expect(createHash('sha256').update(p.payload, 'utf8').digest('hex')).toBe(
    p.payloadSha256,
  );
  expect(JSON.parse(p.payload)).toEqual({
    model,
    prompt: 'Return only the JSON object {"answer":4}. What is 2+2?',
    stream: false,
    format: 'json',
    options: { temperature: 0, num_predict: 64, num_ctx: 1024 },
  });
  expect(Object.isFrozen(p)).toBe(true);
  expect(Object.isFrozen(p.limits)).toBe(true);
  expect(seen).toEqual([]);
});

it('authorized inference: exact two metadata GETs and one POST, no context or private output', async () => {
  const p = await fixture();
  const report = await runSyntheticInference(p, grant(p));
  expect(report).toEqual({
    schemaVersion: 1,
    classification: 'synthetic-public-v1',
    model,
    payloadSha256: p.payloadSha256,
    answer: 4,
    requestDispatched: true,
    outcome: 'confirmed',
  });
  expect(seen.map((r) => [r.method, r.path])).toEqual([
    ['GET', '/api/version'],
    ['GET', '/api/tags'],
    ['POST', '/api/generate'],
  ]);
  expect(seen[0]?.body.length).toBe(0);
  expect(seen[1]?.body.length).toBe(0);
  expect(seen[2]?.body.equals(Buffer.from(p.payload, 'utf8'))).toBe(true);
  expect(seen[2]?.headers['content-length']).toBe(
    String(Buffer.byteLength(p.payload)),
  );
  expect(seen[2]?.headers.authorization).toBeUndefined();
  expect(JSON.stringify(report)).not.toContain('private');
  await vi.waitFor(() => expect(sockets.size).toBe(0));
});

it.each(['canInfer', 'allowLocalProbe', 'endpoint', 'model', 'payloadSha256'])(
  'requires own explicit grant field %s',
  async (key) => {
    const p = await fixture();
    const g = { ...grant(p) } as Record<string, unknown>;
    delete g[key];
    await errorOf(
      runSyntheticInference(p, g as unknown as SyntheticInferenceGrant),
      'inference_denied',
    );
    expect(seen).toEqual([]);
  },
);
it.each(['canInfer', 'allowLocalProbe'])(
  'false or inherited permission cannot grant %s',
  async (key) => {
    const p = await fixture();
    for (const value of [false, undefined, 'true']) {
      const g = { ...grant(p), [key]: value };
      await errorOf(runSyntheticInference(p, g), 'inference_denied');
    }
    const base = { ...grant(p) } as Record<string, unknown>;
    delete base[key];
    const inherited = Object.assign(
      Object.create({ [key]: true }) as object,
      base,
    );
    await errorOf(
      runSyntheticInference(p, inherited as unknown as SyntheticInferenceGrant),
      'inference_denied',
    );
    expect(seen).toEqual([]);
  },
);
it.each(['endpoint', 'model', 'payloadSha256'])(
  'mismatched grant %s cannot infer',
  async (key) => {
    const p = await fixture();
    await errorOf(
      runSyntheticInference(p, { ...grant(p), [key]: 'wrong' }),
      'inference_denied',
    );
    expect(seen).toEqual([]);
  },
);
it('malformed/null/Proxy/accessor policies are typed, getters never executed', async () => {
  const p = await fixture();
  const getter = vi.fn(() => true);
  const accessor = Object.defineProperty({ ...grant(p) }, 'canInfer', {
    get: getter,
  });
  for (const g of [null, new Proxy(grant(p), {}), accessor])
    await errorOf(
      runSyntheticInference(p, g as SyntheticInferenceGrant),
      'inference_invalid_options',
    );
  expect(getter).not.toHaveBeenCalled();
  expect(seen).toEqual([]);
});
it('Object.prototype contamination cannot grant canInfer', async () => {
  const p = await fixture();
  const previous = Object.getOwnPropertyDescriptor(
    Object.prototype,
    'canInfer',
  );
  try {
    Object.defineProperty(Object.prototype, 'canInfer', {
      value: true,
      configurable: true,
    });
    const g = { ...grant(p) } as Record<string, unknown>;
    delete g.canInfer;
    await errorOf(
      runSyntheticInference(p, g as unknown as SyntheticInferenceGrant),
      'inference_denied',
    );
  } finally {
    if (previous) Object.defineProperty(Object.prototype, 'canInfer', previous);
    else Reflect.deleteProperty(Object.prototype, 'canInfer');
  }
  expect(seen).toEqual([]);
});
it.each(['payload', 'payloadSha256', 'classification', 'limits', 'extra'])(
  'tampered preview %s is rejected before network',
  async (key) => {
    const p = await fixture();
    const altered = {
      ...p,
      [key]:
        key === 'limits'
          ? { ...p.limits, responseBytes: 999999 }
          : 'private content',
    };
    await errorOf(
      runSyntheticInference(altered, grant(p)),
      'inference_invalid_preview',
    );
    expect(seen).toEqual([]);
  },
);
it('consistent rehash of private input cannot change the fixed public payload', async () => {
  const p = await fixture();
  const payload = JSON.stringify({
    model,
    prompt: 'private content',
    stream: false,
  });
  const altered = {
    ...p,
    payload,
    payloadSha256: createHash('sha256').update(payload).digest('hex'),
  };
  await errorOf(
    runSyntheticInference(altered, grant(altered)),
    'inference_invalid_preview',
  );
  expect(seen).toEqual([]);
});
it('preparation rejects arbitrary prompt/context fields and getters without reading them', async () => {
  const p = await fixture();
  const getter = vi.fn(() => 'private data');
  const input = Object.defineProperty(
    { endpoint: p.endpoint, model },
    'prompt',
    { get: getter },
  );
  expect(() => prepareSyntheticInference(input)).toThrow(
    'inference_invalid_options',
  );
  expect(getter).not.toHaveBeenCalled();
  expect(seen).toEqual([]);
});
it.each([
  'test:cloud',
  'CLOUD',
  'name/cloud:tag',
  '../private',
  'https://model',
  'user@remote',
  'a'.repeat(257),
])('rejects remote/ambiguous/overlong model %#', async (model) => {
  const p = await fixture();
  expect(() =>
    prepareSyntheticInference({ endpoint: p.endpoint, model }),
  ).toThrow('inference_invalid_options');
  expect(seen).toEqual([]);
});
it('refuses a remote origin before any request', () => {
  expect(() =>
    prepareSyntheticInference({
      endpoint: 'http://example.invalid:9999',
      model,
    }),
  ).toThrow('inference_denied');
});
it('maximal allowed model name remains within bounded input; Unicode payload cannot be injected', async () => {
  const p = await fixture();
  const max = prepareSyntheticInference({
    endpoint: p.endpoint,
    model: 'a'.repeat(256),
  });
  expect(Buffer.byteLength(max.payload)).toBeLessThanOrEqual(4096);
  expect(() =>
    prepareSyntheticInference({ endpoint: p.endpoint, model: '模型' }),
  ).toThrow('inference_invalid_options');
  expect(seen).toEqual([]);
});
it('missing installed model never sends POST', async () => {
  const p = await fixture(undefined, (_req, res) => json(res, { models: [] }));
  await errorOf(runSyntheticInference(p, grant(p)), 'model_not_installed');
  expect(seen.map((r) => r.path)).toEqual(['/api/version', '/api/tags']);
});
it.each(['canInfer', 'allowLocalProbe', 'model', 'payloadSha256'])(
  'revocation after preflight prevents POST: %s',
  async (key) => {
    const p = await fixture(undefined, (_req, res) => {
      Object.defineProperty(g, key, { value: false });
      json(res, { models: [{ name: model }] });
    });
    const g = grant(p);
    await errorOf(runSyntheticInference(p, g), 'inference_denied');
    expect(seen.filter((r) => r.method === 'POST')).toHaveLength(0);
  },
);
it('preview changed during preflight is not sent, even with a matching new grant hash', async () => {
  const p = await fixture(undefined, (_req, res) => {
    Object.defineProperty(mutable, 'payload', { value: 'private data' });
    Object.defineProperty(g, 'payloadSha256', {
      value: createHash('sha256').update('private data').digest('hex'),
    });
    json(res, { models: [{ name: model }] });
  });
  const mutable = { ...p };
  const g = grant(p);
  await errorOf(runSyntheticInference(mutable, g), 'inference_invalid_preview');
  expect(seen.filter((r) => r.method === 'POST')).toHaveLength(0);
});
it('revocation on confirmed response suppresses report and preserves confirmed effect evidence', async () => {
  const p = await fixture((_req, res) => {
    Object.defineProperty(g, 'canInfer', { value: false });
    json(res, { model, done: true, response: '{"answer":4}' });
  });
  const g = grant(p);
  await errorOf(
    runSyntheticInference(p, g),
    'inference_denied',
    true,
    'confirmed',
  );
  expect(seen.filter((r) => r.method === 'POST')).toHaveLength(1);
});

it.each([
  '{"answer":5}',
  '{"answer":"4"}',
  '{"answer":true}',
  '{"answer":4,"extra":"private"}',
  '[]',
  'null',
  'private malformed output',
])('invalid inner output %# is not exposed', async (response) => {
  const p = await fixture((_req, res) =>
    json(res, { model, done: true, response }),
  );
  const error = await errorOf(
    runSyntheticInference(p, grant(p)),
    'inference_invalid_output',
    true,
    'confirmed',
  );
  expect(JSON.stringify(error)).not.toContain(response);
});
it.each([
  { model, done: false, response: '{"answer":4}' },
  { model: 'other', done: true, response: '{"answer":4}' },
  { model, done: true },
  { model, done: true, response: 7 },
])('invalid outer schema %#', async (body) => {
  const p = await fixture((_req, res) => json(res, body));
  await errorOf(
    runSyntheticInference(p, grant(p)),
    'inference_invalid_output',
    true,
    body.model === model && body.done ? 'confirmed' : 'unknown',
  );
});
it('malformed outer JSON and UTF8 are typed with unknown outcome, never retried', async () => {
  for (const bytes of [
    Buffer.from('private malformed data'),
    Buffer.from([0xff]),
  ]) {
    const p = await fixture((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(bytes);
    });
    await errorOf(
      runSyntheticInference(p, grant(p)),
      'probe_invalid_response',
      true,
    );
  }
  expect(seen.filter((r) => r.method === 'POST')).toHaveLength(2);
});
it.each([false, true])(
  'HTTP response byte cap, chunked=%s',
  async (chunked) => {
    const p = await fixture((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (!chunked) res.setHeader('Content-Length', 65537);
      res.write('x'.repeat(65537));
      res.end();
    });
    await errorOf(
      runSyntheticInference(p, grant(p)),
      'probe_response_too_large',
      true,
    );
    expect(seen.filter((r) => r.method === 'POST')).toHaveLength(1);
  },
);
it('generated text limit rejects within the outer byte budget', async () => {
  const p = await fixture((_req, res) =>
    json(res, { model, done: true, response: 'x'.repeat(4097) }),
  );
  await errorOf(
    runSyntheticInference(p, grant(p)),
    'inference_invalid_output',
    true,
    'confirmed',
  );
});
it.each([101, 302, 500])(
  'HTTP %i after POST has unknown outcome, no retry',
  async (status) => {
    const p = await fixture((_req, res) => {
      res.writeHead(
        status,
        status === 101
          ? { Connection: 'Upgrade', Upgrade: 'test' }
          : status === 302
            ? { Location: 'http://example.invalid/' }
            : {},
      );
      res.end();
    });
    await errorOf(
      runSyntheticInference(p, grant(p)),
      status === 101
        ? 'probe_invalid_response'
        : status === 302
          ? 'probe_redirect_denied'
          : 'probe_http_error',
      true,
    );
    expect(seen.filter((r) => r.method === 'POST')).toHaveLength(1);
    await vi.waitFor(() => expect(sockets.size).toBe(0));
  },
);
it('premature close after POST is unknown, without retry', async () => {
  const p = await fixture((_req, res) => {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': 500,
    });
    res.write('{');
    res.socket?.end();
  });
  await errorOf(
    runSyntheticInference(p, grant(p)),
    'probe_invalid_response',
    true,
  );
  expect(seen.filter((r) => r.method === 'POST')).toHaveLength(1);
});
it('deadline during preflight is not dispatched, during inference is unknown', async () => {
  const before = await fixture(undefined, undefined, () => {});
  await errorOf(
    runSyntheticInference(before, grant(before), { timeoutMs: 50 }),
    'inference_timeout',
  );
  const after = await fixture(() => {});
  await errorOf(
    runSyntheticInference(after, grant(after), { timeoutMs: 100 }),
    'inference_timeout',
    true,
  );
  expect(seen.filter((r) => r.method === 'POST')).toHaveLength(1);
});
it('caller cancellation before and during generation closes sockets, never retries', async () => {
  const controller = new AbortController();
  const p = await fixture((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.write('{');
    setImmediate(() => controller.abort('private reason'));
  });
  await errorOf(
    runSyntheticInference(p, grant(p), { signal: controller.signal }),
    'inference_cancelled',
    true,
  );
  const count = seen.length;
  await errorOf(
    runSyntheticInference(p, grant(p), { signal: controller.signal }),
    'inference_cancelled',
  );
  expect(seen).toHaveLength(count);
  await vi.waitFor(() => expect(sockets.size).toBe(0));
});
it.each([0, -1, 120001, 1.5, NaN, '100'])(
  'invalid timeout %# has no network',
  async (timeoutMs) => {
    const p = await fixture();
    await errorOf(
      runSyntheticInference(p, grant(p), { timeoutMs } as unknown as {
        timeoutMs: number;
      }),
      'inference_invalid_options',
    );
    expect(seen).toEqual([]);
  },
);
it('proxy configuration is denied before preflight', async () => {
  const p = await fixture();
  vi.stubEnv('HTTP_PROXY', p.endpoint);
  await errorOf(runSyntheticInference(p, grant(p)), 'inference_denied');
  expect(seen).toEqual([]);
});
it.each(['timeout', 'cancel'])(
  'absolute deadline/abort rejects a silent POST transport: %s',
  async (mode) => {
    const p = await fixture();
    const original = http.request;
    const silent = Object.assign(new EventEmitter(), {
      end: vi.fn(),
      destroy: vi.fn(),
    });
    const spy = vi
      .spyOn(http, 'request')
      .mockImplementation(((url: URL, options: http.RequestOptions) =>
        url.pathname === '/api/generate'
          ? silent
          : original(url, options)) as typeof http.request);
    syncBuiltinESMExports();
    const controller = new AbortController();
    try {
      const pending = runSyntheticInference(p, grant(p), {
        timeoutMs: 100,
        signal: controller.signal,
      });
      if (mode === 'cancel')
        await vi.waitFor(() => {
          expect(silent.end).toHaveBeenCalled();
          controller.abort();
        });
      await errorOf(
        pending,
        mode === 'cancel' ? 'inference_cancelled' : 'inference_timeout',
        true,
      );
      expect(silent.destroy).toHaveBeenCalledTimes(1);
      silent.emit('error', new Error('late'));
      silent.emit('close');
      expect(silent.listenerCount('error')).toBe(0);
    } finally {
      spy.mockRestore();
      syncBuiltinESMExports();
    }
  },
);

async function cli(
  args: string[],
): Promise<{ code: number | null; out: string; err: string }> {
  const ports = servers
    .map((s) => {
      const a = s.address();
      return a && typeof a !== 'string' ? a.port : '';
    })
    .join(',');
  const child = spawn(
    process.execPath,
    [
      '--import',
      './test/fixtures/network-guard.mjs',
      'dist/cli.js',
      'infer',
      ...args,
    ],
    {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BEONFORGE_TEST_PORTS: ports },
    },
  );
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
function runArgs(p: SyntheticInferencePreviewV1): string[] {
  return [
    'run',
    '--endpoint',
    p.endpoint,
    '--model',
    model,
    '--payload-sha256',
    p.payloadSha256,
    '--allow-local-probe',
    '--allow-inference',
  ];
}
it('demo: CLI pure preview -> explicit matching consent -> one mock inference -> validated report', async () => {
  const p = await fixture();
  const preview = await cli([
    'preview',
    '--endpoint',
    p.endpoint,
    '--model',
    model,
  ]);
  expect(preview.code).toBe(0);
  expect(JSON.parse(preview.out)).toEqual(p);
  expect(seen).toEqual([]);
  const report = await cli(runArgs(p));
  expect(report.code).toBe(0);
  expect(report.err).toBe('');
  expect(JSON.parse(report.out)).toMatchObject({
    answer: 4,
    outcome: 'confirmed',
  });
  expect(report.out).not.toContain('private response');
  expect(seen.filter((r) => r.method === 'POST')).toHaveLength(1);
});
it('CLI missing consent, wrong hash and nondecimal timeout send no requests', async () => {
  const p = await fixture();
  for (const args of [
    runArgs(p).filter((v) => v !== '--allow-inference'),
    runArgs(p).map((v) => (v === p.payloadSha256 ? '0'.repeat(64) : v)),
    [...runArgs(p), '--timeout-ms', '1e3'],
  ]) {
    const result = await cli(args);
    expect(result.code).toBe(1);
    expect(result.out).toBe('');
    expect(JSON.parse(result.err)).toMatchObject({
      error: { requestDispatched: false, outcome: 'not_dispatched' },
    });
  }
  expect(seen).toEqual([]);
});
it('CLI HTTP101 returns typed unknown outcome and exit 2, without unsettled await', async () => {
  const p = await fixture((_req, res) => {
    res.writeHead(101, { Connection: 'Upgrade', Upgrade: 'test' });
    res.end();
  });
  const result = await cli(runArgs(p));
  expect(result.code).toBe(2);
  expect(result.out).toBe('');
  expect(JSON.parse(result.err)).toEqual({
    error: {
      code: 'probe_invalid_response',
      requestDispatched: true,
      outcome: 'unknown',
    },
  });
  expect(result.err).not.toContain('unsettled');
});

it.each([4096, 4097])('generated UTF8 text byte boundary %s', async (size) => {
  const value = '{"answer":4}';
  const response = value + ' '.repeat(size - Buffer.byteLength(value));
  const p = await fixture((_req, res) =>
    json(res, { model, done: true, response }),
  );
  if (size === 4096)
    expect((await runSyntheticInference(p, grant(p))).answer).toBe(4);
  else
    await errorOf(
      runSyntheticInference(p, grant(p)),
      'inference_invalid_output',
      true,
      'confirmed',
    );
});
it('accepts exactly 64KiB outer response without exposing ignored metadata', async () => {
  const base = { model, done: true, response: '{"answer":4}', padding: '' };
  const body = JSON.stringify({
    ...base,
    padding: 'x'.repeat(65536 - Buffer.byteLength(JSON.stringify(base))),
  });
  expect(Buffer.byteLength(body)).toBe(65536);
  const p = await fixture((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(body);
  });
  const report = await runSyntheticInference(p, grant(p));
  expect(report.answer).toBe(4);
  expect(report).not.toHaveProperty('padding');
});
it('an absolute deadline includes preflight time rather than restarting for POST', async () => {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const later = (res: ServerResponse, value: unknown, delay = 50) => {
    timers.push(
      setTimeout(() => {
        if (!res.destroyed) json(res, value);
      }, delay),
    );
  };
  const p = await fixture(
    (_req, res) =>
      later(res, { model, done: true, response: '{"answer":4}' }, 200),
    (_req, res) => later(res, { models: [{ name: model }] }),
    (_req, res) => later(res, { version: '1.0' }),
  );
  try {
    await errorOf(
      runSyntheticInference(p, grant(p), { timeoutMs: 250 }),
      'inference_timeout',
      true,
    );
  } finally {
    for (const timer of timers) clearTimeout(timer);
  }
  expect(seen.filter((r) => r.method === 'POST')).toHaveLength(1);
});
it('CLI timeout after dispatch is exit 2, not a retry or a success', async () => {
  const p = await fixture(() => {});
  const result = await cli([...runArgs(p), '--timeout-ms', '200']);
  expect(result.code).toBe(2);
  expect(result.out).toBe('');
  expect(JSON.parse(result.err)).toEqual({
    error: {
      code: 'inference_timeout',
      requestDispatched: true,
      outcome: 'unknown',
    },
  });
  expect(seen.filter((r) => r.method === 'POST')).toHaveLength(1);
});
it('CLI invalid output is confirmed with exit 1, not an uncertain effect', async () => {
  const p = await fixture((_req, res) =>
    json(res, { model, done: true, response: '{"answer":5}' }),
  );
  const result = await cli(runArgs(p));
  expect(result.code).toBe(1);
  expect(result.out).toBe('');
  expect(JSON.parse(result.err)).toEqual({
    error: {
      code: 'inference_invalid_output',
      requestDispatched: true,
      outcome: 'confirmed',
    },
  });
});
