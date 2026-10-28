import {
  mkdtempSync,
  realpathSync,
  rmSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  renameSync,
  symlinkSync,
  existsSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import process from 'node:process';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  ArtifactReference,
  BlockExecutionEvent,
} from '@beonforge/contracts';
import {
  openSqlitePersistence,
  restoreSqliteBackup,
  type DurableStore,
} from '@beonforge/persistence';
import { ArtifactFiles } from '../dist/sqlite/artifacts.js';

const temporary = realpathSync(tmpdir());
const allocated: { root: string; stores: Set<DurableStore> }[] = [];
const bytes = Buffer.from('abc');
const reference: ArtifactReference = {
  sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  byteLength: 3,
};
const identity = { runId: 'run', blockId: 'block', attemptId: 'attempt' };

function start(
  inputs: readonly ArtifactReference[] = [reference],
): BlockExecutionEvent {
  return {
    schemaVersion: 1,
    type: 'block.started',
    eventId: 'start',
    occurredAt: 0,
    runId: identity.runId,
    attemptId: identity.attemptId,
    manifest: {
      schemaVersion: 1,
      blockId: identity.blockId,
      handler: 'fixture.copy',
      handlerVersion: 1,
      inputs,
      effects: 'external',
    },
  };
}
function finish(): BlockExecutionEvent {
  return {
    schemaVersion: 1,
    type: 'block.finished',
    eventId: 'finish',
    occurredAt: 1,
    result: {
      schemaVersion: 1,
      ...identity,
      status: 'uncertain',
      evidence: [reference],
      error: { code: 'interrupted', message: 'Reconciliation needed' },
    },
  };
}
function fixture() {
  const root = mkdtempSync(join(temporary, 'beonforge-recovery-'));
  const live = join(root, 'live');
  mkdirSync(live, { mode: 0o700 });
  const path = join(live, 'events.sqlite');
  const artifacts = `${path}.artifacts`;
  const copies = join(root, 'copies');
  mkdirSync(copies, { mode: 0o700 });
  const stores = new Set<DurableStore>();
  allocated.push({ root, stores });
  return {
    root,
    path,
    artifacts,
    copies,
    async open(databasePath = path, artifactRoot?: string) {
      const store = await openSqlitePersistence(databasePath, artifactRoot);
      stores.add(store);
      return store;
    },
    async close(store: DurableStore) {
      await store.close();
      stores.delete(store);
    },
  };
}
afterEach(async () => {
  for (const item of allocated.splice(0)) {
    for (const store of item.stores) await store.close();
    expect(dirname(realpathSync(item.root))).toBe(temporary);
    expect(basename(item.root).startsWith('beonforge-recovery-')).toBe(true);
    rmSync(item.root, { recursive: true, force: true });
  }
});

function sql<T>(path: string, work: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(path);
  try {
    return work(db);
  } finally {
    db.close();
  }
}

async function killedAt(
  files: ReturnType<typeof fixture>,
  mode: string,
  backupDirectory = '',
): Promise<unknown> {
  const child = fork(
    new URL('./fixtures/recovery-crash.mjs', import.meta.url),
    [files.path, mode, files.copies, backupDirectory],
    { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
  );
  const exited = once(child, 'exit');
  let errorText = '';
  child.stderr?.on('data', (chunk: Uint8Array) => {
    errorText = (errorText + Buffer.from(chunk).toString()).slice(-2048);
  });
  try {
    const progress =
      mode === 'checkpoint-incomplete'
        ? (async () => {
            for (let i = 0; i < 800; i++) {
              if (existsSync(join(dirname(files.path), 'checkpoint-paused')))
                return [{ phase: mode }];
              await delay(5);
            }
            throw new Error('Checkpoint barrier not reached');
          })()
        : once(child, 'message', { signal: AbortSignal.timeout(8000) });
    const messages: unknown = await Promise.race([
      progress,
      exited.then(() => {
        throw new Error(`Child failed: ${errorText}`);
      }),
    ]);
    expect(Array.isArray(messages)).toBe(true);
    const message: unknown = Array.isArray(messages) ? messages[0] : undefined;
    expect(child.kill('SIGKILL')).toBe(true);
    await exited;
    return message;
  } finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL');
    await exited;
  }
}

describe('content-addressed artifacts, workflow checkpoints and isolated recovery', () => {
  it.each([
    'sqlite-root',
    'sqlite-child',
    'cas-root',
    'cas-blobs',
    'cas-staging',
    'cas-child',
  ] as const)(
    'F-7 rejects backup destination %s before creating residues',
    async (kind) => {
      const files = fixture();
      const store = await files.open();
      await store.putArtifact(bytes);
      const nestedDb = join(dirname(files.path), 'nested');
      const nestedCas = join(files.artifacts, 'nested');
      mkdirSync(nestedDb, { mode: 0o700 });
      mkdirSync(nestedCas, { mode: 0o700 });
      const destinations = {
        'sqlite-root': dirname(files.path),
        'sqlite-child': nestedDb,
        'cas-root': files.artifacts,
        'cas-blobs': join(files.artifacts, 'blobs'),
        'cas-staging': join(files.artifacts, 'staging'),
        'cas-child': nestedCas,
      };
      const destination = destinations[kind];
      const before = readdirSync(destination);
      await expect(store.createBackup(destination)).rejects.toMatchObject({
        code: 'unsafe_path',
      });
      expect(readdirSync(destination)).toEqual(before);
      expect(Buffer.from(await store.readArtifact(reference))).toEqual(bytes);
      const valid = await store.createBackup(files.copies);
      const restored = await restoreSqliteBackup(valid.directory, files.copies);
      const copy = await files.open(restored.databasePath);
      expect(Buffer.from(await copy.readArtifact(reference))).toEqual(bytes);
    },
  );

  it.each(['sqlite', 'cas', 'valid-parent'] as const)(
    'F-7 rejects a junction to %s before allocation and permits retry',
    async (kind) => {
      const files = fixture();
      const store = await files.open();
      const targets = {
        sqlite: dirname(files.path),
        cas: files.artifacts,
        'valid-parent': files.copies,
      };
      const target = targets[kind];
      const names = readdirSync(target);
      const alias = join(files.root, 'alias-destination');
      symlinkSync(
        target,
        alias,
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      await expect(store.createBackup(alias)).rejects.toMatchObject({
        code: 'unsafe_path',
      });
      expect(readdirSync(target)).toEqual(names);
      expect((await store.createBackup(files.copies)).databasePath).not.toBe(
        files.path,
      );
    },
  );

  it.each(['missing', 'file', 'traversal'] as const)(
    'F-7 rejects an invalid %s destination without residues',
    async (kind) => {
      const files = fixture();
      const store = await files.open();
      const file = join(files.root, 'parent-file');
      writeFileSync(file, 'sentinel');
      const names = readdirSync(files.root);
      const destinations = {
        missing: join(files.root, 'missing'),
        file,
        traversal: `${files.copies}/../copies`,
      };
      await expect(
        store.createBackup(destinations[kind]),
      ).rejects.toMatchObject({ code: 'unsafe_path' });
      expect(readdirSync(files.root)).toEqual(names);
      expect(readFileSync(file, 'utf8')).toBe('sentinel');
      await store.createBackup(files.copies);
    },
  );

  it('F-7 protects a custom CAS outside the SQLite directory and permits sibling prefix names', async () => {
    const files = fixture();
    const customCas = join(files.root, 'custom-cas');
    const store = await files.open(files.path, customCas);
    await store.putArtifact(bytes);
    const before = readdirSync(customCas);
    await expect(store.createBackup(customCas)).rejects.toMatchObject({
      code: 'unsafe_path',
    });
    expect(readdirSync(customCas)).toEqual(before);
    const sibling = `${dirname(files.path)}-copies`;
    mkdirSync(sibling, { mode: 0o700 });
    const backup = await store.createBackup(realpathSync.native(sibling));
    expect(backup.databasePath).not.toBe(files.path);
    expect(Buffer.from(await store.readArtifact(reference))).toEqual(bytes);
  });

  it.each(['complete', 'incomplete'] as const)(
    'F-6 rejects opening %s backup without modifying it',
    async (kind) => {
      const files = fixture();
      const store = await files.open();
      await store.putArtifact(bytes);
      await store.append(start(), 'start');
      const bundle = await store.createBackup(files.copies);
      if (kind === 'incomplete')
        writeFileSync(
          join(bundle.directory, 'beonforge-backup-incomplete'),
          '',
        );
      const before = readFileSync(bundle.databasePath);
      const names = readdirSync(bundle.directory);
      await expect(
        files.open(bundle.databasePath, bundle.artifactRoot),
      ).rejects.toMatchObject({ code: 'integrity_failure' });
      expect(readFileSync(bundle.databasePath)).toEqual(before);
      expect(readdirSync(bundle.directory)).toEqual(names);
    },
  );

  it.each([
    'missing',
    'malformed',
    'future',
    'ahead',
    'missing-db',
    'missing-cas',
  ] as const)('F-6 rejects restore with %s ready state', async (damage) => {
    const files = fixture();
    const store = await files.open();
    const bundle = await store.createBackup(files.copies);
    const restored = await restoreSqliteBackup(bundle.directory, files.copies);
    const ready = join(restored.directory, 'restore-ready.json');
    if (damage === 'missing') unlinkSync(ready);
    if (damage === 'malformed') writeFileSync(ready, '{}');
    if (damage === 'future')
      writeFileSync(ready, '{"schemaVersion":2,"sequence":0}');
    if (damage === 'ahead')
      writeFileSync(ready, '{"schemaVersion":1,"sequence":1}');
    if (damage === 'missing-db') unlinkSync(restored.databasePath);
    if (damage === 'missing-cas')
      renameSync(restored.artifactRoot, `${restored.artifactRoot}.saved`);
    const names = readdirSync(restored.directory);
    await expect(
      files.open(restored.databasePath, restored.artifactRoot),
    ).rejects.toMatchObject({ code: 'integrity_failure' });
    expect(readdirSync(restored.directory)).toEqual(names);
  });

  it('F-6 rejects unmarked reserved restore roots instead of initializing a new database', async () => {
    const files = fixture();
    const root = join(files.copies, 'beonforge-restore-not-ready');
    mkdirSync(root, { mode: 0o700 });
    await expect(files.open(join(root, 'events.sqlite'))).rejects.toMatchObject(
      { code: 'integrity_failure' },
    );
    expect(readdirSync(root)).toEqual([]);
  });

  it('F-6 keeps restore identity after rename and rejects alternate database/CAS initialization', async () => {
    const files = fixture();
    const store = await files.open();
    const bundle = await store.createBackup(files.copies);
    const restored = await restoreSqliteBackup(bundle.directory, files.copies);
    const alternate = join(restored.directory, 'new.sqlite');
    await expect(files.open(alternate)).rejects.toMatchObject({
      code: 'integrity_failure',
    });
    expect(existsSync(alternate)).toBe(false);
    await expect(
      files.open(restored.databasePath, `${restored.artifactRoot}.alternate`),
    ).rejects.toMatchObject({ code: 'integrity_failure' });
    expect(existsSync(`${restored.artifactRoot}.alternate`)).toBe(false);
    unlinkSync(join(restored.directory, 'restore-ready.json'));
    const renamed = join(files.copies, 'renamed-recovery');
    renameSync(restored.directory, renamed);
    await expect(
      files.open(join(renamed, 'events.sqlite')),
    ).rejects.toMatchObject({ code: 'integrity_failure' });
  });

  it('F-6 accepts a valid restore after later appends without confusing ready prefix with current head', async () => {
    const files = fixture();
    const store = await files.open();
    const bundle = await store.createBackup(files.copies);
    const restored = await restoreSqliteBackup(bundle.directory, files.copies);
    let copy = await files.open(restored.databasePath);
    await copy.putArtifact(bytes);
    await copy.append(start(), 'start');
    await files.close(copy);
    copy = await files.open(restored.databasePath);
    expect(await copy.readEvents()).toHaveLength(1);
  });

  it('publishes blobs, checks a known SHA-256 and reads empty content', async () => {
    const files = fixture();
    const store = await files.open();
    expect(await store.putArtifact(bytes)).toEqual(reference);
    expect(Buffer.from(await store.readArtifact(reference))).toEqual(bytes);
    await expect(
      store.readArtifact({ ...reference, byteLength: 4 }),
    ).rejects.toMatchObject({ code: 'integrity_failure' });
    const empty = await store.putArtifact(new Uint8Array());
    expect(empty.sha256).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(await store.readArtifact(empty)).toHaveLength(0);
    expect(readdirSync(join(files.artifacts, 'staging'))).toEqual([]);
  });

  it('deduplicates concurrent requests and concurrent independent publishers sharing a CAS', async () => {
    const files = fixture();
    const one = await files.open();
    const two = await files.open(
      join(files.root, 'other.sqlite'),
      files.artifacts,
    );
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        (i % 2 ? one : two).putArtifact(bytes),
      ),
    );
    expect(results.every((value) => value.sha256 === reference.sha256)).toBe(
      true,
    );
    expect(readdirSync(join(files.artifacts, 'blobs'))).toEqual([
      reference.sha256,
    ]);
    expect(readdirSync(join(files.artifacts, 'staging'))).toEqual([]);
  });

  it('rejects corruption and does not overwrite an existing corrupt hash path', async () => {
    const files = fixture();
    const store = await files.open();
    await store.putArtifact(bytes);
    writeFileSync(join(files.artifacts, 'blobs', reference.sha256), 'bad');
    await expect(store.readArtifact(reference)).rejects.toMatchObject({
      code: 'integrity_failure',
    });
    await expect(store.putArtifact(bytes)).rejects.toMatchObject({
      code: 'integrity_failure',
    });
    expect(
      readFileSync(join(files.artifacts, 'blobs', reference.sha256), 'utf8'),
    ).toBe('bad');
  });

  it('refuses to publish a truncated staged write and never treats it as a completed blob', async () => {
    const files = fixture();
    const store = await files.open();
    const cas = new ArtifactFiles(files.artifacts);
    const staged = cas.stage(bytes);
    writeFileSync(
      join(files.artifacts, 'staging', staged.name),
      bytes.subarray(0, 1),
    );
    expect(() => cas.publish(staged)).toThrowError(
      expect.objectContaining({ code: 'integrity_failure' }),
    );
    expect(readdirSync(join(files.artifacts, 'blobs'))).toEqual([]);
    expect(await store.putArtifact(bytes)).toEqual(reference);
  });

  it('never commits an event referring to missing content; publishing first allows the same key', async () => {
    const files = fixture();
    let store = await files.open();
    await expect(store.append(start(), 'key')).rejects.toMatchObject({
      code: 'artifact_missing',
    });
    expect(await store.readEvents()).toEqual([]);
    await store.putArtifact(bytes);
    await store.append(start(), 'key');
    await files.close(store);
    store = await files.open();
    expect((await store.readEvents())[0]?.sequence).toBe(1);
    unlinkSync(join(files.artifacts, 'blobs', reference.sha256));
    await expect(store.getAttempt(identity)).rejects.toMatchObject({
      code: 'artifact_missing',
    });
    await files.close(store);
    await expect(files.open()).rejects.toMatchObject({
      code: 'artifact_missing',
    });
  });

  it('rejects traversal in references and roots without writing outside the authorized root', async () => {
    const files = fixture();
    const store = await files.open();
    const authorized = join(files.root, 'authorized');
    mkdirSync(authorized, { mode: 0o700 });
    await expect(
      store.readArtifact({ ...reference, sha256: '../outside' }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      files.open(join(files.root, 'other.sqlite'), `${authorized}/../outside`),
    ).rejects.toMatchObject({ code: 'unsafe_path' });
    expect(existsSync(join(files.root, 'outside'))).toBe(false);
  });

  it('rejects a replaced staging directory junction/symlink and preserves outside files', async () => {
    const files = fixture();
    const store = await files.open();
    const outside = join(files.root, 'outside');
    mkdirSync(outside, { mode: 0o700 });
    writeFileSync(join(outside, 'sentinel'), 'keep');
    renameSync(
      join(files.artifacts, 'staging'),
      join(files.artifacts, 'original-staging'),
    );
    symlinkSync(
      outside,
      join(files.artifacts, 'staging'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await expect(store.putArtifact(bytes)).rejects.toMatchObject({
      code: 'unsafe_path',
    });
    expect(readdirSync(outside)).toEqual(['sentinel']);
    expect(readFileSync(join(outside, 'sentinel'), 'utf8')).toBe('keep');
  });

  it('rejects malicious blob and backup-root aliases', async () => {
    const files = fixture();
    const store = await files.open();
    const outside = join(files.root, 'outside');
    mkdirSync(outside, { mode: 0o700 });
    symlinkSync(
      outside,
      join(files.artifacts, 'blobs', reference.sha256),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await expect(store.readArtifact(reference)).rejects.toMatchObject({
      code: 'unsafe_path',
    });
    const alias = join(files.root, 'alias');
    symlinkSync(
      outside,
      alias,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await expect(
      files.open(join(files.root, 'other.sqlite'), alias),
    ).rejects.toMatchObject({ code: 'unsafe_path' });
    await expect(
      restoreSqliteBackup(alias, files.copies),
    ).rejects.toMatchObject({ code: 'unsafe_path' });
    expect(readdirSync(outside)).toEqual([]);
  });

  it('recovers a durable checkpoint prefix, without changing a later uncertain projection', async () => {
    const files = fixture();
    let store = await files.open();
    await store.putArtifact(bytes);
    await store.append(start(), 'start');
    const checkpoint = await store.createCheckpoint('cp-1');
    expect(checkpoint).toMatchObject({
      schemaVersion: 1,
      checkpointId: 'cp-1',
      sequence: 1,
      attempts: [{ status: 'pending', result: null }],
    });
    expect(await store.createCheckpoint('cp-1')).toEqual(checkpoint);
    await store.append(finish(), 'finish');
    expect(await store.loadCheckpoint('cp-1')).toEqual(checkpoint);
    expect((await store.getAttempt(identity))?.status).toBe('uncertain');
    await expect(store.createCheckpoint('cp-1')).rejects.toMatchObject({
      code: 'idempotency_conflict',
    });
    await files.close(store);
    store = await files.open();
    expect(await store.loadCheckpoint('cp-1')).toEqual(checkpoint);
    expect((await store.getAttempt(identity))?.status).toBe('uncertain');
    expect(await store.loadCheckpoint('unknown')).toBeNull();
  });

  it('keeps a harmless orphan when SQL checkpoint insertion fails, then deduplicates on retry', async () => {
    const files = fixture();
    const store = await files.open();
    await store.putArtifact(bytes);
    await store.append(start(), 'start');
    sql(files.path, (db) =>
      db.exec(
        "CREATE TRIGGER fail_cp BEFORE INSERT ON workflow_checkpoints BEGIN SELECT RAISE(ABORT, 'fixture'); END;",
      ),
    );
    await expect(store.createCheckpoint('cp')).rejects.toMatchObject({
      code: 'storage_failure',
    });
    expect(await store.loadCheckpoint('cp')).toBeNull();
    expect(readdirSync(join(files.artifacts, 'blobs'))).toHaveLength(2);
    sql(files.path, (db) => db.exec('DROP TRIGGER fail_cp;'));
    expect((await store.createCheckpoint('cp')).sequence).toBe(1);
    expect(readdirSync(join(files.artifacts, 'blobs'))).toHaveLength(2);
  });

  it('rejects missing checkpoint blobs and valid-hash snapshots inconsistent with the log', async () => {
    const files = fixture();
    const store = await files.open();
    await store.createCheckpoint('cp');
    const fake = await store.putArtifact(
      Buffer.from(
        '{"schemaVersion":1,"checkpointId":"cp","sequence":0,"attempts":[{}]}',
      ),
    );
    sql(files.path, (db) =>
      db
        .prepare(
          'UPDATE workflow_checkpoints SET state_sha256=?,state_bytes=? WHERE checkpoint_id=?',
        )
        .run(fake.sha256, fake.byteLength, 'cp'),
    );
    await expect(store.loadCheckpoint('cp')).rejects.toMatchObject({
      code: 'integrity_failure',
    });
    unlinkSync(join(files.artifacts, 'blobs', fake.sha256));
    await expect(store.loadCheckpoint('cp')).rejects.toMatchObject({
      code: 'artifact_missing',
    });
  });

  it('validates equal-sequence and older checkpoints during ordered replay', async () => {
    const files = fixture();
    let store = await files.open();
    await store.createCheckpoint('z-empty');
    await store.createCheckpoint('a-empty');
    await store.putArtifact(bytes);
    await store.append(start(), 'start');
    await store.createCheckpoint('pending');
    await store.append(finish(), 'finish');
    await store.createCheckpoint('uncertain');
    await files.close(store);
    store = await files.open();
    expect((await store.loadCheckpoint('a-empty'))?.attempts).toEqual([]);
    expect((await store.loadCheckpoint('pending'))?.attempts[0]?.status).toBe(
      'pending',
    );
    expect((await store.getAttempt(identity))?.status).toBe('uncertain');
    const falseSnapshot = await store.putArtifact(Buffer.from('{}'));
    await files.close(store);
    sql(files.path, (db) =>
      db
        .prepare(
          'UPDATE workflow_checkpoints SET state_sha256=?,state_bytes=? WHERE checkpoint_id=?',
        )
        .run(falseSnapshot.sha256, falseSnapshot.byteLength, 'pending'),
    );
    await expect(files.open()).rejects.toMatchObject({
      code: 'integrity_failure',
    });
  });

  it('rejects inconsistent lengths even when the SHA was already verified in the operation', async () => {
    const files = fixture();
    const store = await files.open();
    await store.putArtifact(bytes);
    await store.append(start(), 'start');
    await store.append(finish(), 'finish');
    await files.close(store);
    const invalidFinish = finish();
    if (invalidFinish.type !== 'block.finished')
      throw new Error('Fixture finish');
    sql(files.path, (db) => {
      db.exec('DROP TRIGGER events_no_update');
      db.prepare('UPDATE events SET payload=? WHERE event_id=?').run(
        JSON.stringify({
          ...invalidFinish,
          result: {
            ...invalidFinish.result,
            evidence: [{ ...reference, byteLength: 4 }],
          },
        }),
        'finish',
      );
    });
    await expect(files.open()).rejects.toMatchObject({
      code: 'integrity_failure',
    });
  });

  it('migrates schema v1 additively and supports an empty workflow checkpoint', async () => {
    const files = fixture();
    let store = await files.open();
    await files.close(store);
    sql(files.path, (db) =>
      db.exec('DROP TABLE workflow_checkpoints; PRAGMA user_version=1;'),
    );
    store = await files.open();
    expect(await store.createCheckpoint('empty')).toMatchObject({
      schemaVersion: 1,
      sequence: 0,
      attempts: [],
    });
    expect(
      sql(
        files.path,
        (db) => db.prepare('PRAGMA user_version').get()?.user_version,
      ),
    ).toBe(2);
  });

  it('backs up a live WAL database at a serialized boundary and restores into new isolated directories', async () => {
    const files = fixture();
    const store = await files.open();
    await store.putArtifact(bytes);
    await store.append(start(), 'start');
    const checkpoint = await store.createCheckpoint('cp');
    expect(statSync(`${files.path}-wal`).size).toBeGreaterThan(0);
    const backing = store.createBackup(files.copies);
    const later = store.append(finish(), 'finish');
    const backup = await backing;
    await later;
    const before = await store.readEvents();
    const restored = await restoreSqliteBackup(backup.directory, files.root);
    expect(restored.databasePath).not.toBe(files.path);
    const copy = await files.open(restored.databasePath, restored.artifactRoot);
    expect(await copy.readEvents()).toHaveLength(1);
    expect(await copy.loadCheckpoint('cp')).toEqual(checkpoint);
    expect(Buffer.from(await copy.readArtifact(reference))).toEqual(bytes);
    expect((await copy.append(start(), 'start')).sequence).toBe(1);
    expect(
      sql(
        restored.databasePath,
        (db) => db.prepare('PRAGMA integrity_check').get()?.integrity_check,
      ),
    ).toBe('ok');
    expect(
      sql(restored.databasePath, (db) =>
        db.prepare('PRAGMA foreign_key_check').all(),
      ),
    ).toEqual([]);
    expect(await store.readEvents()).toEqual(before);
    const another = await restoreSqliteBackup(backup.directory, files.root);
    expect(another.directory).not.toBe(restored.directory);
    expect(
      readFileSync(join(backup.directory, 'manifest.json')).byteLength,
    ).toBeGreaterThan(0);
  });

  it.each(['database', 'artifact', 'manifest', 'missing-artifact'] as const)(
    'rejects a corrupt backup %s before accepting any restore',
    async (damage) => {
      const files = fixture();
      const store = await files.open();
      await store.putArtifact(bytes);
      await store.append(start(), 'start');
      await store.createCheckpoint('cp');
      const backup = await store.createBackup(files.copies);
      if (damage === 'database')
        writeFileSync(backup.databasePath, 'broken database');
      if (damage === 'artifact')
        writeFileSync(
          join(backup.artifactRoot, 'blobs', reference.sha256),
          'bad',
        );
      if (damage === 'manifest')
        writeFileSync(
          join(backup.directory, 'manifest.json'),
          '{"schemaVersion":2}',
        );
      if (damage === 'missing-artifact')
        unlinkSync(join(backup.artifactRoot, 'blobs', reference.sha256));
      const before = readdirSync(files.copies);
      await expect(
        restoreSqliteBackup(backup.directory, files.copies),
      ).rejects.toBeDefined();
      expect(readdirSync(files.copies)).toEqual(before);
      expect(Buffer.from(await store.readArtifact(reference))).toEqual(bytes);
    },
  );

  it('rejects incompatible SQLite schema even if its changed backup hash is supplied', async () => {
    const files = fixture();
    const store = await files.open();
    const backup = await store.createBackup(files.copies);
    sql(backup.databasePath, (db) => db.exec('PRAGMA user_version=99;'));
    const parsed: unknown = JSON.parse(
      readFileSync(join(backup.directory, 'manifest.json'), 'utf8'),
    );
    if (typeof parsed !== 'object' || parsed === null)
      throw new Error('Fixture manifest');
    const modified = {
      ...parsed,
      database: {
        sha256: createHash('sha256')
          .update(readFileSync(backup.databasePath))
          .digest('hex'),
        byteLength: statSync(backup.databasePath).size,
      },
    };
    writeFileSync(
      join(backup.directory, 'manifest.json'),
      JSON.stringify(modified),
    );
    await expect(
      restoreSqliteBackup(backup.directory, files.copies),
    ).rejects.toMatchObject({ code: 'integrity_failure' });
  });

  it('rejects logically dangling references even when the backup manifest and SQLite hash are valid', async () => {
    const files = fixture();
    const store = await files.open();
    await store.putArtifact(bytes);
    await store.append(start(), 'start');
    const backup = await store.createBackup(files.copies);
    unlinkSync(join(backup.artifactRoot, 'blobs', reference.sha256));
    const parsed: unknown = JSON.parse(
      readFileSync(join(backup.directory, 'manifest.json'), 'utf8'),
    );
    if (typeof parsed !== 'object' || parsed === null)
      throw new Error('Fixture manifest');
    writeFileSync(
      join(backup.directory, 'manifest.json'),
      JSON.stringify({ ...parsed, artifacts: [] }),
    );
    await expect(
      restoreSqliteBackup(backup.directory, files.copies),
    ).rejects.toMatchObject({ code: 'artifact_missing' });
    const incomplete = readdirSync(files.copies).filter((name) =>
      name.startsWith('beonforge-restore-'),
    );
    expect(incomplete).toHaveLength(1);
    const root = join(files.copies, incomplete[0] ?? 'missing');
    expect(existsSync(join(root, 'beonforge-restore-incomplete'))).toBe(true);
    await expect(files.open(join(root, 'events.sqlite'))).rejects.toMatchObject(
      { code: 'integrity_failure' },
    );
    expect(Buffer.from(await store.readArtifact(reference))).toEqual(bytes);
  });

  it.each(['stage', 'orphan', 'checkpoint', 'checkpoint-incomplete'] as const)(
    'recovers consistently after abrupt child termination at %s',
    async (mode) => {
      const files = fixture();
      let store = await files.open();
      await files.close(store);
      expect(await killedAt(files, mode)).toEqual({ phase: mode });
      store = await files.open();
      if (mode === 'stage') {
        expect(readdirSync(join(files.artifacts, 'staging'))).toHaveLength(1);
        await expect(store.readArtifact(reference)).rejects.toMatchObject({
          code: 'artifact_missing',
        });
        expect(await store.putArtifact(bytes)).toEqual(reference);
      } else if (mode === 'checkpoint-incomplete') {
        expect(await store.loadCheckpoint('interrupted')).toBeNull();
        expect(readdirSync(join(files.artifacts, 'blobs'))).toHaveLength(1);
        expect((await store.createCheckpoint('interrupted')).sequence).toBe(0);
        expect(readdirSync(join(files.artifacts, 'blobs'))).toHaveLength(1);
      } else {
        expect(Buffer.from(await store.readArtifact(reference))).toEqual(bytes);
        if (mode === 'orphan') expect(await store.readEvents()).toEqual([]);
        else
          expect(await store.loadCheckpoint('confirmed')).toMatchObject({
            sequence: 1,
            attempts: [{ status: 'pending' }],
          });
      }
    },
    12000,
  );

  it('rejects a backup interrupted after SQLite copy and before bundle completion', async () => {
    const files = fixture();
    const store = await files.open();
    await store.putArtifact(bytes);
    await store.append(start(), 'start');
    await files.close(store);
    const message = await killedAt(files, 'backup-incomplete');
    if (
      typeof message !== 'object' ||
      message === null ||
      !('directory' in message) ||
      typeof message.directory !== 'string'
    )
      throw new Error('Fixture directory');
    await expect(
      restoreSqliteBackup(message.directory, files.copies),
    ).rejects.toMatchObject({ code: 'integrity_failure' });
  }, 12000);

  it('never activates an interrupted restore and can retry into another isolated directory', async () => {
    const files = fixture();
    const store = await files.open();
    await store.putArtifact(bytes);
    await store.append(start(), 'start');
    const backup = await store.createBackup(files.copies);
    const message = await killedAt(
      files,
      'restore-incomplete',
      backup.directory,
    );
    if (
      typeof message !== 'object' ||
      message === null ||
      !('directory' in message) ||
      typeof message.directory !== 'string'
    )
      throw new Error('Fixture directory');
    await expect(
      files.open(join(message.directory, 'events.sqlite')),
    ).rejects.toMatchObject({ code: 'integrity_failure' });
    const restored = await restoreSqliteBackup(backup.directory, files.copies);
    expect(restored.directory).not.toBe(message.directory);
    const copy = await files.open(restored.databasePath);
    expect(await copy.readEvents()).toHaveLength(1);
    expect(await store.readEvents()).toHaveLength(1);
  }, 12000);
});
