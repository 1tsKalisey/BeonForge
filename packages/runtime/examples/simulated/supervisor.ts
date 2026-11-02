// B04-01b: fixed trusted fixture only; not an arbitrary command/agent runner.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { types } from 'node:util';
import process from 'node:process';
import {
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
} from 'node:timers';
import type { DurableStore } from '@beonforge/persistence';
import { executeWorkflow, type HandlerReport } from '@beonforge/runtime';
import { AFTER } from '../bugfix/fixture.ts';

const script = fileURLToPath(
  new URL('../../test/fixtures/fake-agent.mjs', import.meta.url),
);
const SCRIPT_SHA =
  '5056f0381726edb4bbcd0c2ef44ef01072490d96785a1512607ac99d9ad0b93e';
const lifeline = fileURLToPath(
  new URL('../../test/fixtures/simulated-lifeline.mjs', import.meta.url),
);
const LIFELINE_SHA =
  '954f5e8b31b33087df1586abadd367d639d499904958e0486fe2b74b0abcefbd';
const modes = [
  'success',
  'fragmented',
  'invalid-json',
  'fail',
  'wait',
] as const;
type Mode = (typeof modes)[number];
type Reason =
  | 'ok'
  | 'denied'
  | 'cancelled'
  | 'timeout'
  | 'output_limit'
  | 'invalid_output'
  | 'process_failed'
  | 'unconfirmed';
export class SimulationError extends Error {
  readonly code:
    | 'simulation_invalid'
    | 'simulation_denied'
    | 'simulation_busy'
    | 'simulation_changed';
  constructor(code: SimulationError['code']) {
    super(code);
    this.code = code;
    this.name = 'SimulationError';
  }
}
export interface SimulatedRequest {
  mode: Mode;
  payload: Uint8Array;
  timeoutMs?: number;
  maxOutputBytes?: number;
}
export interface SimulatedGrant {
  canRead: boolean;
  canRun?: boolean;
  runId: string;
  requestSha256?: string;
}
function own(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object' || types.isProxy(value))
    return undefined;
  const d = Object.getOwnPropertyDescriptor(value, key);
  return d && 'value' in d ? d.value : undefined;
}
const hash = (b: Uint8Array | string) =>
  createHash('sha256').update(b).digest('hex');
function prepare(request: SimulatedRequest) {
  if (
    !request ||
    types.isProxy(request) ||
    !(request.payload instanceof Uint8Array) ||
    !modes.includes(request.mode)
  )
    throw new SimulationError('simulation_invalid');
  const payload = Buffer.from(request.payload);
  if (
    payload.length > 65536 ||
    payload.length === 0 ||
    payload.subarray(0, 3).equals(Buffer.from([239, 187, 191]))
  )
    throw new SimulationError('simulation_invalid');
  let input: unknown;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(payload);
    input = JSON.parse(text) as unknown;
    // Fixed canonical object plus optional ASCII padding: rejects duplicates/BOM.
    if (
      JSON.stringify(input) !== text.trim() ||
      !/^[\x20\x09\x0a\x0d]*$/.test(text.slice(text.trimEnd().length))
    )
      throw new Error();
  } catch {
    throw new SimulationError('simulation_invalid');
  }
  const baseCommit = own(input, 'baseCommit');
  const preimageSha256 = own(input, 'preimageSha256');
  if (
    own(input, 'schemaVersion') !== 1 ||
    typeof baseCommit !== 'string' ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(baseCommit) ||
    typeof preimageSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(preimageSha256) ||
    Object.keys(input as object)
      .sort()
      .join(',') !== 'baseCommit,preimageSha256,schemaVersion'
  )
    throw new SimulationError('simulation_invalid');
  const timeoutMs = request.timeoutMs ?? 5000;
  const maxOutputBytes = request.maxOutputBytes ?? 65536;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 50 ||
    timeoutMs > 5000 ||
    !Number.isSafeInteger(maxOutputBytes) ||
    maxOutputBytes < 1 ||
    maxOutputBytes > 65536
  )
    throw new SimulationError('simulation_invalid');
  const expected = Buffer.from(
    JSON.stringify({ schemaVersion: 1, type: 'started' }) +
      '\n' +
      JSON.stringify({
        schemaVersion: 1,
        type: 'proposal',
        baseCommit,
        path: 'src/add.ts',
        preimageSha256,
        content: AFTER,
        label: 'corrección sintética',
      }) +
      '\n',
  );
  const requestSha256 = hash(
    JSON.stringify([
      request.mode,
      hash(payload),
      timeoutMs,
      maxOutputBytes,
      SCRIPT_SHA,
      LIFELINE_SHA,
    ]),
  );
  return {
    mode: request.mode,
    payload,
    timeoutMs,
    maxOutputBytes,
    expected,
    requestSha256,
  };
}
export function previewSimulatedRequest(request: SimulatedRequest): string {
  return prepare(request).requestSha256;
}
function allowed(grant: unknown, runId: string, sha?: string): boolean {
  return (
    own(grant, 'canRead') === true &&
    own(grant, 'runId') === runId &&
    (sha === undefined ||
      (own(grant, 'canRun') === true && own(grant, 'requestSha256') === sha))
  );
}
async function verifyFixture() {
  const helper = await lstat(lifeline);
  if (
    !helper.isFile() ||
    helper.isSymbolicLink() ||
    helper.nlink !== 1 ||
    (await realpath(lifeline)) !== lifeline ||
    hash(await readFile(lifeline)) !== LIFELINE_SHA
  )
    throw new SimulationError('simulation_changed');
  for (let p = script; ; p = dirname(p)) {
    const s = await lstat(p);
    if (s.isSymbolicLink() || (await realpath(p)) !== p)
      throw new SimulationError('simulation_changed');
    if (dirname(p) === p) break;
  }
  const s = await lstat(script);
  if (
    !s.isFile() ||
    s.nlink !== 1 ||
    hash(await readFile(script)) !== SCRIPT_SHA
  )
    throw new SimulationError('simulation_changed');
}
let active = false;
export async function runSimulatedProcess(
  store: DurableStore,
  runId: string,
  request: SimulatedRequest,
  grant: SimulatedGrant,
  signal?: AbortSignal,
) {
  const spec = prepare(request);
  if (!allowed(grant, runId, spec.requestSha256))
    throw new SimulationError('simulation_denied');
  if (active) throw new SimulationError('simulation_busy');
  active = true;
  let running: Promise<HandlerReport> | undefined;
  let unresolved = false;
  try {
    await verifyFixture();
    if (!allowed(grant, runId, spec.requestSha256))
      throw new SimulationError('simulation_denied');
    const ref = await store.putArtifact(
      Buffer.from(
        JSON.stringify({ schemaVersion: 1, requestSha256: spec.requestSha256 }),
      ),
    );
    return await executeWorkflow(
      store,
      runId,
      {
        schemaVersion: 1,
        nodes: [
          {
            dependsOn: [],
            manifest: {
              schemaVersion: 1,
              blockId: 'process',
              handler: 'synthetic.process',
              handlerVersion: 1,
              effects: 'external',
              inputs: [ref],
            },
          },
        ],
      },
      [
        {
          name: 'synthetic.process',
          version: 1,
          effects: 'external',
          async execute({ signal: kernelSignal }) {
            await verifyFixture();
            running = new Promise<HandlerReport>((resolve) => {
              let reason: Reason = 'ok';
              let stdoutBytes = 0;
              let stderrBytes = 0;
              let chunks = 0;
              let exitCode: number | null = null;
              let exitSignal: string | null = null;
              let offset = 0;
              let closed = false;
              let settled = false;
              let killTimer: ReturnType<typeof setTimeout> | undefined;
              const combined = AbortSignal.any([
                kernelSignal,
                ...(signal ? [signal] : []),
              ]);
              const summary = () =>
                Buffer.from(
                  JSON.stringify({
                    schemaVersion: 1,
                    kind: 'simulated-process',
                    requestSha256: spec.requestSha256,
                    reason,
                    closed,
                    stdoutBytes,
                    stderrBytes,
                    chunks,
                    exitCode,
                    exitSignal,
                    proposal: reason === 'ok' ? AFTER : null,
                  }),
                );
              const done = (
                status: 'succeeded' | 'failed' | 'cancelled' | 'uncertain',
              ) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                clearInterval(revocation);
                combined.removeEventListener('abort', abort);
                if (killTimer) clearTimeout(killTimer);
                const outputs = [summary()];
                resolve(
                  status === 'succeeded' || status === 'cancelled'
                    ? { status, outputs }
                    : {
                        status,
                        outputs,
                        error: {
                          code:
                            reason === 'denied'
                              ? 'permission_denied'
                              : reason === 'timeout'
                                ? 'timeout'
                                : 'execution_failed',
                          message: 'Synthetic process did not confirm success',
                        },
                      },
                );
              };
              // Pre-dispatch denial never starts a child. Start event is already durable.
              if (
                !allowed(grant, runId, spec.requestSha256) ||
                combined.aborted
              ) {
                reason = combined.aborted ? 'cancelled' : 'denied';
                closed = true;
                resolve({
                  status: 'failed',
                  outputs: [summary()],
                  error: {
                    code: 'permission_denied',
                    message: 'Synthetic process dispatch denied',
                  },
                });
                return;
              }
              const child = spawn(
                process.execPath,
                [
                  '--import',
                  pathToFileURL(lifeline).href,
                  '--permission',
                  `--allow-fs-read=${dirname(script)}`,
                  '--max-old-space-size=32',
                  script,
                  spec.mode,
                ],
                {
                  cwd: dirname(script),
                  shell: false,
                  windowsHide: true,
                  env: { SystemRoot: process.env.SystemRoot },
                  stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
                },
              );
              const stop = (why: Reason) => {
                if (closed || settled) return;
                if (reason === 'ok') reason = why;
                child.stdin!.destroy();
                child.kill();
                if (!killTimer)
                  killTimer = setTimeout(() => {
                    unresolved = true;
                    reason = 'unconfirmed';
                    done('uncertain');
                  }, 1000);
              };
              const abort = () => stop('cancelled');
              const timer = setTimeout(() => stop('timeout'), spec.timeoutMs);
              const revocation = setInterval(() => {
                if (!allowed(grant, runId, spec.requestSha256)) stop('denied');
              }, 20);
              combined.addEventListener('abort', abort, { once: true });
              child.stdin!.on('error', () => stop('process_failed'));
              child.on('error', () => stop('process_failed'));
              child.stdout!.on('data', (value: Buffer) => {
                stdoutBytes += value.length;
                chunks++;
                if (stdoutBytes > spec.maxOutputBytes) {
                  stop('output_limit');
                  return;
                }
                // Incremental exact canonical protocol verifier; no general JSONL engine.
                if (
                  !spec.expected
                    .subarray(offset, offset + value.length)
                    .equals(value)
                ) {
                  stop('invalid_output');
                  return;
                }
                offset += value.length;
              });
              child.stderr!.on('data', (value: Buffer) => {
                stderrBytes += value.length;
                if (stderrBytes > spec.maxOutputBytes) stop('output_limit');
              });
              child.once('close', (code, signal) => {
                exitCode = code;
                exitSignal = signal;
                closed = true;
                if (unresolved) {
                  active = false;
                  return;
                }
                if (
                  reason === 'ok' &&
                  (code !== 0 ||
                    offset !== spec.expected.length ||
                    stderrBytes !== 0)
                )
                  reason = 'process_failed';
                done(
                  reason === 'ok'
                    ? 'succeeded'
                    : reason === 'cancelled'
                      ? 'cancelled'
                      : 'failed',
                );
              });
              if (combined.aborted) abort();
              else if (!allowed(grant, runId, spec.requestSha256))
                stop('denied');
              else child.stdin!.end(spec.payload);
            });
            return running;
          },
        },
      ],
      { external: ['process'], timeoutMs: 15000 },
    );
  } finally {
    if (running) await running;
    if (!unresolved) active = false;
  }
}
export async function inspectSimulatedProcess(
  store: DurableStore,
  runId: string,
  grant: SimulatedGrant,
) {
  if (!allowed(grant, runId)) throw new SimulationError('simulation_denied');
  const attempt = await store.getAttempt({
    runId,
    blockId: 'process',
    attemptId: '1',
  });
  const evidence = [];
  for (const ref of attempt?.result?.evidence ?? []) {
    if (!allowed(grant, runId)) throw new SimulationError('simulation_denied');
    evidence.push({ reference: ref, bytes: await store.readArtifact(ref) });
  }
  if (!allowed(grant, runId)) throw new SimulationError('simulation_denied');
  return { attempt, evidence }; // Historical bytes are data, never execution authority.
}
