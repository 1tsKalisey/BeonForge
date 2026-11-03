// B06-01: synthetic-only task service over accepted executors (D-048).
// No real Codex, provider, credential, network, arbitrary path, command or
// executable. Executors are a fixed server-side registry; clients only pick an id.
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, stat } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types } from 'node:util';
import { parseArtifactReference } from '@beonforge/contracts';
import {
  openSqlitePersistence,
  type DurableStore,
} from '@beonforge/persistence';
import { canonical } from '@beonforge/workspace';
import {
  prepareBugfixDemo,
  runBugfixDemo,
  inspectBugfixDemo,
  reviewBugfixDemo,
  BugfixError,
  type BugfixPolicy,
} from '../bugfix/demo.ts';
import {
  prepareSimulatedCodexRun,
  executeSimulatedCodexRun,
  inspectSimulatedCodexRun,
} from '../codex/adapter.ts';

export type TaskErrorCode =
  | 'task_invalid'
  | 'task_not_found'
  | 'task_denied'
  | 'task_conflict'
  | 'task_busy'
  | 'task_storage_failure';
export class TaskError extends Error {
  readonly code: TaskErrorCode;
  constructor(code: TaskErrorCode) {
    super(code);
    this.name = 'TaskError';
    this.code = code;
  }
}
const fail = (code: TaskErrorCode): never => {
  throw new TaskError(code);
};

export type ExecutorId = 'synthetic-bugfix' | 'codex-simulated';
export interface ExecutorDescriptor {
  readonly id: ExecutorId;
  readonly label: string;
  // Literal type: no executor in this registry can be real.
  readonly simulated: true;
  readonly evidence: readonly ('tests' | 'diff' | 'proposal')[];
  readonly review: boolean;
}
const PREFIX: Readonly<Record<ExecutorId, string>> = {
  'synthetic-bugfix': 'bugfix',
  'codex-simulated': 'codexsim',
};
export const EXECUTORS: readonly ExecutorDescriptor[] = Object.freeze([
  Object.freeze({
    id: 'synthetic-bugfix',
    label: 'Bugfix sintético M04.1 (parche fijo)',
    simulated: true,
    evidence: Object.freeze(['tests', 'diff'] as const),
    review: true,
  }),
  Object.freeze({
    id: 'codex-simulated',
    label: 'Codex simulado c.2 (sólo propuesta)',
    simulated: true,
    evidence: Object.freeze(['proposal'] as const),
    review: false,
  }),
]);

export type TaskState =
  | 'prepared'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'blocked'
  | 'invalid';
export interface TestEvidence {
  readonly phase: 'red' | 'green';
  readonly assertion: string;
  readonly exitCode: number;
  readonly command: string;
  readonly evidenceSha256: string;
}
export interface ProposalEvidence {
  readonly baseCommit: string;
  readonly path: string;
  readonly preimageSha256: string;
  readonly contentSha256: string;
  readonly matchesKnownPostimage: boolean;
  readonly evidenceSha256: string;
}
export type ReviewView =
  | { readonly status: 'not_available' }
  | { readonly status: 'pending' }
  | {
      readonly status: 'confirmed' | 'uncertain' | 'unconfirmed';
      readonly decision: 'approve' | 'discard';
    };
export interface TaskView {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly executor: ExecutorId;
  readonly simulated: true;
  readonly createdAt: string;
  readonly state: TaskState;
  readonly preview: {
    readonly baseCommit: string;
    readonly path: string;
    readonly beforeSha256: string;
    readonly afterSha256: string;
    readonly patchSha256: string;
  } | null;
  readonly steps: readonly {
    readonly blockId: string;
    readonly status: string;
  }[];
  readonly tests: readonly TestEvidence[];
  readonly diff: {
    readonly text: string;
    readonly evidenceSha256: string;
  } | null;
  readonly proposal: ProposalEvidence | null;
  readonly review: ReviewView;
  readonly integration: 'not_performed';
  readonly lastError: string | null;
}

const ID =
  /^(bugfix|codexsim)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const REPO = fileURLToPath(new URL('../../../../', import.meta.url));

// Own data properties of a plain JSON object with exactly these keys.
export function dto(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    types.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return fail('task_invalid');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const names = Object.keys(descriptors);
  if (
    names.length !== keys.length ||
    keys.some((key) => !Object.hasOwn(descriptors, key)) ||
    Object.values(descriptors).some((d) => !Object.hasOwn(d, 'value'))
  )
    return fail('task_invalid');
  const data = value as Record<string, unknown>;
  if (data['schemaVersion'] !== 1) return fail('task_invalid');
  return data;
}
function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object' || types.isProxy(value))
    return undefined;
  const d = Object.getOwnPropertyDescriptor(value, key);
  return d && Object.hasOwn(d, 'value') ? (d.value as unknown) : undefined;
}
const decode = (bytes: Uint8Array): unknown =>
  JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));

function stateOf(statuses: readonly string[]): TaskState {
  if (statuses.every((s) => s === 'not_started')) return 'prepared';
  if (statuses.some((s) => s === 'uncertain' || s === 'pending'))
    return 'blocked';
  if (statuses.some((s) => s === 'failed')) return 'failed';
  if (statuses.some((s) => s === 'cancelled')) return 'cancelled';
  if (statuses.every((s) => s === 'succeeded')) return 'succeeded';
  // A partially started run without an outcome is never retried.
  return 'blocked';
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (field(error, 'code') === 'ENOENT') return false;
    throw error;
  }
}

/** Validates an operator-authorized data directory outside the BeonForge checkout. */
export async function authorizeDataDirectory(path: string): Promise<string> {
  if (typeof path !== 'string' || !isAbsolute(path)) return fail('task_denied');
  let resolved: string;
  try {
    resolved = await canonical(path);
  } catch {
    return fail('task_denied');
  }
  // D-043: synthetic data never lives inside the BeonForge checkout itself.
  const rel = relative(await canonical(REPO.replace(/[\\/]$/, '')), resolved);
  const insideRepo = rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  if (resolved !== path || insideRepo || !(await stat(resolved)).isDirectory())
    return fail('task_denied');
  return resolved;
}

export class TaskService {
  readonly #tasks: string;
  readonly #views = new Map<string, TaskView>();
  readonly #errors = new Map<string, string>();
  readonly #jobs = new Set<Promise<void>>();
  readonly #abort = new AbortController();
  #busy: string | null = null;

  private constructor(tasks: string) {
    this.#tasks = tasks;
  }

  static async open(dataDirectory: string): Promise<TaskService> {
    const data = await authorizeDataDirectory(dataDirectory);
    const tasks = join(data, 'tasks');
    await mkdir(tasks, { recursive: true });
    if ((await canonical(tasks)) !== tasks) return fail('task_denied');
    return new TaskService(tasks);
  }

  get busy(): string | null {
    return this.#busy;
  }

  async list(): Promise<TaskView[]> {
    const ids = (await readdir(this.#tasks)).filter((name) => ID.test(name));
    const views = await Promise.all(ids.map((id) => this.get(id)));
    return views.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async get(id: string): Promise<TaskView> {
    if (typeof id !== 'string' || !ID.test(id)) return fail('task_not_found');
    const cached = this.#views.get(id);
    if (cached && (this.#busy === id || cached.state !== 'running'))
      return cached;
    if (!(await exists(join(this.#tasks, id)))) return fail('task_not_found');
    const view = await this.#inspect(id);
    this.#views.set(id, view);
    return view;
  }

  /** Creates and prepares a new synthetic fixture for one registered executor. */
  async create(request: unknown): Promise<TaskView> {
    const body = dto(request, ['schemaVersion', 'executor']);
    const executor = EXECUTORS.find((e) => e.id === body['executor']);
    if (!executor) return fail('task_invalid');
    return this.#exclusive('new', async () => {
      const id = `${PREFIX[executor.id]}-${randomUUID()}`;
      const dir = join(this.#tasks, id);
      await mkdir(dir);
      await mkdir(join(dir, 'fixture'));
      try {
        await prepareBugfixDemo(join(dir, 'fixture'));
      } catch (error) {
        this.#errors.set(
          id,
          error instanceof BugfixError ? error.code : 'prepare_failed',
        );
      }
      this.#views.delete(id);
      return this.get(id);
    });
  }

  /** Starts one run. Never retries: only a task with no started block can run. */
  async run(id: string, request: unknown): Promise<TaskView> {
    return this.#background(id, async () => {
      const view = await this.get(id);
      const body =
        view.executor === 'synthetic-bugfix'
          ? dto(request, ['schemaVersion', 'confirmPatchSha256'])
          : dto(request, ['schemaVersion']);
      if (view.state !== 'prepared' || !view.preview)
        return fail('task_conflict');
      const confirm = body['confirmPatchSha256'];
      if (
        view.executor === 'synthetic-bugfix' &&
        (typeof confirm !== 'string' ||
          !HEX64.test(confirm) ||
          confirm !== view.preview.patchSha256)
      )
        return fail('task_denied');
      const root = await this.#root(id);
      const preview = view.preview;
      return {
        view,
        fn: async (signal: AbortSignal) => {
          if (view.executor === 'synthetic-bugfix') {
            const policy: BugfixPolicy = {
              root,
              canRead: true,
              canRun: true,
              canPatch: true,
              patchSha256: preview.patchSha256,
            };
            await runBugfixDemo(root, policy, signal);
            return;
          }
          const database = join(this.#tasks, id, 'codex', 'events.sqlite');
          if (await exists(join(this.#tasks, id, 'codex')))
            return fail('task_conflict');
          await mkdir(join(this.#tasks, id, 'codex'));
          const grant = prepareSimulatedCodexRun({
            schemaVersion: 1,
            baseCommit: preview.baseCommit,
            preimageSha256: preview.beforeSha256,
            path: 'src/add.ts',
          });
          const store = await openSqlitePersistence(database);
          try {
            await executeSimulatedCodexRun(grant, store, signal);
          } finally {
            await store.close();
          }
        },
      };
    });
  }

  /** Records an explicit caller decision through M04.1. Never automatic. */
  async review(id: string, request: unknown): Promise<TaskView> {
    return this.#background(id, async () => {
      const view = await this.get(id);
      const body = dto(request, [
        'schemaVersion',
        'decision',
        'evidenceSha256',
      ]);
      const decision = body['decision'];
      const evidence = body['evidenceSha256'];
      if (
        view.executor !== 'synthetic-bugfix' ||
        (decision !== 'approve' && decision !== 'discard') ||
        typeof evidence !== 'string' ||
        !HEX64.test(evidence)
      )
        return fail('task_invalid');
      if (
        view.state !== 'succeeded' ||
        view.review.status !== 'pending' ||
        !view.diff
      )
        return fail('task_conflict');
      if (evidence !== view.diff.evidenceSha256) return fail('task_denied');
      const root = await this.#root(id);
      return {
        view,
        fn: async (signal: AbortSignal) => {
          await reviewBugfixDemo(
            root,
            decision,
            evidence,
            {
              root,
              canRead: true,
              canReview: true,
              canDiscard: decision === 'discard',
            },
            signal,
          );
        },
      };
    });
  }

  /** Cooperative cancellation of in-flight work, then waits for it to settle. */
  async close(): Promise<void> {
    this.#abort.abort();
    await Promise.allSettled([...this.#jobs]);
  }

  async #exclusive<T>(id: string, fn: () => Promise<T>): Promise<T> {
    if (this.#busy !== null) return fail('task_busy');
    this.#busy = id;
    try {
      return await fn();
    } finally {
      this.#busy = null;
    }
  }

  // Claims the single mutation slot BEFORE validating, so two concurrent
  // requests can never both observe the same prepared state.
  async #background(
    id: string,
    check: () => Promise<{
      view: TaskView;
      fn: (signal: AbortSignal) => Promise<void>;
    }>,
  ): Promise<TaskView> {
    if (this.#busy !== null) return fail('task_busy');
    this.#busy = id;
    let view: TaskView, fn: (signal: AbortSignal) => Promise<void>;
    try {
      this.#views.delete(id);
      ({ view, fn } = await check());
    } catch (error) {
      this.#busy = null;
      throw error;
    }
    this.#errors.delete(id);
    const running: TaskView = { ...view, state: 'running', lastError: null };
    this.#views.set(id, running);
    const job = (async () => {
      try {
        await fn(this.#abort.signal);
      } catch (error) {
        this.#errors.set(
          id,
          error instanceof BugfixError || error instanceof TaskError
            ? error.code
            : 'execution_failed',
        );
      } finally {
        this.#views.delete(id);
        this.#busy = null;
      }
    })();
    this.#jobs.add(job);
    void job.finally(() => this.#jobs.delete(job));
    return running;
  }

  async #root(id: string): Promise<string> {
    const fixture = join(this.#tasks, id, 'fixture');
    const entries = (await readdir(fixture)).filter((n) =>
      n.startsWith('beonforge-bugfix-'),
    );
    if (entries.length !== 1 || !entries[0])
      return fail('task_storage_failure');
    return join(fixture, entries[0]);
  }

  async #inspect(id: string): Promise<TaskView> {
    const executor: ExecutorId = id.startsWith('bugfix-')
      ? 'synthetic-bugfix'
      : 'codex-simulated';
    const base = {
      schemaVersion: 1 as const,
      id,
      executor,
      simulated: true as const,
      createdAt: (await stat(join(this.#tasks, id))).birthtime.toISOString(),
      integration: 'not_performed' as const,
      lastError: this.#errors.get(id) ?? null,
    };
    const empty = {
      preview: null,
      steps: [],
      tests: [],
      diff: null,
      proposal: null,
      review: { status: 'not_available' } as const,
    };
    let root: string;
    let inspection: Awaited<ReturnType<typeof inspectBugfixDemo>>;
    try {
      root = await this.#root(id);
      inspection = await inspectBugfixDemo(root, { root, canRead: true });
    } catch (error) {
      return {
        ...base,
        ...empty,
        state: 'invalid',
        lastError:
          base.lastError ??
          (error instanceof BugfixError || error instanceof TaskError
            ? error.code
            : 'inspect_failed'),
      };
    }
    const p = inspection.preview;
    const preview = {
      baseCommit: p.baseCommit,
      path: p.path,
      beforeSha256: p.beforeSha256,
      afterSha256: p.afterSha256,
      patchSha256: p.patchSha256,
    };
    if (executor === 'codex-simulated')
      return {
        ...base,
        ...empty,
        preview,
        ...(await this.#codex(id, preview.afterSha256)),
      };

    const steps = inspection.attempts.map((a) => ({
      blockId: a.blockId,
      status: a.status,
    }));
    const tests = await this.#tests(root, steps);
    const artifact = inspection.artifact;
    const evidence = inspection.evidence;
    const diff =
      evidence &&
      field(artifact, 'kind') === 'synthetic-bugfix-evidence' &&
      typeof field(artifact, 'diff') === 'string'
        ? {
            text: field(artifact, 'diff') as string,
            evidenceSha256: evidence.sha256,
          }
        : null;
    const r: unknown = inspection.review;
    const recorded = field(r, 'status');
    const review: ReviewView = !diff
      ? { status: 'not_available' }
      : r === 'pending'
        ? { status: 'pending' }
        : {
            status:
              recorded === 'confirmed'
                ? 'confirmed'
                : recorded === 'uncertain'
                  ? 'uncertain'
                  : 'unconfirmed',
            decision:
              field(r, 'decision') === 'discard' ? 'discard' : 'approve',
          };
    let state = stateOf(steps.map((s) => s.status));
    if (state === 'succeeded' && !diff) state = 'blocked';
    if (review.status === 'uncertain' || review.status === 'unconfirmed')
      state = 'blocked';
    return {
      ...base,
      preview,
      steps,
      tests,
      diff,
      proposal: null,
      review,
      state,
    };
  }

  // Reads the red/green test summaries persisted by M04.1 in its own store.
  async #tests(
    root: string,
    steps: readonly { blockId: string; status: string }[],
  ): Promise<TestEvidence[]> {
    const phases = (['red', 'green'] as const).filter((phase) =>
      steps.some((s) => s.blockId === phase && s.status === 'succeeded'),
    );
    if (!phases.length) return [];
    const store = await openSqlitePersistence(
      join(root, 'storage', 'events.sqlite'),
    );
    try {
      const tests: TestEvidence[] = [];
      for (const phase of phases) {
        const attempt = await store.getAttempt({
          runId: 'synthetic-bugfix',
          blockId: phase,
          attemptId: '1',
        });
        const ref =
          attempt?.status === 'succeeded'
            ? attempt.result?.evidence[0]
            : undefined;
        if (!ref) continue;
        const summary = decode(await store.readArtifact(ref));
        const assertion = field(summary, 'assertion');
        const exitCode = field(summary, 'exitCode');
        const command = field(summary, 'command');
        if (
          typeof assertion === 'string' &&
          typeof exitCode === 'number' &&
          typeof command === 'string'
        )
          tests.push({
            phase,
            assertion,
            exitCode,
            command,
            evidenceSha256: ref.sha256,
          });
      }
      return tests;
    } finally {
      await store.close();
    }
  }

  // c.2 evidence lives in its own store; it never borrows M04.1 run evidence.
  async #codex(
    id: string,
    knownPostimage: string,
  ): Promise<Pick<TaskView, 'state' | 'steps' | 'proposal'>> {
    const dir = join(this.#tasks, id, 'codex');
    if (!(await exists(dir)))
      return {
        state: 'prepared',
        steps: [{ blockId: 'codex-run', status: 'not_started' }],
        proposal: null,
      };
    const database = join(dir, 'events.sqlite');
    if (!(await exists(database)))
      return {
        state: 'blocked',
        steps: [{ blockId: 'codex-run', status: 'not_started' }],
        proposal: null,
      };
    const store: DurableStore = await openSqlitePersistence(database);
    try {
      const started = (await store.readEvents()).find(
        (e) =>
          e.event.type === 'block.started' &&
          e.event.manifest.blockId === 'codex-run',
      );
      const runId =
        started?.event.type === 'block.started' ? started.event.runId : null;
      const run = runId ? await inspectSimulatedCodexRun(store, runId) : null;
      const status = run?.status ?? 'not_started';
      let proposal: ProposalEvidence | null = null;
      if (run?.proposalRef) {
        const ref = parseArtifactReference(run.proposalRef);
        const data = decode(await store.readArtifact(ref));
        const baseCommit = field(data, 'baseCommit');
        const path = field(data, 'path');
        const preimageSha256 = field(data, 'preimageSha256');
        const contentSha256 = field(data, 'contentSha256');
        if (
          typeof baseCommit === 'string' &&
          typeof path === 'string' &&
          typeof preimageSha256 === 'string' &&
          typeof contentSha256 === 'string'
        )
          proposal = {
            baseCommit,
            path,
            preimageSha256,
            contentSha256,
            matchesKnownPostimage: contentSha256 === knownPostimage,
            evidenceSha256: ref.sha256,
          };
      }
      let state: TaskState =
        status === 'not_started' ? 'blocked' : stateOf([status]);
      if (state === 'succeeded' && !proposal) state = 'blocked';
      return { state, steps: [{ blockId: 'codex-run', status }], proposal };
    } finally {
      await store.close();
    }
  }
}
