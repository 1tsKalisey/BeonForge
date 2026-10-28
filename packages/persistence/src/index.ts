export { PersistenceError } from './event-store.js';
export type {
  EventStore,
  StoredEvent,
  AttemptIdentity,
  AttemptProjection,
  PersistenceErrorCode,
} from './event-store.js';
export { openSqliteEventStore } from './sqlite/client.js';
