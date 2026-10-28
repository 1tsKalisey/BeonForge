import type { ArtifactReference } from '@beonforge/contracts';
import type { AttemptProjection, EventStore } from './event-store.js';

export interface ArtifactStore {
  putArtifact(bytes: Uint8Array): Promise<ArtifactReference>;
  readArtifact(reference: ArtifactReference): Promise<Uint8Array>;
}

/** Workflow snapshot of confirmed log state, not a SQLite WAL checkpoint. */
export interface WorkflowCheckpoint {
  readonly schemaVersion: 1;
  readonly checkpointId: string;
  readonly sequence: number;
  readonly attempts: readonly AttemptProjection[];
}

export interface RecoveryLocation {
  readonly directory: string;
  readonly databasePath: string;
  readonly artifactRoot: string;
}

export interface DurableStore extends EventStore, ArtifactStore {
  createCheckpoint(checkpointId: string): Promise<WorkflowCheckpoint>;
  loadCheckpoint(checkpointId: string): Promise<WorkflowCheckpoint | null>;
  createBackup(destinationParent: string): Promise<RecoveryLocation>;
}
