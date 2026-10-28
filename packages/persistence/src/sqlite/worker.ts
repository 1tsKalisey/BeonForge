import { parentPort, workerData } from 'node:worker_threads';
import { SqliteDatabase, normalizeError } from './database.js';
import { createBackup, restoreBackup } from './backup.js';
import { PersistenceError } from '../event-store.js';
import type { Command, Reply, Request, Response } from './protocol.js';

if (!parentPort) throw new Error('Owned worker required');
const port = parentPort;
const data: unknown = workerData;
let database: SqliteDatabase | undefined;

async function execute(command: Command): Promise<Reply> {
  if (command.kind === 'close') {
    database?.close();
    return { kind: 'closed' };
  }
  if (command.kind === 'restore') {
    if (database) throw new PersistenceError('invalid_input');
    return {
      kind: 'location',
      location: await restoreBackup(
        command.backupDirectory,
        command.destinationParent,
        command.protectedDirectories,
      ),
    };
  }
  if (!database) throw new PersistenceError('closed');
  switch (command.kind) {
    case 'append':
      return {
        kind: 'appended',
        record: database.append(command.event, command.idempotencyKey),
      };
    case 'events':
      return { kind: 'events', records: database.events() };
    case 'attempt':
      return {
        kind: 'attempt',
        projection: database.attempt(command.identity),
      };
    case 'rebuild':
      database.rebuild();
      return { kind: 'rebuilt' };
    case 'put-artifact':
      return {
        kind: 'artifact',
        reference: database.artifacts.put(command.bytes),
      };
    case 'read-artifact':
      return {
        kind: 'bytes',
        bytes: database.artifacts.read(command.reference),
      };
    case 'create-checkpoint':
      return {
        kind: 'checkpoint',
        checkpoint: database.createCheckpoint(command.checkpointId),
      };
    case 'load-checkpoint':
      return {
        kind: 'checkpoint',
        checkpoint: database.loadCheckpoint(command.checkpointId),
      };
    case 'backup':
      return {
        kind: 'location',
        location: await createBackup(database, command.destinationParent),
      };
  }
}

try {
  if (typeof data !== 'object' || data === null)
    throw new PersistenceError('invalid_input');
  if (!('restoreOnly' in data) || data.restoreOnly !== true) {
    if (!('path' in data) || typeof data.path !== 'string')
      throw new PersistenceError('invalid_input');
    const artifactRoot =
      'artifactRoot' in data && typeof data.artifactRoot === 'string'
        ? data.artifactRoot
        : undefined;
    database = new SqliteDatabase(data.path, artifactRoot);
  }
  port.postMessage({ kind: 'ready' } satisfies Response);
  // Serialize complete commands, including asynchronous SQLite backup().
  let queue = Promise.resolve();
  port.on('message', (request: Request) => {
    queue = queue
      .then(async () => {
        try {
          const reply = await execute(request.command);
          port.postMessage({
            kind: 'response',
            id: request.id,
            reply,
          } satisfies Response);
          if (request.command.kind === 'close') port.close();
        } catch (error) {
          port.postMessage({
            kind: 'error',
            id: request.id,
            code: normalizeError(error).code,
          } satisfies Response);
        }
      })
      .catch(() => port.close());
  });
} catch (error) {
  port.postMessage({
    kind: 'init-error',
    code: normalizeError(error).code,
  } satisfies Response);
  port.close();
}
