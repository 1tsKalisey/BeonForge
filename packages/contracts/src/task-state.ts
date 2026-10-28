/**
 * Provider-neutral task lifecycle. These states describe orchestration, not
 * whether an external command or model has actually completed its effects.
 */
export const TASK_STATES = [
  'queued',
  'running',
  'awaiting_approval',
  'succeeded',
  'failed',
  'cancelled',
  'uncertain',
] as const;

export type TaskState = (typeof TASK_STATES)[number];

export const TASK_TRANSITIONS = {
  queued: ['running', 'cancelled'],
  running: ['awaiting_approval', 'succeeded', 'failed', 'cancelled', 'uncertain'],
  awaiting_approval: ['succeeded', 'failed', 'cancelled'],
  succeeded: [],
  failed: ['queued'],
  cancelled: [],
  uncertain: ['awaiting_approval', 'failed', 'cancelled'],
} as const satisfies Record<TaskState, readonly TaskState[]>;

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
    typeof value === 'string' && (TASK_STATES as readonly string[]).includes(value)
  );
}

export function canTransition(from: TaskState, to: TaskState): boolean {
  return (TASK_TRANSITIONS[from] as readonly TaskState[]).includes(to);
}

/**
 * Pure validation: the storage layer remains responsible for transactionality,
 * concurrency checks, event emission and effect idempotency.
 */
export function transitionTask(from: TaskState, to: TaskState): TaskState {
  if (!canTransition(from, to)) {
    throw new InvalidTaskTransitionError(from, to);
  }
  return to;
}
