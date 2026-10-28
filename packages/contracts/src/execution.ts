import { CONTRACT_SCHEMA_VERSION } from './schema-version.js';

/** Embedded in a versioned envelope. No paths, URIs or inline sensitive output. */
export interface ArtifactReference {
  readonly sha256: string;
  readonly byteLength: number;
}

/** Identifies deterministic work; declares effects but grants no permission. */
export interface BlockManifest {
  readonly schemaVersion: typeof CONTRACT_SCHEMA_VERSION;
  readonly blockId: string;
  readonly handler: string;
  readonly handlerVersion: number;
  readonly inputs: readonly ArtifactReference[];
  readonly effects: 'none' | 'external';
}

/** Safe summary only. Raw errors, tool output and secrets belong outside the wire error. */
export interface BlockExecutionError {
  readonly code:
    | 'invalid_input'
    | 'permission_denied'
    | 'execution_failed'
    | 'timeout'
    | 'interrupted';
  readonly message: string;
}

interface AttemptRecord {
  readonly schemaVersion: typeof CONTRACT_SCHEMA_VERSION;
  readonly runId: string;
  readonly blockId: string;
  readonly attemptId: string;
  readonly evidence: readonly ArtifactReference[];
}

/**
 * Report about one attempt, not a task-state transition or approval. A successful
 * attempt may still leave the task awaiting approval. Failed/cancelled must only
 * be reported when effects are known; otherwise report uncertain. No automatic
 * retry is authorized by an error code or outcome.
 */
export type BlockResult = AttemptRecord &
  (
    | { readonly status: 'succeeded' | 'cancelled' }
    | {
        readonly status: 'failed' | 'uncertain';
        readonly error: BlockExecutionError;
      }
  );

interface EventEnvelope {
  readonly schemaVersion: typeof CONTRACT_SCHEMA_VERSION;
  readonly eventId: string;
  /** Unix epoch milliseconds. Ordering/uniqueness are persistence responsibilities. */
  readonly occurredAt: number;
}

/**
 * Facts emitted at the execution boundary. Persistence owns append/transactions,
 * deduplication and replay; policy owns authorization; adapters own external
 * effects. A started event without a finished event is not proof of no effect.
 */
export type BlockExecutionEvent = EventEnvelope &
  (
    | {
        readonly type: 'block.started';
        readonly runId: string;
        readonly attemptId: string;
        readonly manifest: BlockManifest;
      }
    | { readonly type: 'block.finished'; readonly result: BlockResult }
  );

/** Diagnostics never interpolate untrusted values, keys or error messages. */
export class ContractValidationError extends Error {
  constructor(
    public readonly code: 'invalid_contract' | 'unsupported_schema_version',
    public readonly field: string,
  ) {
    super(`${code}: ${field}`);
    this.name = 'ContractValidationError';
  }
}

function invalid(field: string): never {
  throw new ContractValidationError('invalid_contract', field);
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalid(field);
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    return invalid(field);
  return value as Record<string, unknown>;
}

function keys(
  value: Record<string, unknown>,
  expected: readonly string[],
  field: string,
): void {
  const actual = Object.keys(value);
  if (
    actual.length !== expected.length ||
    actual.some((key) => !expected.includes(key))
  ) {
    invalid(field);
  }
}

function version(value: Record<string, unknown>, field: string): void {
  if (!Object.hasOwn(value, 'schemaVersion')) invalid(`${field}.schemaVersion`);
  if (value.schemaVersion !== CONTRACT_SCHEMA_VERSION) {
    throw new ContractValidationError(
      'unsupported_schema_version',
      `${field}.schemaVersion`,
    );
  }
}

function identifier(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  ) {
    return invalid(field);
  }
  return value;
}

function integer(value: unknown, field: string, minimum: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum
  ) {
    return invalid(field);
  }
  return value;
}

function artifact(value: unknown, field: string): ArtifactReference {
  const data = record(value, field);
  keys(data, ['sha256', 'byteLength'], field);
  if (
    typeof data.sha256 !== 'string' ||
    data.sha256.length !== 64 ||
    !/^[a-f0-9]{64}$/.test(data.sha256)
  ) {
    return invalid(`${field}.sha256`);
  }
  return {
    sha256: data.sha256,
    byteLength: integer(data.byteLength, `${field}.byteLength`, 0),
  };
}

function artifacts(
  value: unknown,
  field: string,
): readonly ArtifactReference[] {
  if (!Array.isArray(value)) return invalid(field);
  // Array.from also visits sparse slots; holes must fail validation.
  return Array.from(value as unknown[], (item) => artifact(item, field));
}

function executionError(value: unknown): BlockExecutionError {
  const data = record(value, 'error');
  keys(data, ['code', 'message'], 'error');
  const code = data.code;
  if (
    code !== 'invalid_input' &&
    code !== 'permission_denied' &&
    code !== 'execution_failed' &&
    code !== 'timeout' &&
    code !== 'interrupted'
  ) {
    return invalid('error.code');
  }
  if (
    typeof data.message !== 'string' ||
    data.message.trim().length === 0 ||
    data.message.length > 1024
  ) {
    return invalid('error.message');
  }
  return { code, message: data.message };
}

/** Parse JSON-like data into detached records; no IO, redaction or hash verification. */
export function parseArtifactReference(value: unknown): ArtifactReference {
  return artifact(value, 'artifact');
}

export function parseBlockManifest(value: unknown): BlockManifest {
  const data = record(value, 'manifest');
  version(data, 'manifest');
  keys(
    data,
    [
      'schemaVersion',
      'blockId',
      'handler',
      'handlerVersion',
      'inputs',
      'effects',
    ],
    'manifest',
  );
  if (data.effects !== 'none' && data.effects !== 'external')
    return invalid('manifest.effects');
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    blockId: identifier(data.blockId, 'manifest.blockId'),
    handler: identifier(data.handler, 'manifest.handler'),
    handlerVersion: integer(data.handlerVersion, 'manifest.handlerVersion', 1),
    inputs: artifacts(data.inputs, 'manifest.inputs'),
    effects: data.effects,
  };
}

export function parseBlockResult(value: unknown): BlockResult {
  const data = record(value, 'result');
  version(data, 'result');
  const status = data.status;
  if (
    status !== 'succeeded' &&
    status !== 'failed' &&
    status !== 'cancelled' &&
    status !== 'uncertain'
  ) {
    return invalid('result.status');
  }
  const expected = [
    'schemaVersion',
    'runId',
    'blockId',
    'attemptId',
    'evidence',
    'status',
  ];
  keys(
    data,
    status === 'failed' || status === 'uncertain'
      ? [...expected, 'error']
      : expected,
    'result',
  );
  const base: AttemptRecord = {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    runId: identifier(data.runId, 'result.runId'),
    blockId: identifier(data.blockId, 'result.blockId'),
    attemptId: identifier(data.attemptId, 'result.attemptId'),
    evidence: artifacts(data.evidence, 'result.evidence'),
  };
  if (status === 'failed' || status === 'uncertain') {
    return { ...base, status, error: executionError(data.error) };
  }
  return { ...base, status };
}

export function parseBlockExecutionEvent(value: unknown): BlockExecutionEvent {
  const data = record(value, 'event');
  version(data, 'event');
  const base: EventEnvelope = {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    eventId: identifier(data.eventId, 'event.eventId'),
    occurredAt: integer(data.occurredAt, 'event.occurredAt', 0),
  };
  if (data.type === 'block.started') {
    keys(
      data,
      [
        'schemaVersion',
        'eventId',
        'occurredAt',
        'type',
        'runId',
        'attemptId',
        'manifest',
      ],
      'event',
    );
    return {
      ...base,
      type: data.type,
      runId: identifier(data.runId, 'event.runId'),
      attemptId: identifier(data.attemptId, 'event.attemptId'),
      manifest: parseBlockManifest(data.manifest),
    };
  }
  if (data.type === 'block.finished') {
    keys(
      data,
      ['schemaVersion', 'eventId', 'occurredAt', 'type', 'result'],
      'event',
    );
    return { ...base, type: data.type, result: parseBlockResult(data.result) };
  }
  return invalid('event.type');
}
