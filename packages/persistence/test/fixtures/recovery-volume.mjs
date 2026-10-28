import { Buffer } from 'node:buffer';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { SqliteDatabase } from '../../dist/sqlite/database.js';
import { ArtifactFiles } from '../../dist/sqlite/artifacts.js';
import { createBackup } from '../../dist/sqlite/backup.js';
import {
  openSqlitePersistence,
  restoreSqliteBackup,
} from '../../dist/index.js';

const [path, copies] = process.argv.slice(2);
let reads = 0;
let applies = 0;
const read = ArtifactFiles.prototype.read;
ArtifactFiles.prototype.read = function (ref) {
  reads++;
  return read.call(this, ref);
};
const apply = SqliteDatabase.prototype.apply;
SqliteDatabase.prototype.apply = function (record) {
  applies++;
  return apply.call(this, record);
};
async function measured(operation, work) {
  reads = 0;
  applies = 0;
  const start = performance.now();
  try {
    const result = await work();
    process.send?.({
      operation,
      ms: performance.now() - start,
      reads,
      applies,
    });
    return result;
  } catch (error) {
    process.send?.({
      operation,
      ms: performance.now() - start,
      reads,
      applies,
      error: error.code,
    });
    throw error;
  }
}
let db = new SqliteDatabase(path);
const reference = db.artifacts.put(Buffer.from('shared-volume-evidence'));
await measured('populate', () => {
  for (let i = 1; i <= 800; i++) {
    db.append(
      {
        schemaVersion: 1,
        type: 'block.started',
        eventId: `event-${i}`,
        occurredAt: i,
        runId: 'volume',
        attemptId: 'attempt',
        manifest: {
          schemaVersion: 1,
          blockId: `block-${i}`,
          handler: 'fixture.copy',
          handlerVersion: 1,
          inputs: [reference],
          effects: 'none',
        },
      },
      `key-${i}`,
    );
    if (i % 20 === 0) db.createCheckpoint(`checkpoint-${i}`);
  }
});
db.close();
await measured('open-direct', () => {
  db = new SqliteDatabase(path);
});
await measured('backup-direct', () => createBackup(db, copies));
db.close();
try {
  const store = await measured('open-worker', () =>
    openSqlitePersistence(path),
  );
  try {
    const bundle = await measured('backup-worker', () =>
      store.createBackup(copies),
    );
    const restored = await measured('restore-worker', () =>
      restoreSqliteBackup(bundle.directory, copies),
    );
    const reopened = await openSqlitePersistence(
      restored.databasePath,
      restored.artifactRoot,
    );
    try {
      if (
        (await reopened.readEvents()).length !== 800 ||
        (await reopened.loadCheckpoint('checkpoint-800'))?.sequence !== 800
      )
        throw new Error('Invalid restored volume');
    } finally {
      await reopened.close();
    }
  } finally {
    await store.close();
  }
} catch (error) {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
}
