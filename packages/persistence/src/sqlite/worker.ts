import { parentPort, workerData } from 'node:worker_threads';
import { SqliteDatabase, normalizeError } from './database.js';
import type { Reply, Request, Response } from './protocol.js';

if (!parentPort) throw new Error('Owned worker required');
const port = parentPort;
const data: unknown = workerData;
let database: SqliteDatabase;
try {
  if (
    typeof data !== 'object' ||
    data === null ||
    !('path' in data) ||
    typeof data.path !== 'string'
  )
    throw new Error('Invalid owned worker configuration');
  database = new SqliteDatabase(data.path);
  port.postMessage({ kind: 'ready' } satisfies Response);
  port.on('message', (request: Request) => {
    try {
      const command = request.command;
      let reply: Reply;
      switch (command.kind) {
        case 'append':
          reply = {
            kind: 'appended',
            record: database.append(command.event, command.idempotencyKey),
          };
          break;
        case 'events':
          reply = { kind: 'events', records: database.events() };
          break;
        case 'attempt':
          reply = {
            kind: 'attempt',
            projection: database.attempt(command.identity),
          };
          break;
        case 'rebuild':
          database.rebuild();
          reply = { kind: 'rebuilt' };
          break;
        case 'close':
          database.close();
          reply = { kind: 'closed' };
          break;
      }
      port.postMessage({
        kind: 'response',
        id: request.id,
        reply,
      } satisfies Response);
      if (command.kind === 'close') port.close();
    } catch (error) {
      port.postMessage({
        kind: 'error',
        id: request.id,
        code: normalizeError(error).code,
      } satisfies Response);
    }
  });
} catch (error) {
  port.postMessage({
    kind: 'init-error',
    code: normalizeError(error).code,
  } satisfies Response);
  port.close();
}
