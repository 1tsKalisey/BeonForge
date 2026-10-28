/** Version of the wire format shared by BeonForge contracts. */
export const CONTRACT_SCHEMA_VERSION = 1 as const;

export {
  TASK_STATES,
  TASK_TRANSITIONS,
  InvalidTaskTransitionError,
  isTaskState,
  canTransition,
  transitionTask,
} from './task-state.js';
export type { TaskState } from './task-state.js';
