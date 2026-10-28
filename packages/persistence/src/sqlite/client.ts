import { realpath, lstat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join } from 'node:path';
import process from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';
import { Worker } from 'node:worker_threads';
import type {
  BlockExecutionEvent,
  ArtifactReference,
} from '@beonforge/contracts';
import type {
  DurableStore,
  WorkflowCheckpoint,
  RecoveryLocation,
} from '../recovery.js';
import {
  PersistenceError,
  type EventStore,
  type StoredEvent,
  type AttemptIdentity,
  type AttemptProjection,
} from '../event-store.js';
import { requireRuntime } from './runtime.js';
import type { Command, Reply, Response } from './protocol.js';

const activePaths = new Set<string>();
/** Finite wall-clock budgets. Queue expiry never dispatches the command or kills active work. */
export interface SqliteTimeoutPolicy {
  readonly openingMs?: number;
  readonly queueMs?: number;
  readonly executionMs?: number;
  readonly backupMs?: number;
  readonly restoreMs?: number;
}
const defaultTimeouts: Required<SqliteTimeoutPolicy> = {
  openingMs: 120000,
  queueMs: 120000,
  executionMs: 30000,
  backupMs: 300000,
  restoreMs: 300000,
};
function timeouts(
  value: SqliteTimeoutPolicy = {},
): Required<SqliteTimeoutPolicy> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Object.keys(value).some((key) => !(key in defaultTimeouts))
  )
    throw new PersistenceError('invalid_input');
  const policy = { ...defaultTimeouts, ...value };
  for (const ms of Object.values(policy))
    if (!Number.isSafeInteger(ms) || ms < 1 || ms > 2147483647)
      throw new PersistenceError('invalid_input');
  return policy;
}
interface Pending {
  readonly command: Command;
  readonly resolve: (reply: Reply) => void;
  readonly reject: (error: PersistenceError) => void;
  timer: ReturnType<typeof setTimeout>;
}

class WorkerEventStore implements DurableStore {
  private readonly pending = new Map<number, Pending>();
  private nextId = 0;
  private activeId: number | undefined;
  private closing: Promise<void> | undefined;
  private state: 'opening' | 'open' | 'closing' | 'closed' | 'failed' =
    'opening';
  private readonly exited: Promise<void>;
  readonly ready: Promise<void>;

  constructor(
    private readonly worker: Worker,
    release: () => void,
    private readonly policy: Required<SqliteTimeoutPolicy>,
  ) {
    let readyResolve: () => void;
    let readyReject: (error: PersistenceError) => void;
    this.ready = new Promise<void>((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });
    const startupTimer = setTimeout(() => {
      readyReject(new PersistenceError('storage_failure'));
      this.fail();
    }, policy.openingMs);
    this.exited = new Promise<void>((resolve) => {
      worker.once('exit', () => {
        clearTimeout(startupTimer);
        release();
        if (this.state !== 'closed') this.fail();
        readyReject(new PersistenceError('storage_failure'));
        resolve();
      });
    });
    worker.on('error', () => {
      readyReject(new PersistenceError('storage_failure'));
      this.fail();
    });
    worker.on('message', (response: Response) => {
      if (response.kind === 'ready') {
        if (this.state !== 'opening') return;
        clearTimeout(startupTimer);
        this.state = 'open';
        readyResolve();
        return;
      }
      if (response.kind === 'init-error') {
        clearTimeout(startupTimer);
        readyReject(new PersistenceError(response.code));
        this.fail();
        return;
      }
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      this.activeId = undefined;
      clearTimeout(pending.timer);
      if (response.kind === 'error') {
        pending.reject(new PersistenceError(response.code));
        if (
          response.code === 'outcome_unknown' ||
          response.code === 'incompatible_database'
        )
          this.fail();
      } else {
        if (response.reply.kind === 'closed') this.state = 'closed';
        pending.resolve(response.reply);
      }
      this.dispatch();
    });
  }

  private fail(): void {
    if (this.state === 'failed') return;
    this.state = 'failed';
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(
        new PersistenceError(
          [
            'append',
            'put-artifact',
            'create-checkpoint',
            'backup',
            'restore',
          ].includes(pending.command.kind) && id === this.activeId
            ? 'outcome_unknown'
            : 'storage_failure',
        ),
      );
    }
    this.pending.clear();
    this.activeId = undefined;
    void this.worker.terminate();
  }

  private call(command: Command): Promise<Reply> {
    if (this.state !== 'open')
      return Promise.reject(new PersistenceError('closed'));
    return new Promise<Reply>((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new PersistenceError('queue_timeout'));
      }, this.policy.queueMs);
      this.pending.set(id, { command, resolve, reject, timer });
      this.dispatch();
    });
  }

  private dispatch(): void {
    if (
      this.activeId !== undefined ||
      !['open', 'closing'].includes(this.state)
    )
      return;
    const next = this.pending.entries().next().value;
    if (!next) return;
    const [id, pending] = next;
    this.activeId = id;
    clearTimeout(pending.timer);
    const ms =
      pending.command.kind === 'backup'
        ? this.policy.backupMs
        : pending.command.kind === 'restore'
          ? this.policy.restoreMs
          : this.policy.executionMs;
    pending.timer = setTimeout(() => this.fail(), ms);
    try {
      this.worker.postMessage({ id, command: pending.command });
    } catch {
      this.fail();
    }
  }

  async append(
    event: BlockExecutionEvent,
    idempotencyKey: string,
  ): Promise<StoredEvent> {
    const reply = await this.call({ kind: 'append', event, idempotencyKey });
    if (reply.kind !== 'appended')
      throw new PersistenceError('storage_failure');
    return reply.record;
  }
  async readEvents(): Promise<readonly StoredEvent[]> {
    const reply = await this.call({ kind: 'events' });
    if (reply.kind !== 'events') throw new PersistenceError('storage_failure');
    return reply.records;
  }
  async getAttempt(
    identity: AttemptIdentity,
  ): Promise<AttemptProjection | null> {
    const reply = await this.call({ kind: 'attempt', identity });
    if (reply.kind !== 'attempt') throw new PersistenceError('storage_failure');
    return reply.projection;
  }
  async rebuildProjection(): Promise<void> {
    const reply = await this.call({ kind: 'rebuild' });
    if (reply.kind !== 'rebuilt') throw new PersistenceError('storage_failure');
  }
  async putArtifact(bytes: Uint8Array): Promise<ArtifactReference> {
    const reply = await this.call({ kind: 'put-artifact', bytes });
    if (reply.kind !== 'artifact')
      throw new PersistenceError('storage_failure');
    return reply.reference;
  }
  async readArtifact(reference: ArtifactReference): Promise<Uint8Array> {
    const reply = await this.call({ kind: 'read-artifact', reference });
    if (reply.kind !== 'bytes') throw new PersistenceError('storage_failure');
    return reply.bytes;
  }
  async createCheckpoint(checkpointId: string): Promise<WorkflowCheckpoint> {
    const reply = await this.call({ kind: 'create-checkpoint', checkpointId });
    if (reply.kind !== 'checkpoint' || reply.checkpoint === null)
      throw new PersistenceError('storage_failure');
    return reply.checkpoint;
  }
  async loadCheckpoint(
    checkpointId: string,
  ): Promise<WorkflowCheckpoint | null> {
    const reply = await this.call({ kind: 'load-checkpoint', checkpointId });
    if (reply.kind !== 'checkpoint')
      throw new PersistenceError('storage_failure');
    return reply.checkpoint;
  }
  async createBackup(destinationParent: string): Promise<RecoveryLocation> {
    const reply = await this.call({ kind: 'backup', destinationParent });
    if (reply.kind !== 'location')
      throw new PersistenceError('storage_failure');
    return reply.location;
  }
  async restore(
    backupDirectory: string,
    destinationParent: string,
  ): Promise<RecoveryLocation> {
    const reply = await this.call({
      kind: 'restore',
      backupDirectory,
      destinationParent,
    });
    if (reply.kind !== 'location')
      throw new PersistenceError('storage_failure');
    return reply.location;
  }
  close(): Promise<void> {
    this.closing ??= this.closeOwned();
    return this.closing;
  }

  private async closeOwned(): Promise<void> {
    if (this.state === 'closed') {
      await this.exited;
      return;
    }
    if (this.state === 'failed') {
      await this.exited;
      return;
    }
    const closing = this.call({ kind: 'close' });
    this.state = 'closing';
    let acknowledged = false;
    try {
      const reply = await closing;
      if (reply.kind !== 'closed')
        throw new PersistenceError('storage_failure');
      acknowledged = true;
    } finally {
      if (!acknowledged) this.fail();
      await this.exited;
    }
  }
}

export async function openSqlitePersistence(
  path: string,
  artifactRoot?: string,
  timeoutPolicy?: SqliteTimeoutPolicy,
): Promise<DurableStore> {
  requireRuntime(process.versions.node);
  const policy = timeouts(timeoutPolicy);
  if (artifactRoot !== undefined && typeof artifactRoot !== 'string')
    throw new PersistenceError('invalid_input');
  if (typeof path !== 'string' || !isAbsolute(path))
    throw new PersistenceError('invalid_input');
  let canonical: string;
  try {
    canonical = join(await realpath(dirname(path)), basename(path));
    try {
      if ((await lstat(canonical)).isSymbolicLink())
        throw new PersistenceError('invalid_input');
    } catch (error) {
      if (!(
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ))
        throw error;
    }
  } catch (error) {
    if (error instanceof PersistenceError) throw error;
    throw new PersistenceError('invalid_input');
  }
  const key =
    process.platform === 'win32' ? canonical.toLowerCase() : canonical;
  if (activePaths.has(key)) throw new PersistenceError('busy');
  activePaths.add(key);
  let store: WorkerEventStore;
  try {
    store = new WorkerEventStore(
      new Worker(new URL('./worker.js', import.meta.url), {
        workerData: { path: canonical, artifactRoot },
      }),
      () => activePaths.delete(key),
      policy,
    );
  } catch {
    activePaths.delete(key);
    throw new PersistenceError('storage_failure');
  }
  try {
    await store.ready;
    return store;
  } catch (error) {
    await store.close();
    throw error;
  }
}

export async function openSqliteEventStore(
  path: string,
  timeoutPolicy?: SqliteTimeoutPolicy,
): Promise<EventStore> {
  return openSqlitePersistence(path, undefined, timeoutPolicy);
}

export async function restoreSqliteBackup(
  backupDirectory: string,
  destinationParent: string,
  timeoutPolicy?: SqliteTimeoutPolicy,
): Promise<RecoveryLocation> {
  requireRuntime(process.versions.node);
  const policy = timeouts(timeoutPolicy);
  const store = new WorkerEventStore(
    new Worker(new URL('./worker.js', import.meta.url), {
      workerData: { restoreOnly: true },
    }),
    () => {},
    policy,
  );
  try {
    await store.ready;
    return await store.restore(backupDirectory, destinationParent);
  } finally {
    await store.close();
  }
}
