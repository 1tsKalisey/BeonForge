import { describe, expect, it } from 'vitest';
import {
  TASK_STATES,
  TASK_TRANSITIONS,
  InvalidTaskTransitionError,
  canTransition,
  isTaskState,
  transitionTask,
} from '@beonforge/contracts';

describe('task lifecycle contract', () => {
  it('publishes a complete state-transition table', () => {
    expect(Object.keys(TASK_TRANSITIONS).sort()).toEqual([...TASK_STATES].sort());
  });

  it('accepts only declared transitions', () => {
    for (const from of TASK_STATES) {
      for (const to of TASK_STATES) {
        const expected = (TASK_TRANSITIONS[from] as readonly string[]).includes(to);
        expect(canTransition(from, to)).toBe(expected);

        if (expected) {
          expect(transitionTask(from, to)).toBe(to);
        } else {
          expect(() => transitionTask(from, to)).toThrow(InvalidTaskTransitionError);
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

  it('validates external state values', () => {
    expect(isTaskState('running')).toBe(true);
    expect(isTaskState('unknown')).toBe(false);
    expect(isTaskState(null)).toBe(false);
    expect(isTaskState({ state: 'queued' })).toBe(false);
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
