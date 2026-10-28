import { describe, expect, it } from 'vitest';
import {
  TASK_STATES,
  TASK_TRANSITIONS,
  InvalidTaskTransitionError,
  canTransition,
  isTaskState,
  transitionTask,
  type TaskState,
} from '@beonforge/contracts';

// Independent specification: never derive expected edges from TASK_TRANSITIONS.
const expectedTransitions = {
  queued: ['running', 'cancelled'],
  running: [
    'awaiting_approval',
    'succeeded',
    'failed',
    'cancelled',
    'uncertain',
  ],
  awaiting_approval: ['succeeded', 'failed', 'cancelled'],
  succeeded: [],
  failed: ['queued'],
  cancelled: [],
  uncertain: ['awaiting_approval', 'failed', 'cancelled'],
} satisfies Record<TaskState, readonly TaskState[]>;
const expectedStates = Object.keys(expectedTransitions) as TaskState[];

describe('task lifecycle contract', () => {
  it('publishes a complete state-transition table', () => {
    expect([...TASK_STATES].sort()).toEqual([...expectedStates].sort());
    expect(TASK_TRANSITIONS).toEqual(expectedTransitions);
  });

  it('accepts only declared transitions', () => {
    for (const from of expectedStates) {
      for (const to of expectedStates) {
        const expected = (
          expectedTransitions[from] as readonly TaskState[]
        ).includes(to);
        expect(canTransition(from, to)).toBe(expected);

        if (expected) {
          expect(transitionTask(from, to)).toBe(to);
        } else {
          expect(() => transitionTask(from, to)).toThrow(
            InvalidTaskTransitionError,
          );
        }
      }
    }
  });

  it('does not silently retry uncertain effects', () => {
    expect(canTransition('uncertain', 'queued')).toBe(false);
    expect(canTransition('uncertain', 'running')).toBe(false);
    expect(canTransition('uncertain', 'awaiting_approval')).toBe(true);
  });

  it('keeps terminal states closed', () => {
    expect(TASK_TRANSITIONS.succeeded).toEqual([]);
    expect(TASK_TRANSITIONS.cancelled).toEqual([]);
  });

  it('only requeues failed tasks for a new attempt', () => {
    for (const state of expectedStates) {
      expect(canTransition(state, 'queued')).toBe(state === 'failed');
    }
    expect(canTransition('failed', 'running')).toBe(false);
  });

  it('can resolve or reject approval but cannot restart execution', () => {
    expect(transitionTask('running', 'awaiting_approval')).toBe(
      'awaiting_approval',
    );
    expect(transitionTask('awaiting_approval', 'succeeded')).toBe('succeeded');
    expect(transitionTask('awaiting_approval', 'failed')).toBe('failed');
    expect(transitionTask('awaiting_approval', 'cancelled')).toBe('cancelled');
    expect(canTransition('awaiting_approval', 'queued')).toBe(false);
    expect(canTransition('awaiting_approval', 'running')).toBe(false);
    expect(canTransition('uncertain', 'succeeded')).toBe(false);
  });

  it('validates external state values', () => {
    for (const state of expectedStates) expect(isTaskState(state)).toBe(true);
    for (const value of [
      'unknown',
      'Running',
      '',
      null,
      undefined,
      1,
      true,
      {},
      [],
      { state: 'queued' },
    ]) {
      expect(isTaskState(value)).toBe(false);
    }
  });

  it('reports typed errors with source and destination', () => {
    try {
      transitionTask('succeeded', 'running');
      throw new Error('Expected transition to fail');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(InvalidTaskTransitionError);
      if (error instanceof InvalidTaskTransitionError) {
        expect(error.from).toBe('succeeded');
        expect(error.to).toBe('running');
      }
    }
  });
});
