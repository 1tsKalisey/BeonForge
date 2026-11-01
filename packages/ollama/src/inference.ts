import { createHash } from 'node:crypto';
import { Agent } from 'node:http';
import { types } from 'node:util';
import {
  assertEndpoint,
  assertAuthorized,
  getJson,
  own,
  object,
  OllamaProbeError,
  type OllamaProbeErrorCode,
} from './http.js';
import { probeMetadata } from './probe.js';

export type SyntheticInferenceErrorCode =
  | OllamaProbeErrorCode
  | 'inference_invalid_options'
  | 'inference_invalid_preview'
  | 'inference_denied'
  | 'model_not_installed'
  | 'inference_invalid_output'
  | 'inference_timeout'
  | 'inference_cancelled'
  | 'inference_failure';

export class SyntheticInferenceError extends Error {
  constructor(
    readonly code: SyntheticInferenceErrorCode,
    /** True means handed to transport; not proof that the server received it. */
    readonly requestDispatched = false,
    readonly outcome:
      'not_dispatched' | 'unknown' | 'confirmed' = 'not_dispatched',
  ) {
    super(code);
    this.name = 'SyntheticInferenceError';
  }
}

const limits = Object.freeze({
  requestBytes: 4096,
  responseBytes: 65536,
  generatedBytes: 4096,
});
const prompt = 'Return only the JSON object {"answer":4}. What is 2+2?';

export interface SyntheticInferencePreviewV1 {
  readonly schemaVersion: 1;
  readonly classification: 'synthetic-public-v1';
  readonly endpoint: string;
  readonly model: string;
  readonly payload: string;
  readonly payloadSha256: string;
  readonly limits: typeof limits;
}

export interface SyntheticInferenceGrant {
  readonly canInfer: true;
  readonly allowLocalProbe: true;
  readonly endpoint: string;
  readonly model: string;
  readonly payloadSha256: string;
}

export interface SyntheticInferenceReportV1 {
  readonly schemaVersion: 1;
  readonly classification: 'synthetic-public-v1';
  readonly model: string;
  readonly payloadSha256: string;
  readonly answer: 4;
  readonly requestDispatched: true;
  readonly outcome: 'confirmed';
}

function exactKeys(value: unknown, keys: readonly string[]): void {
  // own also rejects null/Proxy without invoking application getters.
  own(value, keys[0] ?? '');
  const actual = Reflect.ownKeys(value as object);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    throw new SyntheticInferenceError('inference_invalid_options');
}

/** Pure, fixed public fixture. No network, user prompt, file, CAS or inference. */
export function prepareSyntheticInference(options: {
  readonly endpoint: string;
  readonly model: string;
}): SyntheticInferencePreviewV1 {
  try {
    exactKeys(options, ['endpoint', 'model']);
    const endpoint = own(options, 'endpoint');
    const model = own(options, 'model');
    assertEndpoint(endpoint);
    if (
      typeof model !== 'string' ||
      model.length > 256 ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)?(?::[A-Za-z0-9][A-Za-z0-9._-]*)?$/.test(
        model,
      ) ||
      /(?:^|[/:._-])cloud(?:$|[/:._-])/i.test(model) ||
      model.trim() !== model
    )
      throw new SyntheticInferenceError('inference_invalid_options');
    const payload = JSON.stringify({
      model,
      prompt,
      stream: false,
      format: 'json',
      options: { temperature: 0, num_predict: 64, num_ctx: 1024 },
    });
    if (
      Buffer.byteLength(prompt, 'utf8') > 1024 ||
      Buffer.byteLength(payload, 'utf8') > limits.requestBytes
    )
      throw new SyntheticInferenceError('inference_invalid_options');
    return Object.freeze({
      schemaVersion: 1,
      classification: 'synthetic-public-v1',
      endpoint,
      model,
      payload,
      payloadSha256: createHash('sha256').update(payload, 'utf8').digest('hex'),
      limits,
    });
  } catch (error) {
    if (error instanceof SyntheticInferenceError) throw error;
    throw new SyntheticInferenceError(
      error instanceof OllamaProbeError && error.code === 'probe_denied'
        ? 'inference_denied'
        : 'inference_invalid_options',
    );
  }
}

function validatePreview(value: unknown): SyntheticInferencePreviewV1 {
  try {
    const expected = prepareSyntheticInference({
      endpoint: own(value, 'endpoint') as string,
      model: own(value, 'model') as string,
    });
    exactKeys(value, Object.keys(expected));
    for (const key of [
      'schemaVersion',
      'classification',
      'endpoint',
      'model',
      'payload',
      'payloadSha256',
    ] as const)
      if (own(value, key) !== expected[key]) throw new Error('invalid');
    const valueLimits = own(value, 'limits');
    exactKeys(valueLimits, Object.keys(limits));
    for (const key of [
      'requestBytes',
      'responseBytes',
      'generatedBytes',
    ] as const)
      if (own(valueLimits, key) !== limits[key]) throw new Error('invalid');
    return expected;
  } catch {
    throw new SyntheticInferenceError('inference_invalid_preview');
  }
}

function authorize(
  grant: unknown,
  expected: SyntheticInferencePreviewV1,
): void {
  if (
    own(grant, 'canInfer') !== true ||
    own(grant, 'allowLocalProbe') !== true ||
    own(grant, 'endpoint') !== expected.endpoint ||
    own(grant, 'model') !== expected.model ||
    own(grant, 'payloadSha256') !== expected.payloadSha256
  )
    throw new SyntheticInferenceError('inference_denied');
  assertAuthorized(grant, expected.endpoint);
}

export async function runSyntheticInference(
  preview: SyntheticInferencePreviewV1,
  grant: SyntheticInferenceGrant,
  options: { readonly timeoutMs?: number; readonly signal?: AbortSignal } = {},
): Promise<SyntheticInferenceReportV1> {
  let dispatched = false;
  let confirmed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let callerSignal: AbortSignal | undefined;
  let agent: Agent | undefined;
  let abortCode: 'inference_cancelled' | 'inference_timeout' | undefined;
  const controller = new AbortController();
  const cancel = () => {
    abortCode ??= 'inference_cancelled';
    controller.abort(new OllamaProbeError('probe_cancelled'));
  };
  try {
    const expected = validatePreview(preview);
    authorize(grant, expected);
    const timeout = own(options, 'timeoutMs') ?? 30000;
    const signal = own(options, 'signal');
    if (
      typeof timeout !== 'number' ||
      !Number.isSafeInteger(timeout) ||
      timeout < 1 ||
      timeout > 120000 ||
      (signal !== undefined &&
        (types.isProxy(signal) || !(signal instanceof AbortSignal)))
    )
      throw new SyntheticInferenceError('inference_invalid_options');
    callerSignal = signal;
    if (callerSignal?.aborted) {
      cancel();
      throw new SyntheticInferenceError('inference_cancelled');
    }
    callerSignal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => {
      abortCode ??= 'inference_timeout';
      controller.abort(new OllamaProbeError('probe_timeout'));
    }, timeout);
    agent = new Agent({ keepAlive: false, proxyEnv: {} });
    const installed = await probeMetadata(grant, controller.signal, agent);
    if (!installed.models.includes(expected.model))
      throw new SyntheticInferenceError('model_not_installed');
    const body = object(
      await getJson(
        expected.endpoint,
        '/api/generate',
        controller.signal,
        agent,
        {
          body: expected.payload,
          beforeDispatch() {
            const current = validatePreview(preview);
            if (
              current.payloadSha256 !== expected.payloadSha256 ||
              current.endpoint !== expected.endpoint ||
              current.model !== expected.model
            )
              throw new SyntheticInferenceError('inference_invalid_preview');
            authorize(grant, expected);
            dispatched = true;
          },
        },
      ),
    );
    if (
      Object.hasOwn(body, 'done') &&
      body.done === true &&
      Object.hasOwn(body, 'model') &&
      body.model === expected.model
    )
      confirmed = true;
    if (
      !confirmed ||
      !Object.hasOwn(body, 'response') ||
      typeof body.response !== 'string' ||
      Buffer.byteLength(body.response, 'utf8') > limits.generatedBytes
    )
      throw new SyntheticInferenceError('inference_invalid_output');
    let answer: unknown;
    try {
      answer = JSON.parse(body.response) as unknown;
    } catch {
      throw new SyntheticInferenceError('inference_invalid_output');
    }
    if (
      typeof answer !== 'object' ||
      answer === null ||
      Array.isArray(answer) ||
      Object.keys(answer).length !== 1 ||
      !Object.hasOwn(answer, 'answer') ||
      (answer as { answer: unknown }).answer !== 4
    )
      throw new SyntheticInferenceError('inference_invalid_output');
    authorize(grant, expected);
    if (abortCode) throw new SyntheticInferenceError(abortCode);
    return {
      schemaVersion: 1,
      classification: 'synthetic-public-v1',
      model: expected.model,
      payloadSha256: expected.payloadSha256,
      answer: 4,
      requestDispatched: true,
      outcome: 'confirmed',
    };
  } catch (error) {
    let code: SyntheticInferenceErrorCode = 'inference_failure';
    if (abortCode) code = abortCode;
    else if (error instanceof SyntheticInferenceError) code = error.code;
    else if (error instanceof OllamaProbeError)
      code =
        error.code === 'probe_invalid_options'
          ? 'inference_invalid_options'
          : error.code === 'probe_denied'
            ? 'inference_denied'
            : error.code;
    throw new SyntheticInferenceError(
      code,
      dispatched,
      confirmed ? 'confirmed' : dispatched ? 'unknown' : 'not_dispatched',
    );
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', cancel);
    agent?.destroy();
  }
}
