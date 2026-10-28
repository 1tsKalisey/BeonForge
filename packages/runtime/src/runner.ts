import { createHash } from 'node:crypto';
import { setTimeout, clearTimeout } from 'node:timers';
import {
  parseBlockManifest,
  parseBlockResult,
  type ArtifactReference,
  type BlockManifest,
  type BlockResult,
  type BlockExecutionError,
} from '@beonforge/contracts';
import type {
  AttemptProjection,
  DurableStore,
  StoredEvent,
} from '@beonforge/persistence';
import {
  identifier,
  orderedNodes,
  parseWorkflow,
  PLAN_BLOCK,
  WorkflowError,
  type Workflow,
  type WorkflowNode,
} from './workflow.js';

export type HandlerReport =
  | {
      readonly status: 'succeeded' | 'cancelled';
      readonly outputs: readonly Uint8Array[];
    }
  | {
      readonly status: 'failed' | 'uncertain';
      readonly outputs: readonly Uint8Array[];
      readonly error: BlockExecutionError;
    };
export interface BlockHandler {
  readonly name: string;
  readonly version: number;
  readonly effects: BlockManifest['effects'];
  execute(context: {
    readonly inputs: readonly Uint8Array[];
    readonly signal: AbortSignal;
  }): Promise<HandlerReport>;
}
export interface RunOptions {
  readonly external?: readonly string[];
  readonly retryFailed?: readonly string[];
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}
export interface RunReport {
  readonly runId: string;
  readonly status: 'succeeded' | 'failed' | 'cancelled' | 'blocked';
  readonly completed: readonly string[];
  readonly stoppedBlock: string | null;
  readonly reason: 'pending' | 'uncertain' | 'failed' | 'cancelled' | null;
  readonly recoveredFrom: number;
  readonly tailEvents: number;
  readonly checkpointSequence: number;
  /** Observed stopped-attempt cancellation: true confirmed, false boundary-only, null unknown/not applicable. */
  readonly cancellationPersisted?: boolean | null;
}
const busy = new WeakSet<DurableStore>();
function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
function eventKey(
  runId: string,
  blockId: string,
  attemptId: string,
  phase: string,
): string {
  return `event-${hash(JSON.stringify([runId, blockId, attemptId, phase]))}`;
}
function checkpointKey(runId: string, sequence: number): string {
  return `workflow-${hash(runId)}-${sequence}`;
}
function runOf(record: StoredEvent): string {
  return record.event.type === 'block.started'
    ? record.event.runId
    : record.event.result.runId;
}
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
function effectiveManifest(
  node: WorkflowNode,
  states: ReadonlyMap<string, AttemptProjection>,
): BlockManifest {
  const evidence = node.dependsOn.flatMap((id) => {
    const dependency = states.get(id);
    if (dependency?.status !== 'succeeded' || !dependency.result)
      throw new WorkflowError('invalid_history');
    return dependency.result.evidence;
  });
  return parseBlockManifest({
    ...node.manifest,
    inputs: [...node.manifest.inputs, ...evidence],
  });
}

/** Workflow-specific ordering checks; EventStore still owns correlation/sequence/projection integrity. */
function validateHistory(
  records: readonly StoredEvent[],
  workflow: Workflow,
  runId: string,
  plan: BlockManifest,
): void {
  const nodes = new Map(
    workflow.nodes.map((node) => [node.manifest.blockId, node]),
  );
  const states = new Map<string, AttemptProjection>();
  for (const record of records) {
    if (runOf(record) !== runId) continue;
    const event = record.event;
    if (event.type === 'block.started') {
      const id = event.manifest.blockId;
      if (id === PLAN_BLOCK) {
        if (
          states.size ||
          event.attemptId !== '1' ||
          !same(event.manifest, plan)
        )
          throw new WorkflowError('workflow_mismatch');
      } else {
        const node = nodes.get(id);
        const prior = states.get(id);
        if (
          !node ||
          states.get(PLAN_BLOCK)?.status !== 'succeeded' ||
          !same(event.manifest, effectiveManifest(node, states)) ||
          (prior && prior.status !== 'failed') ||
          event.attemptId !== String(prior ? Number(prior.attemptId) + 1 : 1)
        )
          throw new WorkflowError('invalid_history');
      }
      if (
        event.eventId !== eventKey(runId, id, event.attemptId, 'start') ||
        record.idempotencyKey !== event.eventId
      )
        throw new WorkflowError('invalid_history');
      states.set(id, {
        runId,
        blockId: id,
        attemptId: event.attemptId,
        manifest: event.manifest,
        status: 'pending',
        result: null,
        lastSequence: record.sequence,
      });
    } else {
      const result = event.result;
      const prior = states.get(result.blockId);
      if (
        !prior ||
        prior.status !== 'pending' ||
        prior.attemptId !== result.attemptId ||
        event.eventId !==
          eventKey(runId, result.blockId, result.attemptId, 'finish') ||
        record.idempotencyKey !== event.eventId ||
        (result.blockId === PLAN_BLOCK &&
          (result.status !== 'succeeded' ||
            !same(result.evidence, plan.inputs)))
      )
        throw new WorkflowError('invalid_history');
      states.set(result.blockId, {
        ...prior,
        status: result.status,
        result,
        lastSequence: record.sequence,
      });
    }
  }
}

async function finish(
  store: DurableStore,
  result: BlockResult,
): Promise<StoredEvent> {
  const eventId = eventKey(
    result.runId,
    result.blockId,
    result.attemptId,
    'finish',
  );
  return store.append(
    {
      schemaVersion: 1,
      eventId,
      occurredAt: Date.now(),
      type: 'block.finished',
      result,
    },
    eventId,
  );
}
async function start(
  store: DurableStore,
  runId: string,
  manifest: BlockManifest,
  attemptId: string,
): Promise<StoredEvent> {
  const eventId = eventKey(runId, manifest.blockId, attemptId, 'start');
  return store.append(
    {
      schemaVersion: 1,
      eventId,
      occurredAt: Date.now(),
      type: 'block.started',
      runId,
      attemptId,
      manifest,
    },
    eventId,
  );
}
function selection(
  values: readonly string[] | undefined,
  ids: ReadonlySet<string>,
): Set<string> {
  if (values !== undefined && !Array.isArray(values))
    throw new WorkflowError('invalid_options');
  const selected = new Set(Array.from(values ?? [], identifier));
  if (
    selected.size !== (values?.length ?? 0) ||
    [...selected].some((id) => !ids.has(id))
  )
    throw new WorkflowError('invalid_options');
  return selected;
}

export async function executeWorkflow(
  store: DurableStore,
  run: string,
  input: unknown,
  handlers: readonly BlockHandler[],
  options: RunOptions = {},
): Promise<RunReport> {
  if (busy.has(store)) throw new WorkflowError('run_busy');
  busy.add(store);
  let inFlight: Promise<unknown> | undefined;
  try {
    const runId = identifier(run);
    const workflow = parseWorkflow(input);
    const ordered = orderedNodes(workflow);
    const ids = new Set(ordered.map((node) => node.manifest.blockId));
    const external = selection(options.external, ids);
    const retries = selection(options.retryFailed, ids);
    const timeoutMs = options.timeoutMs ?? 30000;
    if (
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > 2147483647
    )
      throw new WorkflowError('invalid_options');
    const registry = new Map<string, BlockHandler>();
    for (const handler of handlers) {
      const descriptor = parseBlockManifest({
        schemaVersion: 1,
        blockId: 'registry',
        handler: handler.name,
        handlerVersion: handler.version,
        inputs: [],
        effects: handler.effects,
      });
      const key = JSON.stringify([
        descriptor.handler,
        descriptor.handlerVersion,
      ]);
      if (typeof handler.execute !== 'function' || registry.has(key))
        throw new WorkflowError('handler_mismatch');
      registry.set(key, { ...handler, execute: handler.execute.bind(handler) });
    }
    for (const node of ordered) {
      const descriptor = node.manifest;
      if (
        registry.get(
          JSON.stringify([descriptor.handler, descriptor.handlerVersion]),
        )?.effects !== descriptor.effects
      )
        throw new WorkflowError('handler_mismatch');
      if (
        descriptor.effects === 'external' &&
        !external.has(descriptor.blockId)
      )
        throw new WorkflowError('permission_denied');
    }
    let recoveredFrom = 0;
    let tailEvents = 0;
    let checkpointSequence = 0;
    const states = new Map<string, AttemptProjection>();
    const report = (
      status: RunReport['status'],
      stoppedBlock: string | null = null,
      reason: RunReport['reason'] = null,
      cancellationPersisted: boolean | null = null,
    ): RunReport => ({
      runId,
      status,
      completed: ordered
        .filter(
          (node) => states.get(node.manifest.blockId)?.status === 'succeeded',
        )
        .map((node) => node.manifest.blockId),
      stoppedBlock,
      reason,
      recoveredFrom,
      tailEvents,
      checkpointSequence,
      cancellationPersisted,
    });
    if (options.signal?.aborted) return report('cancelled', null, 'cancelled');
    const bytes = Buffer.from(JSON.stringify(workflow));
    const reference: ArtifactReference = {
      sha256: hash(bytes.toString('utf8')),
      byteLength: bytes.byteLength,
    };
    const plan = parseBlockManifest({
      schemaVersion: 1,
      blockId: PLAN_BLOCK,
      handler: PLAN_BLOCK,
      handlerVersion: 1,
      inputs: [reference],
      effects: 'none',
    });
    let records = await store.readEvents();
    const existing = records.filter((record) => runOf(record) === runId);
    validateHistory(records, workflow, runId, plan);
    if (!existing.length) {
      await store.putArtifact(bytes);
      await start(store, runId, plan, '1');
    }
    const planAttempt = await store.getAttempt({
      runId,
      blockId: PLAN_BLOCK,
      attemptId: '1',
    });
    if (!planAttempt || !same(planAttempt.manifest, plan))
      throw new WorkflowError('workflow_mismatch');
    if (planAttempt.status === 'pending') {
      // Metadata has no external execution; completing a confirmed plan start is safe and idempotent.
      await finish(store, {
        schemaVersion: 1,
        runId,
        blockId: PLAN_BLOCK,
        attemptId: '1',
        status: 'succeeded',
        evidence: [reference],
      });
      records = await store.readEvents();
    } else if (planAttempt.status !== 'succeeded')
      throw new WorkflowError('invalid_history');
    const finishes = records
      .filter(
        (record) =>
          runOf(record) === runId && record.event.type === 'block.finished',
      )
      .reverse();
    let latestCheckpoint = false;
    for (const record of finishes) {
      const checkpoint = await store.loadCheckpoint(
        checkpointKey(runId, record.sequence),
      );
      if (!checkpoint) continue;
      latestCheckpoint = record === finishes[0];
      recoveredFrom = checkpoint.sequence;
      checkpointSequence = checkpoint.sequence;
      for (const attempt of checkpoint.attempts) {
        if (
          attempt.runId === runId &&
          (states.get(attempt.blockId)?.lastSequence ?? 0) <
            attempt.lastSequence
        )
          states.set(attempt.blockId, attempt);
      }
      break;
    }
    const tail = records.filter((record) => record.sequence > recoveredFrom);
    tailEvents = tail.length;
    const identities = new Map<
      string,
      { runId: string; blockId: string; attemptId: string }
    >();
    for (const record of tail) {
      if (runOf(record) !== runId) continue;
      const event = record.event;
      const identity =
        event.type === 'block.started'
          ? {
              runId,
              blockId: event.manifest.blockId,
              attemptId: event.attemptId,
            }
          : event.result;
      identities.set(identity.blockId, identity);
    }
    for (const [id, identity] of identities) {
      const projection = await store.getAttempt(identity);
      if (!projection) throw new WorkflowError('invalid_history');
      states.set(id, projection);
    }
    if (!latestCheckpoint && finishes[0])
      checkpointSequence = (
        await store.createCheckpoint(checkpointKey(runId, finishes[0].sequence))
      ).sequence;
    for (const node of ordered) {
      const id = node.manifest.blockId;
      const previous = states.get(id);
      if (previous?.status === 'succeeded') continue;
      if (previous?.status === 'pending' || previous?.status === 'uncertain')
        return report('blocked', id, previous.status);
      if (previous?.status === 'cancelled')
        return report('cancelled', id, 'cancelled', true);
      if (previous?.status === 'failed' && !retries.has(id))
        return report('failed', id, 'failed');
      if (options.signal?.aborted)
        return report('cancelled', id, 'cancelled', false);
      const manifest = effectiveManifest(node, states);
      const inputs: Uint8Array[] = [];
      for (const ref of manifest.inputs)
        inputs.push(await store.readArtifact(ref));
      if (options.signal?.aborted)
        return report('cancelled', id, 'cancelled', false);
      const attemptId = String(previous ? Number(previous.attemptId) + 1 : 1);
      if (!Number.isSafeInteger(Number(attemptId)))
        throw new WorkflowError('invalid_history');
      await start(store, runId, manifest, attemptId);
      const base = {
        schemaVersion: 1,
        runId,
        blockId: id,
        attemptId,
        evidence: [],
      } as const;
      let result: BlockResult;
      let outputs: readonly Uint8Array[] = [];
      if (options.signal?.aborted) result = { ...base, status: 'cancelled' };
      else {
        const controller = new AbortController();
        let interrupt: (code: 'timeout' | 'interrupted') => void = () => {};
        const aborted = new Promise<{
          kind: 'abort';
          code: 'timeout' | 'interrupted';
        }>((resolve) => {
          interrupt = (code) => {
            controller.abort();
            resolve({ kind: 'abort', code });
          };
        });
        const cancel = () => interrupt('interrupted');
        options.signal?.addEventListener('abort', cancel, { once: true });
        const timer = setTimeout(() => interrupt('timeout'), timeoutMs);
        const handler = registry.get(
          JSON.stringify([manifest.handler, manifest.handlerVersion]),
        );
        if (!handler) throw new WorkflowError('handler_mismatch');
        const running = Promise.resolve()
          .then(() => handler.execute({ inputs, signal: controller.signal }))
          .then(
            (value) => ({ kind: 'returned' as const, value }),
            () => ({ kind: 'throw' as const }),
          );
        inFlight = running;
        const outcome = await Promise.race([running, aborted]);
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', cancel);
        if (outcome.kind !== 'returned') {
          result = {
            ...base,
            status: 'uncertain',
            error: {
              code:
                outcome.kind === 'abort' ? outcome.code : 'execution_failed',
              message: 'Handler outcome unconfirmed',
            },
          };
        } else {
          try {
            const value = outcome.value;
            if (
              !Array.isArray(value.outputs) ||
              value.outputs.length > 64 ||
              Array.from(value.outputs).some(
                (item) => !(item instanceof Uint8Array),
              )
            )
              throw new Error('invalid');
            result = parseBlockResult({
              ...base,
              status: value.status,
              ...('error' in value ? { error: value.error } : {}),
            });
            outputs = value.outputs;
          } catch {
            result = {
              ...base,
              status: 'uncertain',
              error: {
                code: 'execution_failed',
                message: 'Handler result invalid',
              },
            };
          }
        }
      }
      const evidence: ArtifactReference[] = [];
      for (const output of outputs)
        evidence.push(await store.putArtifact(output));
      result = parseBlockResult({ ...result, evidence });
      const confirmed = await finish(store, result);
      states.set(id, {
        runId,
        blockId: id,
        attemptId,
        manifest,
        status: result.status,
        result,
        lastSequence: confirmed.sequence,
      });
      checkpointSequence = (
        await store.createCheckpoint(checkpointKey(runId, confirmed.sequence))
      ).sequence;
      if (result.status !== 'succeeded')
        return report(
          result.status === 'uncertain' ? 'blocked' : result.status,
          id,
          result.status,
          result.status === 'cancelled' ? true : null,
        );
    }
    return report('succeeded');
  } finally {
    if (inFlight) void inFlight.then(() => busy.delete(store));
    else busy.delete(store);
  }
}
