/**
 * Provider-neutral task lifecycle. These states describe orchestration, not
 * whether an external command or model has actually completed its effects.
 * A task may span multiple execution attempts: failed -> queued requests a new
 * attempt, not a replay of effects from the previous one. Succeeded/cancelled
 * are closed orchestration outcomes; cancellation does not undo external work.
 */
export const TASK_STATES = Object.freeze([
  'queued',
  'running',
  'awaiting_approval',
  'succeeded',
  'failed',
  'cancelled',
  'uncertain',
] as const);

export type TaskState = (typeof TASK_STATES)[number];

/**
 * Adjacency only, not authorization. The application must reconcile uncertain
 * effects before resolving uncertainty (including uncertain -> failed), and
 * check evidence/required human approval before completing awaiting_approval.
 * Running -> succeeded is for work that requires no approval; task success
 * never authorizes a merge. Awaiting approval cannot restart execution.
 */
export const TASK_TRANSITIONS = Object.freeze({
  queued: Object.freeze(['running', 'cancelled'] as const),
  running: Object.freeze([
    'awaiting_approval',
    'succeeded',
    'failed',
    'cancelled',
    'uncertain',
  ] as const),
  awaiting_approval: Object.freeze([
    'succeeded',
    'failed',
    'cancelled',
  ] as const),
  succeeded: Object.freeze([] as const),
  failed: Object.freeze(['queued'] as const),
  cancelled: Object.freeze([] as const),
  uncertain: Object.freeze([
    'awaiting_approval',
    'failed',
    'cancelled',
  ] as const),
} as const satisfies Record<TaskState, readonly TaskState[]>);

export class InvalidTaskTransitionError extends Error {
  constructor(
    public readonly from: TaskState,
    public readonly to: TaskState,
  ) {
    super(`Invalid task transition: ${from} -> ${to}`);
    this.name = 'InvalidTaskTransitionError';
  }
}

export function isTaskState(value: unknown): value is TaskState {
  return (
    typeof value === 'string' &&
    (TASK_STATES as readonly string[]).includes(value)
  );
}

export function canTransition(from: TaskState, to: TaskState): boolean {
  return (TASK_TRANSITIONS[from] as readonly TaskState[]).includes(to);
}

/**
 * Pure validation: the storage layer remains responsible for transactionality,
 * concurrency checks, event emission and effect idempotency.
 * Callers must validate untrusted states with isTaskState and enforce the
 * reconciliation/approval preconditions separately. This function has no effects.
 */
export function transitionTask(from: TaskState, to: TaskState): TaskState {
  if (!canTransition(from, to)) {
    throw new InvalidTaskTransitionError(from, to);
  }
  return to;
}
