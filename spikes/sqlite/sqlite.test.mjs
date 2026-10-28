/* global AbortSignal */
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { statSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { URL } from 'node:url';
import { Worker } from 'node:worker_threads';
import {
  databasePath,
  fixture,
  integrity,
  schema,
  sqliteCode,
} from './fixture.mjs';

test('runtime, WAL, atomic migration, rollback and reopen', (t) => {
  const files = fixture(t);
  let db = files.open();
  t.diagnostic(
    JSON.stringify({
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      sqlite: db.prepare('SELECT sqlite_version() AS v').get().v,
    }),
  );
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 0);
  db.exec(schema);
  db.exec(
    'BEGIN IMMEDIATE; ALTER TABLE operations ADD COLUMN tag TEXT; PRAGMA user_version=2;',
  );
  assert.throws(
    () => db.exec('INSERT INTO missing_table VALUES (1)'),
    sqliteCode(1),
  );
  db.exec('ROLLBACK;');
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 1);
  assert.ok(
    !db
      .prepare('PRAGMA table_info(operations)')
      .all()
      .some((row) => row.name === 'tag'),
  );
  db.exec(
    'BEGIN IMMEDIATE; ALTER TABLE operations ADD COLUMN tag TEXT; PRAGMA user_version=2; COMMIT;',
  );
  files.close(db);
  db = files.open();
  assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
  assert.ok(
    db
      .prepare('PRAGMA table_info(operations)')
      .all()
      .some((row) => row.name === 'tag'),
  );
  integrity(db);
});

test('UNIQUE and idempotency key protect an atomic operation/projection pair', (t) => {
  const files = fixture(t);
  let db = files.open();
  db.exec(schema);
  const insert = db.prepare(
    'INSERT INTO operations(idem, payload) VALUES (?, ?) ON CONFLICT(idem) DO NOTHING',
  );
  for (let i = 0; i < 5; i++) {
    db.exec('BEGIN IMMEDIATE;');
    const { changes, lastInsertRowid } = insert.run('same-key', 'same-payload');
    if (changes === 1)
      db.prepare('INSERT INTO projection VALUES (?, ?)').run(
        lastInsertRowid,
        'applied-once',
      );
    db.exec('COMMIT;');
  }
  assert.equal(db.prepare('SELECT count(*) AS n FROM operations').get().n, 1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM projection').get().n, 1);
  assert.throws(
    () =>
      db
        .prepare('INSERT INTO operations(idem, payload) VALUES (?, ?)')
        .run('same-key', 'different-payload'),
    sqliteCode(19),
  );
  db.exec(
    "BEGIN IMMEDIATE; INSERT INTO operations(idem, payload) VALUES ('rolled-back', 'temporary');",
  );
  assert.throws(
    () => db.exec("INSERT INTO projection VALUES (1, 'duplicate')"),
    sqliteCode(19),
  );
  db.exec('ROLLBACK;');
  files.close(db);
  db = files.open();
  assert.deepEqual(
    db
      .prepare('SELECT idem, payload FROM operations')
      .all()
      .map((row) => ({ ...row })),
    [{ idem: 'same-key', payload: 'same-payload' }],
  );
  assert.equal(db.prepare('SELECT count(*) AS n FROM projection').get().n, 1);
  integrity(db);
});

test('WAL readers retain snapshots; only one writer; BUSY blocks the calling event loop', async (t) => {
  const files = fixture(t);
  const writer = files.open();
  writer.exec(schema);
  const reader1 = files.open();
  const reader2 = files.open();
  const contender = files.open('FULL', 75);
  reader1.exec('BEGIN;');
  assert.equal(
    reader1.prepare('SELECT count(*) AS n FROM operations').get().n,
    0,
  );
  writer.exec(
    "BEGIN IMMEDIATE; INSERT INTO operations(idem, payload) VALUES ('writer', 'committed-later');",
  );
  assert.equal(
    reader1.prepare('SELECT count(*) AS n FROM operations').get().n,
    0,
  );
  assert.equal(
    reader2.prepare('SELECT count(*) AS n FROM operations').get().n,
    0,
  );
  let timerRan = false;
  const timer = delay(0).then(() => {
    timerRan = true;
  });
  const start = performance.now();
  assert.throws(() => contender.exec('BEGIN IMMEDIATE;'), sqliteCode(5));
  const busyMs = performance.now() - start;
  assert.equal(timerRan, false);
  await timer;
  assert.equal(timerRan, true);
  writer.exec('COMMIT;');
  assert.equal(
    reader1.prepare('SELECT count(*) AS n FROM operations').get().n,
    0,
  );
  assert.equal(
    reader2.prepare('SELECT count(*) AS n FROM operations').get().n,
    1,
  );
  reader1.exec('COMMIT;');
  assert.equal(
    reader1.prepare('SELECT count(*) AS n FROM operations').get().n,
    1,
  );
  // Explicit retry only after known lock release; not an automatic runtime policy.
  contender.exec('BEGIN IMMEDIATE;');
  assert.equal(
    contender
      .prepare(
        "INSERT INTO operations(idem, payload) VALUES ('writer', 'duplicate') ON CONFLICT(idem) DO NOTHING",
      )
      .run().changes,
    0,
  );
  contender.exec('COMMIT;');
  contender.exec(
    "BEGIN IMMEDIATE; INSERT INTO operations(idem, payload) VALUES ('second-writer', 'after-release'); COMMIT;",
  );
  assert.equal(
    writer.prepare('SELECT count(*) AS n FROM operations').get().n,
    2,
  );
  integrity(writer);
  t.diagnostic(
    JSON.stringify({
      busyTimeoutMs: 75,
      measuredBusyMs: busyMs,
      timerBlockedDuringCall: true,
    }),
  );
});

test(
  'a dedicated worker keeps the main timer responsive during a SQLite lock wait',
  { timeout: 10000 },
  async (t) => {
    const files = fixture(t);
    const writer = files.open();
    writer.exec(schema);
    writer.exec('BEGIN IMMEDIATE;');
    const worker = new Worker(new URL('./lock-worker.mjs', import.meta.url), {
      workerData: { directory: files.directory },
    });
    try {
      const [message] = await once(worker, 'message', {
        signal: AbortSignal.timeout(5000),
      });
      assert.equal(message, 'waiting-for-writer');
      const finished = once(worker, 'message', {
        signal: AbortSignal.timeout(5000),
      });
      await delay(20); // This timer can release the lock while DatabaseSync waits in the worker.
      writer.exec('ROLLBACK;');
      const [result] = await finished;
      assert.equal(result.phase, 'committed');
      assert.equal(
        writer
          .prepare("SELECT count(*) AS n FROM operations WHERE idem='worker'")
          .get().n,
        1,
      );
      t.diagnostic(
        JSON.stringify({
          workerWaitMs: result.waitMs,
          mainTimerReleasedWriter: true,
        }),
      );
    } finally {
      await worker.terminate();
    }
    integrity(writer);
  },
);

for (const mode of ['FULL', 'NORMAL']) {
  test(
    `process kill in WAL/${mode}: committed pair survives; pending transaction disappears`,
    { timeout: 15000 },
    async (t) => {
      const files = fixture(t);
      const initial = files.open(mode);
      initial.exec(schema);
      files.close(initial);
      const child = fork(
        new URL('./crash-child.mjs', import.meta.url),
        [files.directory, mode],
        { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
      );
      const exited = once(child, 'exit');
      let stderr = '';
      child.stderr.on('data', (chunk) => {
        stderr = (stderr + chunk).slice(-2048);
      });
      try {
        const [message] = await Promise.race([
          once(child, 'message', { signal: AbortSignal.timeout(10000) }),
          exited.then(() => {
            throw new Error(`Child exited before crash handshake: ${stderr}`);
          }),
        ]);
        assert.equal(message.phase, 'transaction-open');
        assert.equal(message.rowsVisibleInChild, 17);
        assert.ok(child.kill('SIGKILL'));
        const [code, signal] = await exited;
        assert.ok(code !== 0 || signal === 'SIGKILL');
      } finally {
        if (child.exitCode === null && child.signalCode === null)
          child.kill('SIGKILL');
        await exited;
      }
      assert.ok(statSync(`${databasePath(files.directory)}-wal`).size > 0);
      const recovered = files.open(mode);
      assert.deepEqual(
        recovered
          .prepare('SELECT idem FROM operations ORDER BY id')
          .all()
          .map((row) => row.idem),
        ['committed'],
      );
      assert.equal(
        recovered.prepare('SELECT count(*) AS n FROM projection').get().n,
        1,
      );
      const retry = recovered
        .prepare(
          "INSERT INTO operations(idem, payload) VALUES ('committed', 'committed') ON CONFLICT(idem) DO NOTHING",
        )
        .run();
      assert.equal(retry.changes, 0);
      integrity(recovered);
      t.diagnostic(
        JSON.stringify({
          mode,
          committedSurvived: 1,
          uncommittedSurvived: 0,
          duplicateRetryChanges: retry.changes,
          powerLossSimulated: false,
        }),
      );
    },
  );
}

test('FULL/NORMAL fixed-workload timings (diagnostic, no hardware-specific threshold)', (t) => {
  const samples = [];
  for (let round = 0; round < 3; round++) {
    for (const mode of round % 2 === 0
      ? ['FULL', 'NORMAL']
      : ['NORMAL', 'FULL']) {
      const files = fixture(t);
      const db = files.open(mode);
      db.exec(schema);
      const insert = db.prepare(
        'INSERT INTO operations(idem, payload) VALUES (?, ?)',
      );
      const projection = db.prepare('INSERT INTO projection VALUES (?, ?)');
      const latencies = [];
      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        db.exec('BEGIN IMMEDIATE;');
        const { lastInsertRowid } = insert.run(`key-${i}`, 'x'.repeat(128));
        projection.run(lastInsertRowid, 'applied');
        db.exec('COMMIT;');
        latencies.push(performance.now() - start);
      }
      assert.equal(
        db.prepare('SELECT count(*) AS n FROM operations').get().n,
        100,
      );
      assert.equal(
        db.prepare('SELECT count(*) AS n FROM projection').get().n,
        100,
      );
      const checkpointStart = performance.now();
      assert.equal(db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get().busy, 0);
      const checkpointMs = performance.now() - checkpointStart;
      latencies.sort((a, b) => a - b);
      samples.push({
        mode,
        round,
        commits: 100,
        medianMs: latencies[50],
        p95Ms: latencies[95],
        totalMs: latencies.reduce((sum, value) => sum + value, 0),
        checkpointMs,
      });
      integrity(db);
    }
  }
  t.diagnostic(
    JSON.stringify({
      workload:
        '100 transactions x 3 rounds/mode, two inserts, 128-byte payload, no auto-checkpoint',
      samples,
    }),
  );
});
