import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const prefix = 'beonforge-sqlite-spike-';
const temporaryRoot = realpathSync(tmpdir());

// These checks also constrain the child/worker to the parent's disposable fixture.
export function databasePath(directory) {
  const root = resolve(directory);
  assert.equal(dirname(root), temporaryRoot);
  assert.ok(basename(root).startsWith(prefix));
  assert.equal(realpathSync(root), root);
  return join(root, 'spike.sqlite');
}

export function openDatabase(directory, mode, timeout = 0) {
  assert.ok(mode === 'FULL' || mode === 'NORMAL');
  const db = new DatabaseSync(databasePath(directory), {
    timeout,
    allowExtension: false,
  });
  try {
    assert.equal(
      db.prepare('PRAGMA journal_mode=WAL').get().journal_mode,
      'wal',
    );
    db.exec(`PRAGMA synchronous=${mode}; PRAGMA wal_autocheckpoint=0;`);
    assert.equal(
      db.prepare('PRAGMA synchronous').get().synchronous,
      mode === 'FULL' ? 2 : 1,
    );
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export const schema = `
  BEGIN IMMEDIATE;
  CREATE TABLE operations (
    id INTEGER PRIMARY KEY,
    idem TEXT NOT NULL UNIQUE,
    payload TEXT NOT NULL
  ) STRICT;
  CREATE TABLE projection (
    operation_id INTEGER PRIMARY KEY REFERENCES operations(id),
    value TEXT NOT NULL
  ) STRICT;
  PRAGMA user_version=1;
  COMMIT;
`;

export function fixture(t) {
  const directory = mkdtempSync(join(temporaryRoot, prefix));
  const connections = new Set();
  t.after(() => {
    for (const db of connections) db.close();
    // Exact mkdtemp-created root, validated before recursive removal.
    databasePath(directory);
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    directory,
    open(mode = 'FULL', timeout = 0) {
      const db = openDatabase(directory, mode, timeout);
      connections.add(db);
      return db;
    },
    close(db) {
      db.close();
      connections.delete(db);
    },
  };
}

export function integrity(db) {
  assert.deepEqual(
    db
      .prepare('PRAGMA integrity_check')
      .all()
      .map((row) => row.integrity_check),
    ['ok'],
  );
}

export function sqliteCode(expected) {
  return (error) =>
    error.code === 'ERR_SQLITE_ERROR' && (error.errcode & 0xff) === expected;
}
