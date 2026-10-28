import { parseBlockManifest, type BlockManifest } from '@beonforge/contracts';

export class WorkflowError extends Error {
  constructor(
    public readonly code:
      | 'invalid_workflow'
      | 'workflow_mismatch'
      | 'invalid_history'
      | 'handler_mismatch'
      | 'permission_denied'
      | 'invalid_options'
      | 'database_not_found'
      | 'run_busy',
  ) {
    super(code);
    this.name = 'WorkflowError';
  }
}
export interface WorkflowNode {
  readonly manifest: BlockManifest;
  readonly dependsOn: readonly string[];
}
export interface Workflow {
  readonly schemaVersion: 1;
  readonly nodes: readonly WorkflowNode[];
}
export const PLAN_BLOCK = 'kernel.plan';

export function identifier(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  )
    throw new WorkflowError('invalid_options');
  return value;
}
function object(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    throw new WorkflowError('invalid_workflow');
  return value as Record<string, unknown>;
}

export function parseWorkflow(value: unknown): Workflow {
  try {
    const root = object(value, ['schemaVersion', 'nodes']);
    if (
      root.schemaVersion !== 1 ||
      !Array.isArray(root.nodes) ||
      root.nodes.length < 1 ||
      root.nodes.length > 64
    )
      throw new WorkflowError('invalid_workflow');
    const nodes = Array.from(root.nodes as unknown[], (item): WorkflowNode => {
      const node = object(item, ['manifest', 'dependsOn']);
      const manifest = parseBlockManifest(node.manifest);
      if (
        manifest.blockId === PLAN_BLOCK ||
        !Array.isArray(node.dependsOn) ||
        node.dependsOn.length > 63
      )
        throw new WorkflowError('invalid_workflow');
      const dependsOn = Array.from(
        node.dependsOn as unknown[],
        identifier,
      ).sort();
      if (new Set(dependsOn).size !== dependsOn.length)
        throw new WorkflowError('invalid_workflow');
      return { manifest, dependsOn };
    }).sort((a, b) =>
      a.manifest.blockId < b.manifest.blockId
        ? -1
        : a.manifest.blockId > b.manifest.blockId
          ? 1
          : 0,
    );
    if (
      new Set(nodes.map((node) => node.manifest.blockId)).size !== nodes.length
    )
      throw new WorkflowError('invalid_workflow');
    const workflow: Workflow = { schemaVersion: 1, nodes };
    orderedNodes(workflow);
    return workflow;
  } catch {
    throw new WorkflowError('invalid_workflow');
  }
}

export function orderedNodes(workflow: Workflow): readonly WorkflowNode[] {
  const pending = [...workflow.nodes];
  const known = new Set(pending.map((node) => node.manifest.blockId));
  if (pending.some((node) => node.dependsOn.some((id) => !known.has(id))))
    throw new WorkflowError('invalid_workflow');
  const ordered: WorkflowNode[] = [];
  const done = new Set<string>();
  while (pending.length) {
    const index = pending.findIndex((node) =>
      node.dependsOn.every((id) => done.has(id)),
    );
    if (index < 0) throw new WorkflowError('invalid_workflow');
    const node = pending.splice(index, 1)[0];
    if (!node) throw new WorkflowError('invalid_workflow');
    ordered.push(node);
    done.add(node.manifest.blockId);
  }
  return ordered;
}
