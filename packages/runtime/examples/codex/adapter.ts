// B04-01c.2: simulated-only adapter for Codex JSONL events.
// No real Codex CLI dispatch, no subprocess, no network, no credentials.
// The 'simulated' profile cannot be changed to 'real' via any parameter.
import { createHash, randomUUID } from 'node:crypto';
import { types } from 'node:util';
import type { ArtifactReference } from '@beonforge/contracts';
import type { DurableStore } from '@beonforge/persistence';
import {
  executeWorkflow,
  type BlockHandler,
  type HandlerReport,
} from '@beonforge/runtime';
import { AFTER } from '../bugfix/fixture.ts';
import { parseCodexJsonl, type CodexEvent } from './jsonl-parser.ts';

export class AdapterError extends Error {
  readonly code:
    | 'adapter_invalid'
    | 'adapter_denied'
    | 'adapter_busy'
    | 'adapter_real_dispatch_rejected';
  constructor(code: AdapterError['code']) {
    super(code);
    this.code = code;
    this.name = 'AdapterError';
  }
}

// Field names that indicate an attempt to configure a real dispatch. Rejected explicitly.
const REAL_DISPATCH_FIELDS = new Set([
  'binary',
  'codexBinary',
  'codexHome',
  'credentials',
  'apiKey',
  'token',
  'providerConfig',
  'provider',
  'networkTarget',
  'endpoint',
]);

// Only these simulation modes exist; no real Codex parameters.
const SIMULATION_MODES = [
  'success',
  'truncated',
  'malformed_json',
  'unknown_event',
  'force_uncertain',
] as const;
type SimulationMode = (typeof SIMULATION_MODES)[number];

// The narrow request type accepted by the simulated adapter.
// Any real-dispatch field (binary, codexHome, credentials, provider, network) causes rejection.
export interface SimulatedCodexRequest {
  readonly schemaVersion: 1;
  readonly baseCommit: string;
  readonly preimageSha256: string;
  readonly path: 'src/add.ts';
  readonly mode?: SimulationMode;
}

const hash = (b: Uint8Array | string): string =>
  createHash('sha256').update(b).digest('hex');

function own(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object' || types.isProxy(value))
    return undefined;
  const d = Object.getOwnPropertyDescriptor(value, key);
  return d && Object.hasOwn(d, 'value') ? d.value : undefined;
}

// Module-private maps keep the payload and revocation state off the public object.
const grantPayloads = new WeakMap<CodexAdapterGrant, Buffer>();
const grantStates = new WeakMap<CodexAdapterGrant, { revoked: boolean }>();

export class CodexAdapterGrant {
  readonly runId: string;
  readonly payloadSha256: string;
  readonly profileKind = 'simulated' as const;
  readonly mode: SimulationMode;

  constructor(runId: string, payload: Buffer, mode: SimulationMode) {
    this.runId = runId;
    this.payloadSha256 = hash(payload);
    this.mode = mode;
    grantPayloads.set(this, Buffer.from(payload));
    grantStates.set(this, { revoked: false });
  }

  get isRevoked(): boolean {
    return grantStates.get(this)?.revoked ?? true;
  }

  revoke(): void {
    const s = grantStates.get(this);
    if (s) s.revoked = true;
  }
}

// Validates request using own-field reads only; rejects getters, Proxy, unknown keys.
export function prepareSimulatedCodexRun(request: unknown): CodexAdapterGrant {
  if (!request || typeof request !== 'object' || types.isProxy(request))
    throw new AdapterError('adapter_invalid');

  for (
    let proto: unknown = Object.getPrototypeOf(request);
    proto !== null;
    proto = Object.getPrototypeOf(proto)
  )
    if (types.isProxy(proto)) throw new AdapterError('adapter_invalid');

  const descriptors = Object.getOwnPropertyDescriptors(request);

  // No accessor descriptors allowed (no getters/setters).
  for (const d of Object.values(descriptors))
    if (!Object.hasOwn(d, 'value')) throw new AdapterError('adapter_invalid');

  // Explicit rejection for real-dispatch field names.
  for (const key of Object.keys(descriptors))
    if (REAL_DISPATCH_FIELDS.has(key))
      throw new AdapterError('adapter_real_dispatch_rejected');

  // Whitelist: only these five fields accepted.
  const ALLOWED = new Set([
    'schemaVersion',
    'baseCommit',
    'preimageSha256',
    'path',
    'mode',
  ]);
  for (const key of Object.keys(descriptors))
    if (!ALLOWED.has(key)) throw new AdapterError('adapter_invalid');

  const schemaVersion = own(request, 'schemaVersion');
  const baseCommit = own(request, 'baseCommit');
  const preimageSha256 = own(request, 'preimageSha256');
  const path = own(request, 'path');
  const rawMode = own(request, 'mode');

  if (schemaVersion !== 1) throw new AdapterError('adapter_invalid');
  if (
    typeof baseCommit !== 'string' ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(baseCommit)
  )
    throw new AdapterError('adapter_invalid');
  if (
    typeof preimageSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(preimageSha256)
  )
    throw new AdapterError('adapter_invalid');
  if (path !== 'src/add.ts') throw new AdapterError('adapter_invalid');

  const mode: SimulationMode =
    rawMode === undefined
      ? 'success'
      : (SIMULATION_MODES as readonly unknown[]).includes(rawMode)
        ? (rawMode as SimulationMode)
        : (() => {
            throw new AdapterError('adapter_invalid');
          })();

  const payload = Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      baseCommit,
      preimageSha256,
      path,
      mode,
    }),
  );
  return new CodexAdapterGrant(randomUUID(), payload, mode);
}

// Generates in-process synthetic JSONL bytes. No subprocess, no network, no binary.
function generateEvents(
  baseCommit: string,
  preimageSha256: string,
  mode: SimulationMode,
): Buffer {
  const s = JSON.stringify({ schemaVersion: 1, type: 'started' });
  const m = JSON.stringify({
    schemaVersion: 1,
    type: 'message',
    role: 'assistant',
    content: 'Fixing the addition function.',
  });
  const p = JSON.stringify({
    schemaVersion: 1,
    type: 'proposal',
    baseCommit,
    path: 'src/add.ts',
    preimageSha256,
    content: AFTER,
  });
  const d = JSON.stringify({ schemaVersion: 1, type: 'done', exitCode: 0 });

  switch (mode) {
    case 'success':
    case 'force_uncertain':
      return Buffer.from(`${s}\n${m}\n${p}\n${d}\n`);
    case 'truncated':
      // No trailing newline: truncated mid-stream output.
      return Buffer.from(`${s}\n${m.slice(0, 12)}`);
    case 'malformed_json':
      return Buffer.from(`${s}\nnot-valid-json\n${d}\n`);
    case 'unknown_event':
      return Buffer.from(
        `${s}\n${JSON.stringify({ schemaVersion: 1, type: 'tool_call', name: 'shell' })}\n${d}\n`,
      );
  }
}

let active = false;

export interface CodexRunResult {
  readonly runId: string;
  readonly status: 'succeeded' | 'failed' | 'cancelled' | 'blocked';
  readonly reason: 'pending' | 'uncertain' | 'failed' | 'cancelled' | null;
  readonly proposalRef: ArtifactReference | null;
}

export async function executeSimulatedCodexRun(
  grant: CodexAdapterGrant,
  store: DurableStore,
  signal?: AbortSignal,
): Promise<CodexRunResult> {
  if (!(grant instanceof CodexAdapterGrant))
    throw new AdapterError('adapter_invalid');
  if (grant.isRevoked) throw new AdapterError('adapter_denied');
  if (active) throw new AdapterError('adapter_busy');
  active = true;
  try {
    if (grant.isRevoked) throw new AdapterError('adapter_denied');

    const payload = grantPayloads.get(grant);
    if (!payload) throw new AdapterError('adapter_invalid');

    // Durably record request before execution starts.
    const requestRef = await store.putArtifact(payload);

    let proposalRef: ArtifactReference | null = null;
    const capturedMode = grant.mode;

    const handler: BlockHandler = {
      name: 'codex.simulated',
      version: 1,
      effects: 'external',
      async execute({ signal: kernelSignal }): Promise<HandlerReport> {
        const combined = signal
          ? AbortSignal.any([kernelSignal, signal])
          : kernelSignal;

        if (combined.aborted || grant.isRevoked)
          return { status: 'cancelled', outputs: [] };

        // force_uncertain returns uncertain before any JSONL is generated.
        if (capturedMode === 'force_uncertain')
          return {
            status: 'uncertain',
            outputs: [],
            error: {
              code: 'execution_failed',
              message: 'forced_uncertain_for_testing',
            },
          };

        const reqBytes = Buffer.from(await store.readArtifact(requestRef));
        let reqParsed: unknown;
        try {
          reqParsed = JSON.parse(
            new TextDecoder('utf-8', { fatal: true }).decode(reqBytes),
          );
        } catch {
          return {
            status: 'uncertain',
            outputs: [],
            error: { code: 'execution_failed', message: 'request_unreadable' },
          };
        }

        const baseCommit = own(reqParsed, 'baseCommit');
        const preimageSha256 = own(reqParsed, 'preimageSha256');
        if (
          typeof baseCommit !== 'string' ||
          typeof preimageSha256 !== 'string'
        )
          return {
            status: 'uncertain',
            outputs: [],
            error: {
              code: 'execution_failed',
              message: 'request_fields_invalid',
            },
          };

        if (combined.aborted || grant.isRevoked)
          return { status: 'cancelled', outputs: [] };

        // In-process simulation only — no subprocess, no network, no binary.
        const jsonlBytes = generateEvents(
          baseCommit,
          preimageSha256,
          capturedMode,
        );

        let events: CodexEvent[];
        try {
          events = parseCodexJsonl(jsonlBytes);
        } catch {
          return {
            status: 'failed',
            outputs: [],
            error: { code: 'execution_failed', message: 'jsonl_parse_failed' },
          };
        }

        const proposal = events.find((e) => e.type === 'proposal');
        if (!proposal || proposal.type !== 'proposal')
          return {
            status: 'failed',
            outputs: [],
            error: { code: 'execution_failed', message: 'no_proposal' },
          };

        // Store only a sanitized summary — no raw model output, no reasoning.
        const sanitized = Buffer.from(
          JSON.stringify({
            schemaVersion: 1,
            baseCommit: proposal.baseCommit,
            path: proposal.path,
            preimageSha256: proposal.preimageSha256,
            contentSha256: hash(proposal.content),
          }),
        );
        proposalRef = await store.putArtifact(sanitized);

        const summary = Buffer.from(
          JSON.stringify({
            schemaVersion: 1,
            kind: 'codex-simulated',
            requestSha256: grant.payloadSha256,
            eventCount: events.length,
            proposalRef,
          }),
        );
        return { status: 'succeeded', outputs: [summary] };
      },
    };

    const report = await executeWorkflow(
      store,
      grant.runId,
      {
        schemaVersion: 1,
        nodes: [
          {
            dependsOn: [],
            manifest: {
              schemaVersion: 1,
              blockId: 'codex-run',
              handler: 'codex.simulated',
              handlerVersion: 1,
              effects: 'external',
              inputs: [requestRef],
            },
          },
        ],
      },
      [handler],
      {
        ...(signal !== undefined && { signal }),
        external: ['codex-run'],
        timeoutMs: 30000,
      },
    );

    return {
      runId: grant.runId,
      status: report.status,
      reason: report.reason,
      proposalRef,
    };
  } finally {
    active = false;
  }
}

export interface CodexRunInspection {
  readonly runId: string;
  readonly status: string;
  readonly proposalRef: ArtifactReference | null;
}

// Reads persisted evidence without authorising re-dispatch.
// Historical bytes are data, never execution authority.
export async function inspectSimulatedCodexRun(
  store: DurableStore,
  runId: string,
): Promise<CodexRunInspection | null> {
  if (typeof runId !== 'string' || !runId) return null;

  const attempt = await store.getAttempt({
    runId,
    blockId: 'codex-run',
    attemptId: '1',
  });
  if (!attempt) return null;

  let proposalRef: ArtifactReference | null = null;
  if (attempt.result?.status === 'succeeded') {
    for (const ref of attempt.result.evidence ?? []) {
      try {
        const bytes = await store.readArtifact(ref);
        const parsed = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(bytes),
        ) as unknown;
        const pRef = own(parsed, 'proposalRef');
        if (
          pRef &&
          typeof pRef === 'object' &&
          !types.isProxy(pRef) &&
          typeof own(pRef, 'sha256') === 'string' &&
          typeof own(pRef, 'byteLength') === 'number'
        ) {
          proposalRef = pRef as ArtifactReference;
          break;
        }
      } catch {
        /* Fail closed: no proposal ref if evidence is unreadable. */
      }
    }
  }

  return { runId, status: attempt.status, proposalRef };
}
