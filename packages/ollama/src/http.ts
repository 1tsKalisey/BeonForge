import { Agent, request, type IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { types } from 'node:util';

export type OllamaProbeErrorCode =
  | 'probe_invalid_options'
  | 'probe_denied'
  | 'probe_unavailable'
  | 'probe_invalid_response'
  | 'probe_response_too_large'
  | 'probe_http_error'
  | 'probe_redirect_denied'
  | 'probe_timeout'
  | 'probe_cancelled';

export class OllamaProbeError extends Error {
  constructor(readonly code: OllamaProbeErrorCode) {
    super(code);
    this.name = 'OllamaProbeError';
  }
}

export interface OllamaProbeOptions {
  readonly endpoint: string;
  /** Own, explicit permission for metadata GETs to this exact origin only. */
  readonly allowLocalProbe: true;
  /** Whole probe deadline (both requests and bodies), 1..30000 ms. Default 3000. */
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export interface OllamaProbeReport {
  readonly schemaVersion: 1;
  readonly status: 'available' | 'available_no_models';
  readonly version: string;
  /** Untrusted metadata, not an authorization or a capability assertion. */
  readonly models: readonly string[];
}

const proxyKeys = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
];

export function own(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || types.isProxy(value))
    throw new OllamaProbeError('probe_invalid_options');
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor && !Object.hasOwn(descriptor, 'value'))
    throw new OllamaProbeError('probe_invalid_options');
  return descriptor?.value as unknown;
}

export function assertAuthorized(options: unknown, endpoint: string): void {
  if (
    own(options, 'allowLocalProbe') !== true ||
    own(options, 'endpoint') !== endpoint
  )
    throw new OllamaProbeError('probe_denied');
  if (proxyKeys.some((key) => Boolean(process.env[key])))
    throw new OllamaProbeError('probe_denied');
}

export function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new OllamaProbeError('probe_invalid_response');
  return value as Record<string, unknown>;
}

export function safeText(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= max &&
    !/[\s\p{C}]/u.test(value)
  );
}

export function getJson(
  endpoint: string,
  path: '/api/version' | '/api/tags' | '/api/generate',
  signal: AbortSignal,
  agent: Agent,
  post?: { readonly body: string; readonly beforeDispatch: () => void },
): Promise<unknown> {
  assertEndpoint(endpoint);
  if (proxyKeys.some((key) => Boolean(process.env[key])))
    return Promise.reject(new OllamaProbeError('probe_denied'));
  if (
    (path === '/api/generate') !== Boolean(post) ||
    (post && Buffer.byteLength(post.body, 'utf8') > 4096)
  )
    return Promise.reject(new OllamaProbeError('probe_invalid_options'));
  const maxBytes = post ? 64 * 1024 : 256 * 1024;
  return new Promise((resolve, reject) => {
    let settled = false;
    let response: IncomingMessage | undefined;
    let upgraded: Duplex | undefined;
    const chunks: Buffer[] = [];
    let size = 0;
    // Abort settles directly: destroying a request need not emit another event
    // (notably after HTTP 101 has transferred ownership of its socket).
    function finish(error?: Error, value?: unknown): void {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      response?.off('data', onData);
      response?.off('end', onEnd);
      chunks.length = 0;
      if (error) reject(error);
      else resolve(value);
      req.destroy();
      response?.destroy();
      upgraded?.destroy();
      // Error guards live until close, including asynchronous destroy errors.
    }
    function fail(code: OllamaProbeErrorCode): void {
      finish(new OllamaProbeError(code));
    }
    function onAbort(): void {
      finish(
        signal.reason instanceof OllamaProbeError
          ? signal.reason
          : new OllamaProbeError('probe_cancelled'),
      );
    }
    function onData(chunk: Buffer): void {
      size += chunk.length;
      if (size > maxBytes) fail('probe_response_too_large');
      else chunks.push(chunk);
    }
    function onEnd(): void {
      if (!response?.complete) return fail('probe_invalid_response');
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(
          Buffer.concat(chunks),
        );
        finish(undefined, JSON.parse(text) as unknown);
      } catch {
        fail('probe_invalid_response');
      }
    }
    function onResponseError(): void {
      fail('probe_invalid_response');
    }
    function onResponseClose(): void {
      if (!response?.complete) fail('probe_invalid_response');
      response?.off('error', onResponseError);
      response?.off('close', onResponseClose);
    }
    function onResponse(res: IncomingMessage): void {
      response = res;
      res.on('error', onResponseError);
      res.once('close', onResponseClose);
      if (settled) {
        res.destroy();
        return;
      }
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400) return fail('probe_redirect_denied');
      if (status !== 200) return fail('probe_http_error');
      if (
        !/^application\/json(?:\s*;|$)/i.test(
          res.headers['content-type'] ?? '',
        ) ||
        (res.headers['content-encoding'] &&
          res.headers['content-encoding'] !== 'identity')
      )
        return fail('probe_invalid_response');
      const length = res.headers['content-length'];
      if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes))
        return fail('probe_response_too_large');
      res.on('data', onData);
      res.once('end', onEnd);
    }
    function onRequestError(error: NodeJS.ErrnoException): void {
      fail(
        response || error.code?.startsWith('HPE_')
          ? 'probe_invalid_response'
          : 'probe_unavailable',
      );
    }
    function onRequestClose(): void {
      if (!settled && !response?.complete)
        fail(response ? 'probe_invalid_response' : 'probe_unavailable');
      req.off('error', onRequestError);
      req.off('response', onResponse);
      req.off('upgrade', onUpgrade);
      req.off('close', onRequestClose);
    }
    function onUpgrade(_res: IncomingMessage, socket: Duplex): void {
      upgraded = socket;
      socket.on('error', onResponseError);
      socket.once('close', () => socket.off('error', onResponseError));
      fail('probe_invalid_response');
      socket.destroy();
    }
    const req = request(new URL(path, endpoint), {
      method: post ? 'POST' : 'GET',
      agent,
      insecureHTTPParser: false,
      maxHeaderSize: 8192,
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'identity',
        ...(post
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(post.body, 'utf8'),
            }
          : {}),
      },
    });
    req.once('response', onResponse);
    req.once('upgrade', onUpgrade);
    req.on('error', onRequestError);
    req.once('close', onRequestClose);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    else {
      try {
        post?.beforeDispatch();
        req.end(post?.body);
      } catch (error) {
        finish(
          error instanceof Error
            ? error
            : new OllamaProbeError('probe_invalid_options'),
        );
      }
    }
  });
}

export function assertEndpoint(endpoint: unknown): asserts endpoint is string {
  if (
    typeof endpoint !== 'string' ||
    endpoint.trim() !== endpoint ||
    !/^http:\/\/(?:127\.0\.0\.1|\[::1\]):[1-9]\d{0,4}$/.test(endpoint)
  )
    throw new OllamaProbeError('probe_denied');
  let origin: URL;
  try {
    origin = new URL(endpoint);
  } catch {
    throw new OllamaProbeError('probe_denied');
  }
  if (Number(origin.port || '80') > 65535)
    throw new OllamaProbeError('probe_denied');
}
