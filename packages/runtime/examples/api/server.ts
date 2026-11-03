// B06-01: loopback-only HTTP API over the synthetic TaskService (D-048).
// The session token is anti-CSRF/DNS-rebinding protection, not user authentication.
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { join, extname, relative, isAbsolute, sep } from 'node:path';
import type { AddressInfo } from 'node:net';
import { TaskService, TaskError, EXECUTORS } from './tasks.ts';

const HOST = '127.0.0.1';
const MAX_BODY = 4096;
const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};
const STATUS: Readonly<Record<string, number>> = {
  task_invalid: 400,
  task_denied: 403,
  task_not_found: 404,
  task_conflict: 409,
  task_busy: 409,
  task_storage_failure: 500,
};
const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'",
};

export interface ApiServer {
  readonly url: string;
  readonly port: number;
  close(): Promise<void>;
}
export interface ApiOptions {
  readonly dataDirectory: string;
  readonly port?: number;
  readonly webRoot?: string | null;
}

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    ...SECURITY,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
}

async function body(req: IncomingMessage): Promise<unknown> {
  const type = req.headers['content-type'] ?? '';
  if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(type))
    throw new HttpError(415, 'unsupported_media_type');
  const declared = Number(req.headers['content-length'] ?? NaN);
  if (Number.isFinite(declared) && declared > MAX_BODY)
    throw new HttpError(413, 'payload_too_large');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY) throw new HttpError(413, 'payload_too_large');
    chunks.push(buffer);
  }
  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
    ) as unknown;
  } catch {
    throw new HttpError(400, 'malformed_json');
  }
}

export async function startApiServer(options: ApiOptions): Promise<ApiServer> {
  const service = await TaskService.open(options.dataDirectory);
  const token = randomBytes(32).toString('hex');
  const expected = Buffer.from(token);
  let port = 0;
  const allowedHosts = () => [`${HOST}:${port}`, `localhost:${port}`];
  const allowedOrigins = () => allowedHosts().map((h) => `http://${h}`);

  async function api(req: IncomingMessage, res: ServerResponse, path: string) {
    const method = req.method ?? '';
    if (path === '/api/v1/session' && method === 'GET')
      return send(res, 200, { schemaVersion: 1, token, simulatedOnly: true });
    const supplied = req.headers['x-beonforge-token'];
    if (
      typeof supplied !== 'string' ||
      supplied.length !== token.length ||
      !timingSafeEqual(Buffer.from(supplied), expected)
    )
      throw new HttpError(401, 'session_required');
    if (path === '/api/v1/executors' && method === 'GET')
      return send(res, 200, { schemaVersion: 1, executors: EXECUTORS });
    if (path === '/api/v1/tasks' && method === 'GET')
      return send(res, 200, {
        schemaVersion: 1,
        busy: service.busy,
        tasks: await service.list(),
      });
    if (path === '/api/v1/tasks' && method === 'POST')
      return send(res, 201, await service.create(await body(req)));
    const match =
      /^\/api\/v1\/tasks\/([A-Za-z0-9-]{1,64})(?:\/(run|review))?$/.exec(path);
    if (match?.[1]) {
      const [, id, action] = match;
      if (!action && method === 'GET')
        return send(res, 200, await service.get(id));
      if (action === 'run' && method === 'POST')
        return send(res, 202, await service.run(id, await body(req)));
      if (action === 'review' && method === 'POST')
        return send(res, 202, await service.review(id, await body(req)));
    }
    throw new HttpError(404, 'route_not_found');
  }

  async function asset(res: ServerResponse, path: string) {
    const root = options.webRoot;
    if (!root) throw new HttpError(404, 'route_not_found');
    let target = join(root, ...path.split('/').filter(Boolean));
    const rel = relative(root, target);
    if (
      rel.startsWith('..') ||
      isAbsolute(rel) ||
      rel.split(sep).some((p) => p.startsWith('.'))
    )
      throw new HttpError(404, 'route_not_found');
    const file = await lstat(target).catch(() => null);
    // SPA fallback: unknown extension-less routes render the app shell.
    if (!file?.isFile()) {
      if (extname(path)) throw new HttpError(404, 'route_not_found');
      target = join(root, 'index.html');
    }
    const resolved = await lstat(target).catch(() => null);
    if (!resolved?.isFile() || resolved.isSymbolicLink())
      throw new HttpError(404, 'route_not_found');
    const bytes = await readFile(target);
    res.writeHead(200, {
      ...SECURITY,
      'Content-Type': TYPES[extname(target)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Content-Length': bytes.length,
    });
    res.end(bytes);
  }

  const server = createServer((req, res) => {
    void (async () => {
      try {
        // DNS rebinding: only our own loopback authority is served.
        if (!allowedHosts().includes(req.headers.host ?? ''))
          throw new HttpError(421, 'host_rejected');
        const origin = req.headers.origin;
        if (origin !== undefined && !allowedOrigins().includes(origin))
          throw new HttpError(403, 'origin_rejected');
        const site = req.headers['sec-fetch-site'];
        if (site !== undefined && site !== 'same-origin' && site !== 'none')
          throw new HttpError(403, 'cross_site_rejected');
        const raw = req.url ?? '/';
        if (!raw.startsWith('/') || raw.includes('\\') || raw.includes('\0'))
          throw new HttpError(400, 'invalid_path');
        const path = decodeURIComponent(raw.split('?')[0] ?? '/');
        if (path.startsWith('/api/')) return await api(req, res, path);
        if (req.method !== 'GET' && req.method !== 'HEAD')
          throw new HttpError(405, 'method_not_allowed');
        return await asset(res, path);
      } catch (error) {
        if (error instanceof HttpError)
          return send(res, error.status, { error: error.message });
        if (error instanceof TaskError)
          return send(res, STATUS[error.code] ?? 500, { error: error.code });
        if (error instanceof URIError)
          return send(res, 400, { error: 'invalid_path' });
        return send(res, 500, { error: 'internal_error' });
      }
    })();
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 5000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 4317, HOST, () => resolve());
  });
  port = (server.address() as AddressInfo).port;
  return {
    url: `http://${HOST}:${port}`,
    port,
    async close() {
      const closed = new Promise<void>((resolve) =>
        server.close(() => resolve()),
      );
      server.closeAllConnections();
      await closed;
      await service.close();
    },
  };
}
