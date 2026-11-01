import { Agent } from 'node:http';
import {
  own,
  assertEndpoint,
  assertAuthorized,
  object,
  safeText,
  getJson,
  OllamaProbeError,
  type OllamaProbeOptions,
  type OllamaProbeReport,
} from './http.js';
export {
  OllamaProbeError,
  type OllamaProbeErrorCode,
  type OllamaProbeOptions,
  type OllamaProbeReport,
} from './http.js';

/** Metadata only. No filesystem/CAS, credentials, inference, model lifecycle or retries. */
export async function probeOllama(
  options: OllamaProbeOptions,
): Promise<OllamaProbeReport> {
  const endpoint = own(options, 'endpoint');
  assertEndpoint(endpoint);
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
    controller.abort(new OllamaProbeError(abortCode));
  };
  const signal = callerSignal;
  if (signal?.aborted) throw new OllamaProbeError('probe_cancelled');
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => {
    abortCode ??= 'probe_timeout';
    controller.abort(new OllamaProbeError(abortCode));
  }, timeout);
  // Explicitly empty proxy environment, independent of global agent/proxy settings.
  const agent = new Agent({ keepAlive: false, proxyEnv: {} });
  try {
    const report = await probeMetadata(options, controller.signal, agent);
    if (abortCode) throw new OllamaProbeError(abortCode);
    return report;
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

/** Internal preflight shares live metadata permission and the caller deadline. */
export async function probeMetadata(
  options: unknown,
  signal: AbortSignal,
  agent: Agent,
): Promise<OllamaProbeReport> {
  const endpoint = own(options, 'endpoint');
  assertEndpoint(endpoint);
  assertAuthorized(options, endpoint);
  const version = object(
    await getJson(endpoint, '/api/version', signal, agent),
  ).version;
  if (!safeText(version, 128))
    throw new OllamaProbeError('probe_invalid_response');
  assertAuthorized(options, endpoint);
  const models = object(
    await getJson(endpoint, '/api/tags', signal, agent),
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
  return {
    schemaVersion: 1,
    status: names.length ? 'available' : 'available_no_models',
    version,
    models: names,
  };
}
