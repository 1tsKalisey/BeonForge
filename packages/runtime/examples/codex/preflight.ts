import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  writeFile,
  readFile,
  readdir,
  lstat,
  realpath,
} from 'node:fs/promises';
import { join, dirname, basename, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer, connect } from 'node:net';
import { setTimeout, clearTimeout } from 'node:timers';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';
import type { ArtifactStore } from '@beonforge/persistence';
import { SENTINEL, TREE, PROFILE } from './probes.ts';

export const CODEX_SHA =
  '9d563ee4e0441ff9d59d612013e0460ddf8e5709735c2d9f6b98b7ef8ca4eb42';
const hash = (bytes: Uint8Array | string) =>
  createHash('sha256').update(bytes).digest('hex');
export class PreflightError extends Error {
  constructor() {
    super('preflight_invalid');
    this.name = 'PreflightError';
  }
}
type TreeFacts = {
  initial: boolean;
  terminated: boolean;
  observedBeforeExpiry: boolean;
  cleanupConfirmed: boolean;
};
export interface PreflightFacts {
  identityVerified: boolean;
  startupVerified: boolean;
  loopbackControl: boolean;
  sentinel: {
    allowedRead: boolean;
    allowedWrite: boolean;
    outsideReadDenied: boolean;
    outsideWriteDenied: boolean;
    readonlyWriteDenied: boolean;
    network: 'denied' | 'connected' | 'inconclusive';
  } | null;
  normal: TreeFacts | null;
  cancelled: TreeFacts | null;
}
export function assessPreflight(facts: PreflightFacts) {
  const blockers: string[] = [];
  if (!facts.identityVerified) blockers.push('binary_identity_unverified');
  if (!facts.startupVerified) blockers.push('mxc_startup_unverified');
  const s = facts.sentinel;
  if (!s || !s.allowedRead || !s.allowedWrite)
    blockers.push('positive_fs_control_failed');
  if (
    !s ||
    !s.outsideReadDenied ||
    !s.outsideWriteDenied ||
    !s.readonlyWriteDenied
  )
    blockers.push('filesystem_boundary_unverified');
  if (!facts.loopbackControl || s?.network !== 'denied')
    blockers.push('loopback_boundary_unverified');
  for (const [name, t] of [
    ['normal', facts.normal],
    ['cancelled', facts.cancelled],
  ] as const)
    if (
      !t ||
      !t.initial ||
      !t.terminated ||
      !t.observedBeforeExpiry ||
      !t.cleanupConfirmed
    )
      blockers.push(`tree_${name}_unverified`);
  // sandbox probes constrain commands, not a model session or the CLI host itself.
  return {
    schemaVersion: 1,
    kind: 'codex-local-preflight',
    status: 'BLOCKED',
    commandSandbox: blockers.length ? 'BLOCKED' : 'PASS',
    readyForAgent: false,
    blockers: [...blockers, 'cli_host_and_agent_tools_not_proven'],
    hostBoundary: 'not_proven',
    externalNetwork: 'not_tested',
    facts,
  };
}
type Result = {
  exitCode: number | null;
  closed: boolean;
  bounded: boolean;
  stdout: string;
  stderrSha256: string;
  tree: TreeFacts | null;
};
function alive(pid: number): boolean | null {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e && typeof e === 'object' && 'code' in e && e.code === 'ESRCH'
      ? false
      : null;
  }
}
function pidsFrom(text: string): number[] | null {
  try {
    const v = JSON.parse(text.split('\n')[0]!) as Record<string, unknown>;
    if (Object.keys(v).sort().join(',') !== 'child,expiresAt,grand,root')
      return null;
    const ids = [v.root, v.child, v.grand];
    if (
      ids.some(
        (id) => typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0,
      ) ||
      new Set(ids).size !== 3
    )
      return null;
    return ids as number[];
  } catch {
    return null;
  }
}
async function command(
  binary: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  mode?: 'normal' | 'hold',
): Promise<Result> {
  return new Promise((resolve) => {
    const child = spawn(binary, args, {
      cwd,
      env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = Buffer.alloc(0),
      stderr = Buffer.alloc(0),
      bounded = true,
      finished = false,
      ids: number[] | null = null,
      tree: TreeFacts | null = null;
    let measured: Promise<void> = Promise.resolve();
    let settle: ReturnType<typeof setTimeout> | undefined;
    const finish = (exitCode: number | null, closed: boolean) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (settle) clearTimeout(settle);
      void measured.then(() =>
        resolve({
          exitCode,
          closed,
          bounded,
          stdout: stdout.toString('utf8'),
          stderrSha256: hash(stderr),
          tree,
        }),
      );
    };
    const stop = () => {
      child.kill();
      if (!settle) settle = setTimeout(() => finish(null, false), 1000);
    };
    const timer = setTimeout(stop, 10000);
    child.on('error', stop);
    child.stdout.on('data', (value: Buffer) => {
      if (stdout.length + value.length > 65536) {
        bounded = false;
        stop();
        return;
      }
      stdout = Buffer.concat([stdout, value]);
      if (mode && !ids && stdout.includes(10)) {
        ids = pidsFrom(stdout.toString('utf8'));
        if (!ids) return;
        const selected = ids;
        const earliestExpiry = (
          JSON.parse(stdout.toString('utf8').split('\n')[0]!) as {
            expiresAt: unknown;
          }
        ).expiresAt;
        tree = {
          initial: selected.every((id) => alive(id) === true),
          terminated: false,
          observedBeforeExpiry: false,
          cleanupConfirmed: false,
        };
        const facts = tree;
        const started = Date.now();
        if (mode === 'hold') child.kill();
        measured = (async () => {
          await delay(mode === 'hold' ? 500 : 1000);
          facts.observedBeforeExpiry =
            typeof earliestExpiry === 'number' &&
            Number.isSafeInteger(earliestExpiry) &&
            Date.now() < earliestExpiry &&
            Date.now() - started < 2500;
          facts.terminated = selected.every((id) => alive(id) === false);
        })();
      }
    });
    child.stderr.on('data', (value: Buffer) => {
      if (stderr.length + value.length > 65536) {
        bounded = false;
        stop();
        return;
      }
      stderr = Buffer.concat([stderr, value]);
    });
    child.once('close', (code) => finish(code, true));
  });
}
async function safePath(path: string) {
  try {
    if ((await realpath(path)) !== path) throw new Error();
    for (let p = path; ; p = dirname(p)) {
      if ((await lstat(p)).isSymbolicLink()) throw new Error();
      if (dirname(p) === p) break;
    }
  } catch {
    throw new PreflightError();
  }
}
export async function runCodexPreflight(
  parent: string,
  binary: string,
  allowLocalSandbox: boolean,
  store: ArtifactStore,
) {
  if (
    allowLocalSandbox !== true ||
    typeof parent !== 'string' ||
    typeof binary !== 'string' ||
    process.platform !== 'win32'
  )
    throw new PreflightError();
  await safePath(parent);
  await safePath(binary);
  const temp = await realpath(tmpdir());
  if (
    !parent.startsWith(temp + sep) ||
    !basename(parent).startsWith('beonforge-c1-authorized-') ||
    (await readdir(parent)).length ||
    !(await lstat(parent)).isDirectory()
  )
    throw new PreflightError();
  const file = await lstat(binary);
  if (!file.isFile() || file.nlink !== 1) throw new PreflightError();
  const root = await mkdtemp(join(parent, 'probe-'));
  const workspace = join(root, 'workspace');
  for (const dir of ['workspace', 'home', 'local-appdata', 'temp', 'outside'])
    await mkdir(join(root, dir));
  await mkdir(join(workspace, 'out'));
  await writeFile(join(root, 'home/config.toml'), PROFILE, { flag: 'wx' });
  await writeFile(join(workspace, 'visible.txt'), 'synthetic-visible', {
    flag: 'wx',
  });
  await writeFile(join(workspace, 'out/allowed.txt'), 'initial', {
    flag: 'wx',
  });
  await writeFile(join(root, 'outside/read.txt'), 'synthetic-denied', {
    flag: 'wx',
  });
  const env: NodeJS.ProcessEnv = {
    SystemRoot: process.env.SystemRoot,
    CODEX_HOME: join(root, 'home'),
    LOCALAPPDATA: join(root, 'local-appdata'),
    TEMP: join(root, 'temp'),
    TMP: join(root, 'temp'),
    PATH: dirname(binary),
  };
  const facts: PreflightFacts = {
    identityVerified: false,
    startupVerified: false,
    loopbackControl: false,
    sentinel: null,
    normal: null,
    cancelled: null,
  };
  const results: Record<string, Result> = {};
  async function invoke(
    name: string,
    commandArgs: string[],
    mode?: 'normal' | 'hold',
  ) {
    await safePath(binary);
    if (hash(await readFile(binary)) !== CODEX_SHA) throw new PreflightError();
    const r = await command(binary, commandArgs, workspace, env, mode);
    results[name] = r;
    return r;
  }
  const sandbox = (commandArgs: string[]) => [
    '-c',
    'windows.sandbox="mxc"',
    'sandbox',
    '--include-managed-config',
    '--permission-profile',
    'preflight',
    '--cd',
    workspace,
    '--',
    ...commandArgs,
  ];
  if (hash(await readFile(binary)) === CODEX_SHA) {
    const version = await invoke('version', ['--version']);
    facts.identityVerified =
      version.closed &&
      version.bounded &&
      version.exitCode === 0 &&
      version.stdout.trim() === 'codex-cli 0.166.0';
    if (facts.identityVerified) {
      const smoke = await invoke(
        'smoke',
        sandbox([
          join(process.env.SystemRoot!, 'System32/cmd.exe'),
          '/d',
          '/c',
          'echo',
          'BEONFORGE_MXC_SMOKE',
        ]),
      );
      facts.startupVerified =
        smoke.closed &&
        smoke.bounded &&
        smoke.exitCode === 0 &&
        smoke.stdout.trim() === 'BEONFORGE_MXC_SMOKE';
      if (facts.startupVerified) {
        const server = createServer((socket) => socket.end());
        await new Promise<void>((resolve, reject) => {
          server.once('error', reject);
          server.listen(0, '127.0.0.1', resolve);
        });
        try {
          const address = server.address();
          if (!address || typeof address === 'string')
            throw new PreflightError();
          facts.loopbackControl = await new Promise<boolean>((resolve) => {
            const socket = connect({ host: '127.0.0.1', port: address.port });
            const done = (value: boolean) => {
              socket.destroy();
              resolve(value);
            };
            socket.once('connect', () => done(true));
            socket.once('error', () => done(false));
            socket.setTimeout(750, () => done(false));
          });
          const r = await invoke(
            'sentinel',
            sandbox([
              process.execPath,
              '--input-type=module',
              '--eval',
              SENTINEL,
              '--',
              join(root, 'outside/read.txt'),
              join(root, 'outside/write.txt'),
              String(address.port),
            ]),
          );
          if (r.closed && r.bounded && r.exitCode === 0) {
            try {
              const v = JSON.parse(r.stdout) as Record<string, unknown>;
              const keys = [
                'allowedRead',
                'allowedWrite',
                'outsideReadDenied',
                'outsideWriteDenied',
                'readonlyWriteDenied',
              ];
              if (
                Object.keys(v).sort().join(',') ===
                  [...keys, 'network'].sort().join(',') &&
                keys.every((k) => typeof v[k] === 'boolean') &&
                ['denied', 'connected', 'inconclusive'].includes(
                  String(v.network),
                )
              )
                facts.sentinel = v as unknown as NonNullable<
                  PreflightFacts['sentinel']
                >;
            } catch {
              /* Incomplete evidence blocks, never permission. */
            }
          }
        } finally {
          await new Promise<void>((resolve) => server.close(() => resolve()));
        }
        for (const mode of ['normal', 'hold'] as const) {
          const r = await invoke(
            'tree-' + mode,
            sandbox([
              process.execPath,
              '--input-type=module',
              '--eval',
              TREE,
              '--',
              mode,
            ]),
            mode,
          );
          // All descendants have a fixed 4s self-expiry for safe diagnostic cleanup.
          await delay(4500);
          const ids = pidsFrom(r.stdout);
          if (r.tree && ids)
            r.tree.cleanupConfirmed = ids.every((id) => alive(id) === false);
          if (mode === 'normal') facts.normal = r.tree;
          else facts.cancelled = r.tree;
          if (!r.closed || !r.bounded || !r.tree?.cleanupConfirmed) break;
        }
      }
    }
  }
  const report = {
    ...assessPreflight(facts),
    binarySha256: hash(await readFile(binary)),
    binaryPathSha256: hash(binary),
    profileSha256: hash(PROFILE),
    programSha256: hash(SENTINEL + TREE),
    nodeVersion: process.version,
    requestedSandbox: 'mxc',
    observedBackend: 'not_verified',
    evidence: Object.fromEntries(
      Object.entries(results).map(([name, r]) => [
        name,
        {
          exitCode: r.exitCode,
          closed: r.closed,
          bounded: r.bounded,
          stderrSha256: r.stderrSha256,
        },
      ]),
    ),
  };
  const bytes = Buffer.from(JSON.stringify(report));
  const reference = await store.putArtifact(bytes);
  if (!Buffer.from(await store.readArtifact(reference)).equals(bytes))
    throw new PreflightError();
  await writeFile(join(root, 'report.json'), bytes, { flag: 'wx' });
  return { root, reference, report }; // No report ever authorizes a real agent dispatch.
}
