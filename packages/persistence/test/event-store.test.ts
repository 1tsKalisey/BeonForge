import { mkdtempSync, realpathSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import type { BlockExecutionEvent, BlockResult } from '@beonforge/contracts';
import {
  openSqliteEventStore,
  PersistenceError,
  type EventStore,
  type AttemptIdentity,
} from '@beonforge/persistence';
import { requireRuntime } from '../dist/sqlite/runtime.js';

const temporaryRoot = realpathSync(tmpdir());
const fixtures: {
  root: string;
  stores: Set<EventStore>;
  raw: Set<DatabaseSync>;
}[] = [];

function fixture() {
  const root = mkdtempSync(join(temporaryRoot, 'beonforge-event-store-'));
  const path = join(root, 'events.sqlite');
  const stores = new Set<EventStore>();
  const raw = new Set<DatabaseSync>();
  fixtures.push({ root, stores, raw });
  return {
    path,
    async open() {
      const store = await openSqliteEventStore(path);
      stores.add(store);
      return store;
    },
    async close(store: EventStore) {
      await store.close();
      stores.delete(store);
    },
    sql() {
      const db = new DatabaseSync(path);
      raw.add(db);
      return db;
    },
    closeSql(db: DatabaseSync) {
      db.close();
      raw.delete(db);
    },
  };
}

afterEach(async () => {
  for (const item of fixtures.splice(0)) {
    for (const store of item.stores) await store.close();
    for (const db of item.raw) db.close();
    const root = realpathSync(item.root);
    expect(dirname(root)).toBe(temporaryRoot);
    expect(basename(root).startsWith('beonforge-event-store-')).toBe(true);
    expect(resolve(item.root)).toBe(root);
    rmSync(root, { recursive: true, force: true });
  }
});

const identity: AttemptIdentity = {
  runId: 'run-1',
  blockId: 'block-1',
  attemptId: 'attempt-1',
};
function start(
  blockId = 'block-1',
  attemptId = 'attempt-1',
  eventId = 'start-1',
): Extract<BlockExecutionEvent, { type: 'block.started' }> {
  return {
    schemaVersion: 1,
    eventId,
    occurredAt: 10,
    type: 'block.started',
    runId: 'run-1',
    attemptId,
    manifest: {
      schemaVersion: 1,
      blockId,
      handler: 'fixture.copy',
      handlerVersion: 1,
      inputs: [],
      effects: 'external',
    },
  };
}
function finish(
  status: BlockResult['status'] = 'succeeded',
  attemptId = 'attempt-1',
  eventId = 'finish-1',
): Extract<BlockExecutionEvent, { type: 'block.finished' }> {
  const base = {
    schemaVersion: 1,
    ...identity,
    attemptId,
    evidence: [],
  } as const;
  const result: BlockResult =
    status === 'failed' || status === 'uncertain'
      ? {
          ...base,
          status,
          error: { code: 'execution_failed', message: 'Fixture summary' },
        }
      : { ...base, status };
  return {
    schemaVersion: 1,
    eventId,
    occurredAt: 0,
    type: 'block.finished',
    result,
  };
}

describe('durable event store through compiled exports', () => {
  it('initializes a branded/versioned WAL database and replays the same projection after reopen', async () => {
    const files = fixture();
    let store = await files.open();
    expect(await store.getAttempt(identity)).toBeNull();
    const first = await store.append(start(), 'start-key');
    expect(first.sequence).toBe(1);
    expect(await store.getAttempt(identity)).toMatchObject({
      status: 'pending',
      result: null,
      lastSequence: 1,
    });
    await store.append(finish(), 'finish-key');
    const projection = await store.getAttempt(identity);
    expect(projection).toMatchObject({
      status: 'succeeded',
      result: { status: 'succeeded' },
      lastSequence: 2,
    });
    const records = await store.readEvents();
    const db = files.sql();
    expect(db.prepare('PRAGMA journal_mode').get()?.journal_mode).toBe('wal');
    expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(2);
    expect(db.prepare('SELECT sqlite_version() AS v').get()?.v).toBe('3.53.3');
    files.closeSql(db);
    await files.close(store);
    store = await files.open();
    expect(await store.readEvents()).toEqual(records);
    expect(await store.getAttempt(identity)).toEqual(projection);
    expectTypeOf(store).toEqualTypeOf<EventStore>();
  });

  it('serializes concurrent calls and assigns stable commit sequences independent of timestamps', async () => {
    const store = await fixture().open();
    const records = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        store.append(
          start(`block-${index}`, 'attempt-1', `event-${index}`),
          `key-${index}`,
        ),
      ),
    );
    expect(records.map((record) => record.sequence)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(await store.readEvents()).toEqual(records);
  });

  it('deduplicates a canonical event but rejects reused keys or event IDs with different requests', async () => {
    const files = fixture();
    let store = await files.open();
    const event = start();
    const original = await store.append(event, 'key');
    const reordered = {
      manifest: event.manifest,
      attemptId: event.attemptId,
      runId: event.runId,
      type: event.type,
      occurredAt: event.occurredAt,
      eventId: event.eventId,
      schemaVersion: event.schemaVersion,
    };
    expect(await store.append(reordered, 'key')).toEqual(original);
    await expect(
      store.append({ ...event, occurredAt: 100 }, 'key'),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
    await expect(store.append(event, 'other-key')).rejects.toMatchObject({
      code: 'idempotency_conflict',
    });
    expect(await store.readEvents()).toHaveLength(1);
    await files.close(store);
    store = await files.open();
    expect(await store.append(event, 'key')).toEqual(original);
    expect(await store.readEvents()).toHaveLength(1);
  });

  it('rolls back event, key and projection when SQLite fails while inserting the projection', async () => {
    const files = fixture();
    const store = await files.open();
    const db = files.sql();
    db.exec(
      "CREATE TRIGGER fail_projection BEFORE INSERT ON attempts BEGIN SELECT RAISE(ABORT, 'fixture failure'); END;",
    );
    await expect(store.append(start(), 'key')).rejects.toMatchObject({
      code: 'storage_failure',
    });
    expect(await store.readEvents()).toEqual([]);
    expect(await store.getAttempt(identity)).toBeNull();
    db.exec('DROP TRIGGER fail_projection;');
    expect((await store.append(start(), 'key')).sequence).toBe(1);
  });

  it('rolls back a finish on projection failure and keeps the confirmed pending attempt', async () => {
    const files = fixture();
    const store = await files.open();
    await store.append(start(), 'start-key');
    const db = files.sql();
    db.exec(
      "CREATE TRIGGER fail_finish BEFORE UPDATE ON attempts BEGIN SELECT RAISE(ABORT, 'fixture failure'); END;",
    );
    await expect(store.append(finish(), 'finish-key')).rejects.toMatchObject({
      code: 'storage_failure',
    });
    expect(await store.readEvents()).toHaveLength(1);
    expect(await store.getAttempt(identity)).toMatchObject({
      status: 'pending',
      result: null,
    });
    db.exec('DROP TRIGGER fail_finish;');
    expect((await store.append(finish(), 'finish-key')).sequence).toBe(2);
  });

  it('enforces append-only SQL triggers', async () => {
    const files = fixture();
    const store = await files.open();
    await store.append(start(), 'key');
    const db = files.sql();
    expect(() => db.exec('DELETE FROM events;')).toThrow();
    expect(() => db.exec("UPDATE events SET payload='{}';")).toThrow();
    expect(await store.readEvents()).toHaveLength(1);
    expect(db.prepare('PRAGMA integrity_check').get()?.integrity_check).toBe(
      'ok',
    );
  });

  it('fails closed when rollback cannot confirm a write outcome', async () => {
    const files = fixture();
    let store = await files.open();
    const db = files.sql();
    db.exec(
      "CREATE TRIGGER force_rollback BEFORE INSERT ON attempts BEGIN SELECT RAISE(ROLLBACK, 'fixture rollback'); END;",
    );
    await expect(store.append(start(), 'key')).rejects.toMatchObject({
      code: 'outcome_unknown',
    });
    await files.close(store);
    await expect(store.readEvents()).rejects.toMatchObject({ code: 'closed' });
    db.exec('DROP TRIGGER force_rollback;');
    files.closeSql(db);
    store = await files.open();
    expect(await store.readEvents()).toEqual([]);
    expect((await store.append(start(), 'key')).sequence).toBe(1);
  });

  it('rejects unmatched/duplicate finishes and changed manifests without consuming sequence or key', async () => {
    const store = await fixture().open();
    await expect(store.append(finish(), 'finish-key')).rejects.toMatchObject({
      code: 'invalid_sequence',
    });
    await store.append(start(), 'start-key');
    await store.append(finish('failed'), 'finish-key');
    await expect(
      store.append(finish('failed', 'attempt-1', 'finish-2'), 'extra-finish'),
    ).rejects.toMatchObject({ code: 'invalid_sequence' });
    const retry = start('block-1', 'attempt-2', 'retry-start');
    await expect(
      store.append(
        { ...retry, manifest: { ...retry.manifest, handlerVersion: 2 } },
        'retry-key',
      ),
    ).rejects.toMatchObject({ code: 'invalid_sequence' });
    expect((await store.append(retry, 'retry-key')).sequence).toBe(3);
  });

  it.each(['pending', 'uncertain', 'succeeded', 'cancelled'] as const)(
    'never starts a new attempt after %s',
    async (status) => {
      const files = fixture();
      let store = await files.open();
      await store.append(start(), 'start-key');
      if (status !== 'pending')
        await store.append(finish(status), 'finish-key');
      await files.close(store);
      store = await files.open();
      expect((await store.getAttempt(identity))?.status).toBe(status);
      await expect(
        store.append(start('block-1', 'attempt-2', 'retry-start'), 'retry-key'),
      ).rejects.toMatchObject({ code: 'invalid_sequence' });
    },
  );

  it('reconstructs a deleted/corrupted derived projection only from confirmed events', async () => {
    const files = fixture();
    let store = await files.open();
    await store.append(start(), 'start-key');
    await store.append(finish('uncertain'), 'finish-key');
    const projection = await store.getAttempt(identity);
    const db = files.sql();
    db.exec('DELETE FROM attempts;');
    expect(await store.getAttempt(identity)).toBeNull();
    await store.rebuildProjection();
    expect(await store.getAttempt(identity)).toEqual(projection);
    db.exec("UPDATE attempts SET manifest='{}';");
    await expect(store.getAttempt(identity)).rejects.toMatchObject({
      code: 'incompatible_database',
    });
    files.closeSql(db);
    await files.close(store);
    store = await files.open();
    expect(await store.getAttempt(identity)).toEqual(projection);
    expect(await store.readEvents()).toHaveLength(2);
  });

  it('rejects a future schema version before changing its journal or existing data', async () => {
    const files = fixture();
    let db = files.sql();
    db.exec(
      "CREATE TABLE sentinel(value TEXT); INSERT INTO sentinel VALUES ('kept'); PRAGMA user_version=3;",
    );
    files.closeSql(db);
    await expect(files.open()).rejects.toMatchObject({
      code: 'incompatible_database',
    });
    db = files.sql();
    expect(db.prepare('PRAGMA journal_mode').get()?.journal_mode).toBe(
      'delete',
    );
    expect(db.prepare('SELECT value FROM sentinel').get()?.value).toBe('kept');
  });

  it('rolls back a failed replay without deleting the previous derived projection', async () => {
    const files = fixture();
    const store = await files.open();
    await store.append(start(), 'key');
    const previous = await store.getAttempt(identity);
    const db = files.sql();
    db.exec(
      "CREATE TRIGGER fail_replay BEFORE INSERT ON attempts BEGIN SELECT RAISE(ABORT, 'fixture failure'); END;",
    );
    await expect(store.rebuildProjection()).rejects.toMatchObject({
      code: 'storage_failure',
    });
    expect(await store.getAttempt(identity)).toEqual(previous);
    expect(await store.readEvents()).toHaveLength(1);
    db.exec('DROP TRIGGER fail_replay;');
    await store.rebuildProjection();
    expect(await store.getAttempt(identity)).toEqual(previous);
  });

  it('rejects unbranded existing databases and unsupported stored event versions', async () => {
    const files = fixture();
    const store = await files.open();
    await files.close(store);
    let db = files.sql();
    db.exec('PRAGMA application_id=0;');
    files.closeSql(db);
    await expect(files.open()).rejects.toMatchObject({
      code: 'incompatible_database',
    });
    db = files.sql();
    db.exec('PRAGMA application_id=1111904082;');
    db.prepare(
      'INSERT INTO events(event_id, idempotency_key, payload) VALUES (?, ?, ?)',
    ).run(
      'bad-version',
      'bad-key',
      JSON.stringify({ ...start(), eventId: 'bad-version', schemaVersion: 2 }),
    );
    files.closeSql(db);
    await expect(files.open()).rejects.toMatchObject({
      code: 'incompatible_database',
    });
    // Keep the variable consumed as the public port; no raw SQL leaks into its type.
    expectTypeOf(store).toEqualTypeOf<EventStore>();
  });

  it('returns typed BUSY without blocking the control-plane timer or retrying automatically', async () => {
    const files = fixture();
    const store = await files.open();
    const db = files.sql();
    db.exec('BEGIN IMMEDIATE;');
    let timerRan = false;
    const timer = delay(0).then(() => {
      timerRan = true;
    });
    await expect(store.append(start(), 'key')).rejects.toMatchObject({
      code: 'busy',
    });
    expect(timerRan).toBe(true);
    await timer;
    db.exec('ROLLBACK;');
    expect(await store.readEvents()).toEqual([]);
    expect((await store.append(start(), 'key')).sequence).toBe(1);
  });

  it('rejects a second in-process writer and permits reopen after orderly close', async () => {
    const files = fixture();
    const store = await files.open();
    await expect(files.open()).rejects.toMatchObject({ code: 'busy' });
    await Promise.all([store.close(), store.close()]);
    await files.close(store);
    await expect(store.readEvents()).rejects.toMatchObject({ code: 'closed' });
    await expect(files.open()).resolves.toBeDefined();
  });

  it('rejects unvalidated runtime versions and malformed writes before durable changes', async () => {
    expect(() => requireRuntime('24.13.0', '3.50.4')).toThrow(PersistenceError);
    expect(() => requireRuntime('24.19.0', '3.50.4')).toThrow(PersistenceError);
    expect(() => requireRuntime('24.19.0', '3.51.2')).toThrow(PersistenceError);
    expect(() => requireRuntime('24.19.0', '3.53.3')).not.toThrow();
    const files = fixture();
    const store = await files.open();
    await expect(
      store.append(
        { ...start(), schemaVersion: 2 } as unknown as BlockExecutionEvent,
        'key',
      ),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(store.append(start(), '../key')).rejects.toMatchObject({
      code: 'invalid_input',
    });
    await expect(
      store.getAttempt(null as unknown as AttemptIdentity),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    expect(await store.readEvents()).toEqual([]);
    expect(existsSync(files.path)).toBe(true);
  });

  it('recovers a confirmed start without inventing a finish after an actual child-process kill', async () => {
    const files = fixture();
    const child = fork(
      new URL('./fixtures/interrupted.mjs', import.meta.url),
      [files.path],
      { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
    );
    const exited = once(child, 'exit');
    try {
      const ready: unknown = await Promise.race([
        once(child, 'message', { signal: AbortSignal.timeout(5000) }),
        exited.then(() => {
          throw new Error('Child exited before handshake');
        }),
      ]);
      expect(ready).toEqual(
        expect.arrayContaining([{ phase: 'confirmed-start' }]),
      );
      const db = files.sql();
      db.exec('BEGIN IMMEDIATE;');
      const submitted = once(child, 'message', {
        signal: AbortSignal.timeout(5000),
      });
      child.send('finish');
      expect((await submitted)[0]).toEqual({ phase: 'submitted-finish' });
      expect(child.kill('SIGKILL')).toBe(true);
      await exited;
      db.exec('ROLLBACK;');
      files.closeSql(db);
    } finally {
      if (child.exitCode === null && child.signalCode === null)
        child.kill('SIGKILL');
      await exited;
    }
    const store = await files.open();
    expect(await store.readEvents()).toHaveLength(1);
    expect(await store.getAttempt(identity)).toMatchObject({
      status: 'pending',
      result: null,
    });
    await expect(
      store.append(start('block-1', 'attempt-2', 'retry-start'), 'retry-key'),
    ).rejects.toMatchObject({ code: 'invalid_sequence' });
  }, 10000);

  it('reports an unacknowledged append as outcome_unknown on real worker termination', async () => {
    const files = fixture();
    let store = await files.open();
    // Fault injection into the owned infrastructure, not a public termination API or a mock.
    const worker: unknown = Reflect.get(store, 'worker');
    if (!(worker instanceof Worker))
      throw new Error('Owned writer worker required');
    const outcome = expect(store.append(start(), 'key')).rejects.toMatchObject({
      code: 'outcome_unknown',
    });
    await worker.terminate();
    await outcome;
    await files.close(store);
    store = await files.open();
    const records = await store.readEvents();
    // COMMIT might have happened before the acknowledgement was lost. Never guess which.
    expect(records.length === 0 || records.length === 1).toBe(true);
    if (records.length === 1) {
      expect(records[0]?.event).toEqual(start());
      expect(await store.getAttempt(identity)).toMatchObject({
        status: 'pending',
        lastSequence: 1,
      });
    } else expect(await store.getAttempt(identity)).toBeNull();
    expect((await store.append(start(), 'key')).sequence).toBe(1);
    expect(await store.readEvents()).toHaveLength(1);
  });
});
