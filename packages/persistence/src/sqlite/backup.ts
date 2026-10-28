import { DatabaseSync, backup } from 'node:sqlite';
import {
  mkdtempSync,
  fsyncSync,
  openSync,
  closeSync,
  constants,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  parseArtifactReference,
  type ArtifactReference,
} from '@beonforge/contracts';
import { PersistenceError } from '../event-store.js';
import type { RecoveryLocation } from '../recovery.js';
import {
  ArtifactFiles,
  SafeDirectory,
  digest,
  syncDirectory,
  entryExists,
} from './artifacts.js';
import { SqliteDatabase } from './database.js';
import { requireRuntime } from './runtime.js';
import process from 'node:process';

interface BackupManifest {
  readonly schemaVersion: 1;
  readonly database: ArtifactReference;
  readonly artifacts: readonly ArtifactReference[];
  readonly sequence: number;
}

function location(parent: string, prefix: string): RecoveryLocation {
  const authorizedParent = new SafeDirectory(parent);
  const directory = mkdtempSync(join(authorizedParent.path, prefix));
  authorizedParent.check();
  return {
    directory,
    databasePath: join(directory, 'events.sqlite'),
    artifactRoot: join(directory, 'events.sqlite.artifacts'),
  };
}

function verify(bytes: Uint8Array, reference: ArtifactReference): void {
  const actual = digest(bytes);
  if (
    actual.sha256 !== reference.sha256 ||
    actual.byteLength !== reference.byteLength
  )
    throw new PersistenceError('integrity_failure');
}

function manifest(bytes: Uint8Array): BackupManifest {
  try {
    const value: unknown = JSON.parse(Buffer.from(bytes).toString('utf8'));
    if (
      typeof value !== 'object' ||
      value === null ||
      Object.keys(value).sort().join(',') !==
        'artifacts,database,schemaVersion,sequence' ||
      !('schemaVersion' in value) ||
      value.schemaVersion !== 1 ||
      !('database' in value) ||
      !('artifacts' in value) ||
      !Array.isArray(value.artifacts) ||
      !('sequence' in value) ||
      typeof value.sequence !== 'number' ||
      !Number.isSafeInteger(value.sequence) ||
      value.sequence < 0
    )
      throw new Error('invalid');
    const artifacts: ArtifactReference[] = (value.artifacts as unknown[]).map(
      parseArtifactReference,
    );
    if (new Set(artifacts.map((ref) => ref.sha256)).size !== artifacts.length)
      throw new Error('duplicate');
    return {
      schemaVersion: 1,
      database: parseArtifactReference(value.database),
      artifacts,
      sequence: value.sequence,
    };
  } catch {
    throw new PersistenceError('integrity_failure');
  }
}

function integrity(db: DatabaseSync): void {
  const rows = db.prepare('PRAGMA integrity_check').all();
  if (
    rows.length !== 1 ||
    rows[0]?.integrity_check !== 'ok' ||
    db.prepare('PRAGMA foreign_key_check').all().length !== 0
  )
    throw new PersistenceError('integrity_failure');
}

function syncFile(path: string): void {
  // Windows FlushFileBuffers requires a write-capable handle; this is our new snapshot only.
  const fd = openSync(path, constants.O_RDWR | (constants.O_NOFOLLOW ?? 0));
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

export async function createBackup(
  database: SqliteDatabase,
  parent: string,
): Promise<RecoveryLocation> {
  database.validate();
  const target = location(parent, 'beonforge-backup-');
  const root = new SafeDirectory(target.directory);
  root.writeExclusive('beonforge-backup-incomplete', new Uint8Array());
  await database.backupTo(root.file('events.sqlite'));
  const sourceReferences = database.artifacts.list();
  const copied = new ArtifactFiles(target.artifactRoot);
  for (const reference of sourceReferences) {
    const actual = copied.put(database.artifacts.read(reference));
    if (actual.sha256 !== reference.sha256)
      throw new PersistenceError('integrity_failure');
  }
  const validatedSnapshot = new SqliteDatabase(
    target.databasePath,
    target.artifactRoot,
  );
  try {
    validatedSnapshot.validate();
  } finally {
    validatedSnapshot.close();
  }
  // Seal the standalone snapshot before hashing; never copy the live .db or ignore active WAL.
  const snapshot = new DatabaseSync(root.file('events.sqlite'), {
    allowExtension: false,
  });
  let sequence: number;
  try {
    if (
      snapshot.prepare('PRAGMA journal_mode=DELETE').get()?.journal_mode !==
      'delete'
    )
      throw new PersistenceError('integrity_failure');
    integrity(snapshot);
    const count = snapshot.prepare('SELECT count(*) AS n FROM events').get()?.n;
    if (typeof count !== 'number')
      throw new PersistenceError('integrity_failure');
    sequence = count;
  } finally {
    snapshot.close();
  }
  syncFile(root.file('events.sqlite'));
  const contents: BackupManifest = {
    schemaVersion: 1,
    database: digest(root.read('events.sqlite')),
    artifacts: sourceReferences,
    sequence,
  };
  root.writeExclusive('manifest.json', Buffer.from(JSON.stringify(contents)));
  unlinkSync(root.file('beonforge-backup-incomplete'));
  syncDirectory(root.path);
  return target;
}

export async function restoreBackup(
  backupDirectory: string,
  destinationParent: string,
): Promise<RecoveryLocation> {
  requireRuntime(process.versions.node);
  const sourceRoot = new SafeDirectory(backupDirectory);
  if (entryExists(sourceRoot.file('beonforge-backup-incomplete')))
    throw new PersistenceError('integrity_failure');
  const contents = manifest(sourceRoot.read('manifest.json'));
  for (const suffix of ['-wal', '-shm', '-journal'])
    if (entryExists(sourceRoot.file(`events.sqlite${suffix}`)))
      throw new PersistenceError('integrity_failure');
  verify(sourceRoot.read('events.sqlite'), contents.database);
  const sourceArtifacts = new ArtifactFiles(
    join(sourceRoot.path, 'events.sqlite.artifacts'),
    false,
  );
  for (const reference of contents.artifacts) sourceArtifacts.read(reference);
  if (
    JSON.stringify(sourceArtifacts.list()) !==
    JSON.stringify(
      [...contents.artifacts].sort((a, b) => a.sha256.localeCompare(b.sha256)),
    )
  )
    throw new PersistenceError('integrity_failure');
  const sourceDb = new DatabaseSync(sourceRoot.file('events.sqlite'), {
    readOnly: true,
    allowExtension: false,
  });
  let target: RecoveryLocation;
  try {
    const sqlite = sourceDb.prepare('SELECT sqlite_version() AS v').get()?.v;
    if (typeof sqlite !== 'string')
      throw new PersistenceError('unsupported_runtime');
    requireRuntime(process.versions.node, sqlite);
    integrity(sourceDb);
    if (
      sourceDb.prepare('PRAGMA user_version').get()?.user_version !== 2 ||
      sourceDb.prepare('PRAGMA application_id').get()?.application_id !==
        0x42464f52 ||
      sourceDb.prepare('SELECT count(*) AS n FROM events').get()?.n !==
        contents.sequence
    )
      throw new PersistenceError('integrity_failure');
    target = location(destinationParent, 'beonforge-restore-');
    const root = new SafeDirectory(target.directory);
    root.writeExclusive('beonforge-restore-incomplete', new Uint8Array());
    await backup(sourceDb, root.file('events.sqlite'));
    const restoredArtifacts = new ArtifactFiles(target.artifactRoot);
    for (const reference of contents.artifacts)
      restoredArtifacts.put(sourceArtifacts.read(reference));
    // Validate the exact copied bytes again, then replay and check every SQL reference/checkpoint.
    for (const reference of contents.artifacts)
      restoredArtifacts.read(reference);
    sourceRoot.check();
    verify(sourceRoot.read('events.sqlite'), contents.database);
    const restored = new SqliteDatabase(
      target.databasePath,
      target.artifactRoot,
      true,
    );
    try {
      restored.validate();
      if (restored.events().length !== contents.sequence)
        throw new PersistenceError('integrity_failure');
    } finally {
      restored.close();
    }
    root.writeExclusive(
      'restore-ready.json',
      Buffer.from(
        JSON.stringify({ schemaVersion: 1, sequence: contents.sequence }),
      ),
    );
    unlinkSync(root.file('beonforge-restore-incomplete'));
    syncDirectory(root.path);
  } finally {
    sourceDb.close();
  }
  return target;
}
