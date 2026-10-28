import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import process from 'node:process';
import {
  ContractValidationError,
  parseBlockExecutionEvent,
  parseBlockManifest,
  parseBlockResult,
  type BlockExecutionEvent,
} from '@beonforge/contracts';
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

/** Worker-only: no instance is constructed on the control-plane event loop. */
export class SqliteDatabase {
  private readonly db: DatabaseSync;

  constructor(path: string) {
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
        version > 1 ||
        (version === 1 && brand !== applicationId) ||
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
      this.rebuild();
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
    return records;
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
    } catch {
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

  close(): void {
    this.db.close();
  }
}
