import type {
  BlockExecutionEvent,
  ArtifactReference,
} from '@beonforge/contracts';
import type { WorkflowCheckpoint, RecoveryLocation } from '../recovery.js';
import type {
  AttemptIdentity,
  AttemptProjection,
  PersistenceErrorCode,
  StoredEvent,
} from '../event-store.js';

/** Private channel between owned worker and client, never an external RPC endpoint. */
export type Command =
  | { kind: 'append'; event: BlockExecutionEvent; idempotencyKey: string }
  | { kind: 'events' }
  | { kind: 'attempt'; identity: AttemptIdentity }
  | { kind: 'rebuild' }
  | { kind: 'put-artifact'; bytes: Uint8Array }
  | { kind: 'read-artifact'; reference: ArtifactReference }
  | { kind: 'create-checkpoint'; checkpointId: string }
  | { kind: 'load-checkpoint'; checkpointId: string }
  | { kind: 'backup'; destinationParent: string }
  | {
      kind: 'restore';
      backupDirectory: string;
      destinationParent: string;
      protectedDirectories: readonly string[];
    }
  | { kind: 'close' };
export interface Request {
  id: number;
  command: Command;
}
export type Reply =
  | { kind: 'appended'; record: StoredEvent }
  | { kind: 'events'; records: readonly StoredEvent[] }
  | { kind: 'attempt'; projection: AttemptProjection | null }
  | { kind: 'rebuilt' }
  | { kind: 'artifact'; reference: ArtifactReference }
  | { kind: 'bytes'; bytes: Uint8Array }
  | { kind: 'checkpoint'; checkpoint: WorkflowCheckpoint | null }
  | { kind: 'location'; location: RecoveryLocation }
  | { kind: 'closed' };
export type Response =
  | { kind: 'ready' }
  | { kind: 'init-error'; code: PersistenceErrorCode }
  | { kind: 'response'; id: number; reply: Reply }
  | { kind: 'error'; id: number; code: PersistenceErrorCode };
