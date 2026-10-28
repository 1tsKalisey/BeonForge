import process from 'node:process';
import { Buffer } from 'node:buffer';
import { setInterval } from 'node:timers';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';
import { openSqlitePersistence } from '../../dist/index.js';
import { ArtifactFiles, SafeDirectory } from '../../dist/sqlite/artifacts.js';
import { SqliteDatabase } from '../../dist/sqlite/database.js';

const [path, mode, parent, backupDirectory] = process.argv.slice(2);
const bytes = Buffer.from('abc');
let message;
if (mode === 'checkpoint-incomplete') {
  const db = new SqliteDatabase(path);
  const sql = Reflect.get(db, 'db');
  if (!(sql instanceof DatabaseSync))
    throw new Error('Owned SQLite connection');
  // Native trigger pauses after CAS publication but before the SQLite checkpoint INSERT commits.
  // Temporary trigger/function are test-owned; no production failpoint is added.
  sql.function('pause_checkpoint', () => {
    writeFileSync(join(dirname(path), 'checkpoint-paused'), 'ready');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10000);
    return 0;
  });
  sql.exec(
    'CREATE TEMP TRIGGER pause_cp BEFORE INSERT ON workflow_checkpoints BEGIN SELECT pause_checkpoint(); END;',
  );
  db.createCheckpoint('interrupted');
  throw new Error('Parent failed to kill at checkpoint barrier');
} else if (mode === 'stage') {
  // Same durable staging primitive used by put(), paused before atomic publication.
  new ArtifactFiles(`${path}.artifacts`).stage(bytes);
  message = { phase: mode };
} else if (mode === 'backup-incomplete') {
  const db = new SqliteDatabase(path);
  const directory = mkdtempSync(join(parent, 'beonforge-backup-'));
  const root = new SafeDirectory(directory);
  root.writeExclusive('beonforge-backup-incomplete', new Uint8Array());
  await db.backupTo(root.file('events.sqlite'));
  message = { directory };
} else if (mode === 'restore-incomplete') {
  const source = new DatabaseSync(join(backupDirectory, 'events.sqlite'), {
    readOnly: true,
  });
  const directory = mkdtempSync(join(parent, 'beonforge-restore-'));
  const root = new SafeDirectory(directory);
  root.writeExclusive('beonforge-restore-incomplete', new Uint8Array());
  await backup(source, root.file('events.sqlite'));
  message = { directory };
} else {
  const store = await openSqlitePersistence(path);
  const reference = await store.putArtifact(bytes);
  if (mode === 'checkpoint') {
    await store.append(
      {
        schemaVersion: 1,
        eventId: 'start',
        type: 'block.started',
        occurredAt: 0,
        runId: 'run',
        attemptId: 'attempt',
        manifest: {
          schemaVersion: 1,
          blockId: 'block',
          handler: 'fixture.copy',
          handlerVersion: 1,
          inputs: [reference],
          effects: 'external',
        },
      },
      'start',
    );
    await store.createCheckpoint('confirmed');
  }
  message = { phase: mode };
}
process.send(message);
setInterval(() => {}, 1000);
