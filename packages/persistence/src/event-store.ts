import type {
  BlockExecutionEvent,
  BlockManifest,
  BlockResult,
} from '@beonforge/contracts';

export interface StoredEvent {
  readonly sequence: number;
  readonly idempotencyKey: string;
  readonly event: BlockExecutionEvent;
}

export interface AttemptIdentity {
  readonly runId: string;
  readonly blockId: string;
  readonly attemptId: string;
}

export interface AttemptProjection extends AttemptIdentity {
  readonly manifest: BlockManifest;
  /** pending means a confirmed start with no confirmed outcome, never permission to retry. */
  readonly status: 'pending' | BlockResult['status'];
  readonly result: BlockResult | null;
  readonly lastSequence: number;
}

/** No SQL, filesystem, scheduling or provider dependencies in this boundary. */
export interface EventStore {
  append(
    event: BlockExecutionEvent,
    idempotencyKey: string,
  ): Promise<StoredEvent>;
  readEvents(): Promise<readonly StoredEvent[]>;
  getAttempt(identity: AttemptIdentity): Promise<AttemptProjection | null>;
  rebuildProjection(): Promise<void>;
  close(): Promise<void>;
}

export type PersistenceErrorCode =
  | 'invalid_input'
  | 'unsupported_runtime'
  | 'incompatible_database'
  | 'idempotency_conflict'
  | 'invalid_sequence'
  | 'busy'
  | 'queue_timeout'
  | 'storage_failure'
  | 'outcome_unknown'
  | 'closed'
  | 'unsafe_path'
  | 'artifact_missing'
  | 'unexpected_artifact_entry'
  | 'integrity_failure';

/** Fixed diagnostic only; no SQL, paths, event payloads or raw driver errors. */
export class PersistenceError extends Error {
  constructor(public readonly code: PersistenceErrorCode) {
    super(code);
    this.name = 'PersistenceError';
  }
}
