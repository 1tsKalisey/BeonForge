import { Agent, request } from 'node:http';
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

const MAX_BYTES = 256 * 1024;
const proxyKeys = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
];

function own(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || types.isProxy(value))
    throw new OllamaProbeError('probe_invalid_options');
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor && !Object.hasOwn(descriptor, 'value'))
    throw new OllamaProbeError('probe_invalid_options');
  return descriptor?.value as unknown;
}

function assertAuthorized(options: unknown, endpoint: string): void {
  if (
    own(options, 'allowLocalProbe') !== true ||
    own(options, 'endpoint') !== endpoint
  )
    throw new OllamaProbeError('probe_denied');
  if (proxyKeys.some((key) => Boolean(process.env[key])))
    throw new OllamaProbeError('probe_denied');
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new OllamaProbeError('probe_invalid_response');
  return value as Record<string, unknown>;
}

function safeText(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= max &&
    !/[\s\p{C}]/u.test(value)
  );
}

function getJson(
  endpoint: string,
  path: '/api/version' | '/api/tags',
  signal: AbortSignal,
  agent: Agent,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const fail = (code: OllamaProbeErrorCode) =>
      reject(new OllamaProbeError(code));
    const req = request(
      new URL(path, endpoint),
      {
        method: 'GET',
        agent,
        signal,
        maxHeaderSize: 8192,
        headers: { Accept: 'application/json', 'Accept-Encoding': 'identity' },
      },
      (res) => {
        const stop = (code: OllamaProbeErrorCode) => {
          fail(code);
          res.destroy();
          req.destroy();
        };
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) return stop('probe_redirect_denied');
        if (status !== 200) return stop('probe_http_error');
        if (
          !/^application\/json(?:\s*;|$)/i.test(
            res.headers['content-type'] ?? '',
          ) ||
          (res.headers['content-encoding'] &&
            res.headers['content-encoding'] !== 'identity')
        )
          return stop('probe_invalid_response');
        const length = res.headers['content-length'];
        if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES))
          return stop('probe_response_too_large');
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) stop('probe_response_too_large');
          else chunks.push(chunk);
        });
        res.on('error', () => fail('probe_invalid_response'));
        res.on('end', () => {
          try {
            const text = new TextDecoder('utf-8', { fatal: true }).decode(
              Buffer.concat(chunks),
            );
            resolve(JSON.parse(text) as unknown);
          } catch {
            fail('probe_invalid_response');
          }
        });
      },
    );
    req.on('error', (error: NodeJS.ErrnoException) =>
      fail(
        error.code?.startsWith('HPE_')
          ? 'probe_invalid_response'
          : 'probe_unavailable',
      ),
    );
    req.end();
  });
}

/** Metadata only. No filesystem/CAS, credentials, inference, model lifecycle or retries. */
export async function probeOllama(
  options: OllamaProbeOptions,
): Promise<OllamaProbeReport> {
  const endpoint = own(options, 'endpoint');
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
  assertAuthorized(options, endpoint);
  const timeout = own(options, 'timeoutMs') ?? 3000;
  const callerSignal = own(options, 'signal');
  if (
    typeof timeout !== 'number' ||
    !Number.isSafeInteger(timeout) ||
    timeout < 1 ||
    timeout > 30000 ||
    (callerSignal !== undefined && !(callerSignal instanceof AbortSignal))
  )
    throw new OllamaProbeError('probe_invalid_options');
  const controller = new AbortController();
  let abortCode: 'probe_timeout' | 'probe_cancelled' | undefined;
  const abort = () => {
    abortCode ??= 'probe_cancelled';
    controller.abort();
  };
  const signal = callerSignal;
  if (signal?.aborted) throw new OllamaProbeError('probe_cancelled');
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => {
    abortCode ??= 'probe_timeout';
    controller.abort();
  }, timeout);
  // Explicitly empty proxy environment, independent of global agent/proxy settings.
  const agent = new Agent({ keepAlive: false, proxyEnv: {} });
  try {
    const version = object(
      await getJson(endpoint, '/api/version', controller.signal, agent),
    ).version;
    if (!safeText(version, 128))
      throw new OllamaProbeError('probe_invalid_response');
    assertAuthorized(options, endpoint);
    const models = object(
      await getJson(endpoint, '/api/tags', controller.signal, agent),
    ).models;
    if (!Array.isArray(models) || models.length > 1024)
      throw new OllamaProbeError('probe_invalid_response');
    const names = models.map((entry: unknown) => {
      const name = object(entry).name;
      if (!safeText(name, 256))
        throw new OllamaProbeError('probe_invalid_response');
      return name;
    });
    if (new Set(names).size !== names.length)
      throw new OllamaProbeError('probe_invalid_response');
    assertAuthorized(options, endpoint);
    if (abortCode) throw new OllamaProbeError(abortCode);
    return {
      schemaVersion: 1,
      status: names.length ? 'available' : 'available_no_models',
      version,
      models: names,
    };
  } catch (error) {
    if (abortCode) throw new OllamaProbeError(abortCode);
    if (error instanceof OllamaProbeError) throw error;
    throw new OllamaProbeError('probe_invalid_response');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    agent.destroy();
  }
}
