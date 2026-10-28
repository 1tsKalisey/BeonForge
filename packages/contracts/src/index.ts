export { CONTRACT_SCHEMA_VERSION } from './schema-version.js';

export {
  TASK_STATES,
  TASK_TRANSITIONS,
  InvalidTaskTransitionError,
  isTaskState,
  canTransition,
  transitionTask,
} from './task-state.js';
export type { TaskState } from './task-state.js';

export {
  ContractValidationError,
  parseArtifactReference,
  parseBlockManifest,
  parseBlockResult,
  parseBlockExecutionEvent,
} from './execution.js';
export type {
  ArtifactReference,
  BlockManifest,
  BlockResult,
  BlockExecutionError,
  BlockExecutionEvent,
} from './execution.js';
