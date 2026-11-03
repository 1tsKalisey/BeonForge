// Pure presentation rules. Evidence panels appear only when the server returned
// persisted evidence for THIS task; nothing is inferred or synthesized here.
import type { Task, TaskState } from './api';

export const STATE_LABEL: Readonly<Record<TaskState, string>> = {
  prepared: 'Preparada',
  running: 'En ejecución',
  succeeded: 'Completada',
  failed: 'Fallida',
  cancelled: 'Cancelada',
  blocked: 'Bloqueada (requiere decisión)',
  invalid: 'Inválida',
};

export interface Panels {
  readonly tests: boolean;
  readonly diff: boolean;
  readonly proposal: boolean;
}
export function panels(task: Task): Panels {
  return {
    tests: task.tests.length > 0,
    diff: task.diff !== null && task.diff.text.length > 0,
    proposal: task.proposal !== null,
  };
}

export const canRun = (task: Task): boolean =>
  task.state === 'prepared' && task.preview !== null;

export const canReview = (task: Task): boolean =>
  task.executor === 'synthetic-bugfix' &&
  task.state === 'succeeded' &&
  task.review.status === 'pending' &&
  task.diff !== null;

/** The user's click confirms exactly the fixed patch shown in the preview. */
export function runBody(task: Task): object {
  if (!canRun(task) || !task.preview) throw new Error('task_not_runnable');
  return task.executor === 'synthetic-bugfix'
    ? { schemaVersion: 1, confirmPatchSha256: task.preview.patchSha256 }
    : { schemaVersion: 1 };
}

export function reviewBody(
  task: Task,
  decision: 'approve' | 'discard',
): object {
  if (!canReview(task) || !task.diff) throw new Error('task_not_reviewable');
  return {
    schemaVersion: 1,
    decision,
    evidenceSha256: task.diff.evidenceSha256,
  };
}

export function reviewLabel(task: Task): string {
  const review = task.review;
  switch (review.status) {
    case 'not_available':
      return 'No disponible para esta tarea';
    case 'pending':
      return 'Pendiente de decisión explícita';
    default: {
      const decision =
        review.decision === 'approve' ? 'Aprobada' : 'Descartada';
      return review.status === 'confirmed'
        ? `${decision} (confirmada)`
        : `${decision} (sin confirmar: bloqueada)`;
    }
  }
}

export const shortHash = (hash: string): string => hash.slice(0, 12);

export const isActive = (
  tasks: readonly Task[],
  busy: string | null,
): boolean => busy !== null || tasks.some((t) => t.state === 'running');
