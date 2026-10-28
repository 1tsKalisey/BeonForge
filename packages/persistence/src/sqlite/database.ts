import { DatabaseSync, backup, type SQLOutputValue } from 'node:sqlite';
import { dirname, join } from 'node:path';
import process from 'node:process';
import {
  ContractValidationError,
  parseBlockExecutionEvent,
  parseBlockManifest,
  parseBlockResult,
  type BlockExecutionEvent,
  type ArtifactReference,
} from '@beonforge/contracts';
import type { WorkflowCheckpoint } from '../recovery.js';
import { ArtifactFiles, entryExists } from './artifacts.js';
import {
  PersistenceError,
  type AttemptIdentity,
  type AttemptProjection,
  type StoredEvent,
} from '../event-store.js';
import { requireRuntime } from './runtime.js';

type Row = Record<string, SQLOutputValue>;
const applicationId = 0x42464f52;

export function normalizeError(error: unknown): PersistenceError {
  if (error instanceof PersistenceError) return error;
  if (error instanceof ContractValidationError)
    return new PersistenceError('invalid_input');
  if (
    typeof error === 'object' &&
    error !== null &&
    'errcode' in error &&
    typeof error.errcode === 'number' &&
    (error.errcode & 255) === 5
  )
    return new PersistenceError('busy');
  return new PersistenceError('storage_failure');
}

function text(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== 'string')
    throw new PersistenceError('incompatible_database');
  return value;
}

function number(row: Row, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new PersistenceError('incompatible_database');
  return value;
}

function identifier(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  )
    throw new PersistenceError('invalid_input');
  return value;
}

function decode(row: Row): StoredEvent {
  try {
    const json: unknown = JSON.parse(text(row, 'payload'));
    const event = parseBlockExecutionEvent(json);
    if (event.eventId !== text(row, 'event_id'))
      throw new PersistenceError('incompatible_database');
    return {
      sequence: number(row, 'sequence'),
      idempotencyKey: identifier(text(row, 'idempotency_key')),
      event,
    };
  } catch {
    throw new PersistenceError('incompatible_database');
  }
}

const migration = `
  CREATE TABLE events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    idempotency_key TEXT NOT NULL UNIQUE,
    payload TEXT NOT NULL
  ) STRICT;
  CREATE TRIGGER events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'append_only'); END;
  CREATE TRIGGER events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'append_only'); END;
  CREATE TABLE attempts (
    run_id TEXT NOT NULL,
    block_id TEXT NOT NULL,
    attempt_id TEXT NOT NULL,
    manifest TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending','succeeded','failed','cancelled','uncertain')),
    result TEXT,
    last_sequence INTEGER NOT NULL REFERENCES events(sequence),
    PRIMARY KEY (run_id, block_id, attempt_id),
    CHECK ((status='pending' AND result IS NULL) OR (status!='pending' AND result IS NOT NULL))
  ) STRICT;
  PRAGMA application_id=${applicationId};
  PRAGMA user_version=1;
`;

const checkpointMigration = `
  CREATE TABLE workflow_checkpoints (
    checkpoint_id TEXT PRIMARY KEY,
    sequence INTEGER NOT NULL CHECK(sequence>=0),
    state_sha256 TEXT NOT NULL,
    state_bytes INTEGER NOT NULL CHECK(state_bytes>=0)
  ) STRICT;
  PRAGMA user_version=2;
`;

/** Worker-only: no instance is constructed on the control-plane event loop. */
export class SqliteDatabase {
  private readonly db: DatabaseSync;
  readonly artifacts: ArtifactFiles;

  constructor(
    path: string,
    artifactRoot = `${path}.artifacts`,
    allowIncompleteRestore = false,
  ) {
    requireRuntime(process.versions.node);
    const probe = new DatabaseSync(':memory:');
    try {
      requireRuntime(
        process.versions.node,
        text(probe.prepare('SELECT sqlite_version() AS v').get() ?? {}, 'v'),
      );
    } finally {
      probe.close();
    }
    if (
      !allowIncompleteRestore &&
      entryExists(join(dirname(path), 'beonforge-restore-incomplete'))
    )
      throw new PersistenceError('integrity_failure');
    this.artifacts = new ArtifactFiles(artifactRoot);
    this.db = new DatabaseSync(path, {
      timeout: 100,
      allowExtension: false,
      enableForeignKeyConstraints: true,
    });
    try {
      const version = number(
        this.db.prepare('PRAGMA user_version').get() ?? {},
        'user_version',
      );
      const brand = number(
        this.db.prepare('PRAGMA application_id').get() ?? {},
        'application_id',
      );
      if (
        version > 2 ||
        (version > 0 && brand !== applicationId) ||
        (version === 0 &&
          (brand !== 0 ||
            this.db
              .prepare(
                "SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'",
              )
              .all().length > 0))
      )
        throw new PersistenceError('incompatible_database');
      if (
        text(
          this.db.prepare('PRAGMA journal_mode=WAL').get() ?? {},
          'journal_mode',
        ) !== 'wal'
      )
        throw new PersistenceError('incompatible_database');
      this.db.exec('PRAGMA synchronous=FULL;');
      if (
        number(
          this.db.prepare('PRAGMA synchronous').get() ?? {},
          'synchronous',
        ) !== 2
      )
        throw new PersistenceError('incompatible_database');
      if (version === 0) this.transaction(() => this.db.exec(migration));
      if (version < 2)
        this.transaction(() => this.db.exec(checkpointMigration));
      this.rebuild();
      this.validate();
    } catch (error) {
      this.db.close();
      throw normalizeError(error);
    }
  }

  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const result = work();
      this.db.exec('COMMIT;');
      return result;
    } catch (error) {
      try {
        this.db.exec('ROLLBACK;');
      } catch {
        throw new PersistenceError('outcome_unknown');
      }
      throw normalizeError(error);
    }
  }

  private apply(record: StoredEvent): void {
    const { event, sequence } = record;
    if (event.type === 'block.started') {
      const manifest = JSON.stringify(event.manifest);
      const previous = this.db
        .prepare(
          'SELECT manifest, status FROM attempts WHERE run_id=? AND block_id=? ORDER BY last_sequence DESC LIMIT 1',
        )
        .get(event.runId, event.manifest.blockId);
      if (
        previous &&
        (text(previous, 'manifest') !== manifest ||
          text(previous, 'status') !== 'failed')
      )
        throw new PersistenceError('invalid_sequence');
      const existing = this.db
        .prepare(
          'SELECT 1 FROM attempts WHERE run_id=? AND block_id=? AND attempt_id=?',
        )
        .get(event.runId, event.manifest.blockId, event.attemptId);
      if (existing) throw new PersistenceError('invalid_sequence');
      this.db
        .prepare("INSERT INTO attempts VALUES (?, ?, ?, ?, 'pending', NULL, ?)")
        .run(
          event.runId,
          event.manifest.blockId,
          event.attemptId,
          manifest,
          sequence,
        );
    } else {
      const result = event.result;
      const updated = this.db
        .prepare(
          "UPDATE attempts SET status=?, result=?, last_sequence=? WHERE run_id=? AND block_id=? AND attempt_id=? AND status='pending'",
        )
        .run(
          result.status,
          JSON.stringify(result),
          sequence,
          result.runId,
          result.blockId,
          result.attemptId,
        );
      if (updated.changes !== 1) throw new PersistenceError('invalid_sequence');
    }
  }

  append(value: BlockExecutionEvent, key: string): StoredEvent {
    const event = parseBlockExecutionEvent(value);
    this.verifyReferences(event);
    const idempotencyKey = identifier(key);
    const payload = JSON.stringify(event);
    return this.transaction(() => {
      const existing = this.db
        .prepare('SELECT * FROM events WHERE idempotency_key=?')
        .get(idempotencyKey);
      if (existing) {
        if (text(existing, 'payload') !== payload)
          throw new PersistenceError('idempotency_conflict');
        return decode(existing);
      }
      if (
        this.db
          .prepare('SELECT 1 FROM events WHERE event_id=?')
          .get(event.eventId)
      )
        throw new PersistenceError('idempotency_conflict');
      const inserted = this.db
        .prepare(
          'INSERT INTO events(event_id, idempotency_key, payload) VALUES (?, ?, ?)',
        )
        .run(event.eventId, idempotencyKey, payload);
      const sequence = Number(inserted.lastInsertRowid);
      if (!Number.isSafeInteger(sequence))
        throw new PersistenceError('storage_failure');
      const record: StoredEvent = { sequence, idempotencyKey, event };
      this.apply(record);
      return record;
    });
  }

  events(): readonly StoredEvent[] {
    const records = this.db
      .prepare('SELECT * FROM events ORDER BY sequence')
      .all()
      .map(decode);
    if (records.some((record, index) => record.sequence !== index + 1))
      throw new PersistenceError('incompatible_database');
    for (const record of records) this.verifyReferences(record.event);
    return records;
  }

  private verifyReferences(event: BlockExecutionEvent): void {
    const references =
      event.type === 'block.started'
        ? event.manifest.inputs
        : event.result.evidence;
    for (const reference of references) this.artifacts.read(reference);
  }

  attempt(identity: AttemptIdentity): AttemptProjection | null {
    if (typeof identity !== 'object' || identity === null)
      throw new PersistenceError('invalid_input');
    const runId = identifier(identity.runId);
    const blockId = identifier(identity.blockId);
    const attemptId = identifier(identity.attemptId);
    const row = this.db
      .prepare(
        'SELECT * FROM attempts WHERE run_id=? AND block_id=? AND attempt_id=?',
      )
      .get(runId, blockId, attemptId);
    if (!row) return null;
    try {
      const rawManifest: unknown = JSON.parse(text(row, 'manifest'));
      const manifest = parseBlockManifest(rawManifest);
      const rawResult: unknown =
        row.result === null ? null : JSON.parse(text(row, 'result'));
      const result = rawResult === null ? null : parseBlockResult(rawResult);
      for (const reference of manifest.inputs) this.artifacts.read(reference);
      for (const reference of result?.evidence ?? [])
        this.artifacts.read(reference);
      const status = result?.status ?? 'pending';
      if (
        status !== row.status ||
        manifest.blockId !== blockId ||
        (result &&
          (result.runId !== runId ||
            result.blockId !== blockId ||
            result.attemptId !== attemptId))
      )
        throw new PersistenceError('incompatible_database');
      return {
        runId,
        blockId,
        attemptId,
        manifest,
        status,
        result,
        lastSequence: number(row, 'last_sequence'),
      };
    } catch (error) {
      if (
        error instanceof PersistenceError &&
        ['artifact_missing', 'integrity_failure', 'unsafe_path'].includes(
          error.code,
        )
      )
        throw error;
      throw new PersistenceError('incompatible_database');
    }
  }

  rebuild(): void {
    this.transaction(() => {
      const records = this.events();
      this.db.exec('DELETE FROM attempts;');
      for (const record of records) this.apply(record);
    });
  }

  private snapshot(checkpointId: string, sequence: number): WorkflowCheckpoint {
    const records = this.events();
    if (sequence > records.length)
      throw new PersistenceError('integrity_failure');
    this.db.exec('SAVEPOINT workflow_snapshot;');
    try {
      this.db.exec('DELETE FROM attempts;');
      for (const record of records.slice(0, sequence)) this.apply(record);
      const identities = this.db
        .prepare(
          'SELECT run_id, block_id, attempt_id FROM attempts ORDER BY run_id, block_id, attempt_id',
        )
        .all();
      const attempts = identities.map((row) => {
        const attempt = this.attempt({
          runId: text(row, 'run_id'),
          blockId: text(row, 'block_id'),
          attemptId: text(row, 'attempt_id'),
        });
        if (!attempt) throw new PersistenceError('integrity_failure');
        return attempt;
      });
      return { schemaVersion: 1, checkpointId, sequence, attempts };
    } finally {
      try {
        this.db.exec(
          'ROLLBACK TO workflow_snapshot; RELEASE workflow_snapshot;',
        );
      } catch {
        throw new PersistenceError('outcome_unknown');
      }
    }
  }

  createCheckpoint(id: string): WorkflowCheckpoint {
    const checkpointId = identifier(id);
    const sequence = this.events().length;
    const existing = this.db
      .prepare(
        'SELECT sequence FROM workflow_checkpoints WHERE checkpoint_id=?',
      )
      .get(checkpointId);
    if (existing) {
      if (number(existing, 'sequence') !== sequence)
        throw new PersistenceError('idempotency_conflict');
      const checkpoint = this.loadCheckpoint(checkpointId);
      if (!checkpoint) throw new PersistenceError('integrity_failure');
      return checkpoint;
    }
    const checkpoint = this.snapshot(checkpointId, sequence);
    const reference = this.artifacts.put(
      Buffer.from(JSON.stringify(checkpoint)),
    );
    this.transaction(() => {
      this.artifacts.read(reference);
      this.db
        .prepare('INSERT INTO workflow_checkpoints VALUES (?, ?, ?, ?)')
        .run(checkpointId, sequence, reference.sha256, reference.byteLength);
    });
    return checkpoint;
  }

  loadCheckpoint(id: string): WorkflowCheckpoint | null {
    const checkpointId = identifier(id);
    const row = this.db
      .prepare('SELECT * FROM workflow_checkpoints WHERE checkpoint_id=?')
      .get(checkpointId);
    if (!row) return null;
    const reference: ArtifactReference = {
      sha256: text(row, 'state_sha256'),
      byteLength: number(row, 'state_bytes'),
    };
    const actual = this.artifacts.read(reference);
    const expected = this.snapshot(checkpointId, number(row, 'sequence'));
    if (!Buffer.from(actual).equals(Buffer.from(JSON.stringify(expected))))
      throw new PersistenceError('integrity_failure');
    return expected;
  }

  validate(): void {
    const integrity = this.db.prepare('PRAGMA integrity_check').all();
    if (
      integrity.length !== 1 ||
      integrity[0]?.integrity_check !== 'ok' ||
      this.db.prepare('PRAGMA foreign_key_check').all().length !== 0
    )
      throw new PersistenceError('integrity_failure');
    this.events();
    for (const row of this.db
      .prepare('SELECT checkpoint_id FROM workflow_checkpoints')
      .all())
      this.loadCheckpoint(text(row, 'checkpoint_id'));
  }

  async backupTo(path: string): Promise<void> {
    this.validate();
    if (entryExists(path)) throw new PersistenceError('unsafe_path');
    await backup(this.db, path);
  }

  close(): void {
    this.db.close();
  }
}
