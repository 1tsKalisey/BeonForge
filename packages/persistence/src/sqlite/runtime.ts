import { PersistenceError } from '../event-store.js';

/** Exact evaluated baseline; future runtime upgrades require explicit validation. */
export function requireRuntime(
  nodeVersion: string,
  sqliteVersion?: string,
): void {
  if (
    nodeVersion !== '24.19.0' ||
    (sqliteVersion !== undefined && sqliteVersion !== '3.53.3')
  ) {
    throw new PersistenceError('unsupported_runtime');
  }
}
