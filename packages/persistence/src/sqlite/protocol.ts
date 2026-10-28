import type { BlockExecutionEvent } from '@beonforge/contracts';
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
  | { kind: 'closed' };
export type Response =
  | { kind: 'ready' }
  | { kind: 'init-error'; code: PersistenceErrorCode }
  | { kind: 'response'; id: number; reply: Reply }
  | { kind: 'error'; id: number; code: PersistenceErrorCode };
