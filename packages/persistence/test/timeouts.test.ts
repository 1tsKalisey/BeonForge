import { mkdtempSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, expect, it } from 'vitest';
import {
  openSqlitePersistence,
  restoreSqliteBackup,
  type DurableStore,
} from '@beonforge/persistence';
import type { BlockExecutionEvent } from '@beonforge/contracts';

const temporary = realpathSync(tmpdir());
const allocated: {
  root: string;
  stores: DurableStore[];
  raw: DatabaseSync[];
}[] = [];
function fixture() {
  const root = mkdtempSync(join(temporary, 'beonforge-timeout-'));
  const files = {
    root,
    stores: [] as DurableStore[],
    raw: [] as DatabaseSync[],
  };
  allocated.push(files);
  const live = join(root, 'live');
  mkdirSync(live, { mode: 0o700 });
  return { ...files, path: join(live, 'events.sqlite') };
}
afterEach(async () => {
  for (const files of allocated.splice(0)) {
    for (const raw of files.raw) raw.close();
    for (const store of files.stores) await store.close();
    expect(dirname(realpathSync(files.root))).toBe(temporary);
    rmSync(files.root, { recursive: true, force: true });
  }
});
function start(id: string): BlockExecutionEvent {
  return {
    schemaVersion: 1,
    type: 'block.started',
    eventId: id,
    occurredAt: 0,
    runId: 'run',
    attemptId: 'attempt',
    manifest: {
      schemaVersion: 1,
      blockId: id,
      handler: 'fixture.copy',
      handlerVersion: 1,
      inputs: [],
      effects: 'none',
    },
  };
}

it('expires queued writes without dispatch or cancelling the active writer', async () => {
  const files = fixture();
  const store = await openSqlitePersistence(files.path, undefined, {
    queueMs: 15,
    executionMs: 1000,
  });
  files.stores.push(store);
  const raw = new DatabaseSync(files.path);
  files.raw.push(raw);
  raw.exec('BEGIN IMMEDIATE');
  const active = store.append(start('active'), 'active');
  const queued = expect(
    store.append(start('queued'), 'queued'),
  ).rejects.toMatchObject({ code: 'queue_timeout' });
  await delay(40);
  raw.exec('ROLLBACK');
  await queued;
  expect((await active).sequence).toBe(1);
  expect(
    (await store.readEvents()).map((record) => record.event.eventId),
  ).toEqual(['active']);
  expect((await store.append(start('queued'), 'queued')).sequence).toBe(2);
});

it('keeps finite execution deadlines and never retries an uncertain dispatched mutation', async () => {
  const files = fixture();
  let store = await openSqlitePersistence(files.path, undefined, {
    executionMs: 15,
    queueMs: 1000,
  });
  files.stores.push(store);
  const raw = new DatabaseSync(files.path);
  files.raw.push(raw);
  raw.exec('BEGIN IMMEDIATE');
  const active = expect(
    store.append(start('active'), 'active'),
  ).rejects.toMatchObject({ code: 'outcome_unknown' });
  const queued = expect(
    store.append(start('queued'), 'queued'),
  ).rejects.toMatchObject({ code: 'storage_failure' });
  await active;
  await queued;
  raw.exec('ROLLBACK');
  await store.close();
  store = await openSqlitePersistence(files.path);
  files.stores.push(store);
  const events = await store.readEvents();
  expect(events.length).toBeLessThanOrEqual(1);
  expect(events.every((record) => record.event.eventId === 'active')).toBe(
    true,
  );
  await delay(30);
  expect(await store.readEvents()).toEqual(events);
});

it('applies a separately configurable finite opening budget', async () => {
  const files = fixture();
  await expect(
    openSqlitePersistence(files.path, undefined, { openingMs: 1 }),
  ).rejects.toMatchObject({ code: 'storage_failure' });
  const store = await openSqlitePersistence(files.path, undefined, {
    openingMs: 5000,
    backupMs: 5000,
    restoreMs: 5000,
  });
  files.stores.push(store);
  const backup = await store.createBackup(files.root);
  const restored = await restoreSqliteBackup(backup.directory, files.root, {
    openingMs: 5000,
    restoreMs: 5000,
  });
  expect(restored.databasePath).not.toBe(files.path);
});

it.each([0, -1, NaN, Infinity, 2147483648])(
  'rejects an invalid timeout %s without creating storage',
  async (executionMs) => {
    const files = fixture();
    await expect(
      openSqlitePersistence(files.path, undefined, { executionMs }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  },
);
