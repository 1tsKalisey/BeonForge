import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  realpath,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { PROFILE } from './probes.ts';

const exec = promisify(execFile);
export const sha256 = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
export async function buildJobProbe() {
  if (process.platform !== 'win32') throw new Error('windows_required');
  const temp = await realpath(tmpdir());
  const build = await mkdtemp(join(temp, 'beonforge-c1b-build-'));
  const binary = join(build, 'PreflightJob.exe');
  const source = fileURLToPath(
    new URL('./windows/PreflightJob.cs', import.meta.url),
  );
  const compiler = join(
    process.env.SystemRoot!,
    'Microsoft.NET/Framework64/v4.0.30319/csc.exe',
  );
  await exec(
    compiler,
    ['/nologo', '/platform:x64', '/target:exe', `/out:${binary}`, source],
    {
      env: { SystemRoot: process.env.SystemRoot },
      windowsHide: true,
      timeout: 15000,
      maxBuffer: 65536,
    },
  );
  return {
    binary,
    hash: sha256(await readFile(binary)),
    build,
    sourceSha256: sha256(await readFile(source)),
    compiler,
    compilerSha256: sha256(await readFile(compiler)),
  };
}

export async function jobScenario(
  probe: Awaited<ReturnType<typeof buildJobProbe>>,
  codex: string,
  mode:
    | 'normal'
    | 'force'
    | 'crash'
    | 'nested'
    | 'baseline-normal'
    | 'baseline-force',
) {
  const root = await mkdtemp(
    join(await realpath(tmpdir()), 'beonforge-c1b-run-'),
  );
  for (const dir of ['out', 'home', 'local', 'temp'])
    await mkdir(join(root, dir));
  for (const role of ['root', 'child', 'grand'])
    await writeFile(join(root, 'out', `${role}.txt`), '', { flag: 'wx' });
  const profile = PROFILE.replace(
    '"out/allowed.txt" = "write"',
    '"out" = "write"',
  ).replace(
    '":root" = "deny"',
    `":root" = "deny"\n${JSON.stringify(probe.binary)} = "read"`,
  );
  await writeFile(join(root, 'home/config.toml'), profile, { flag: 'wx' });
  const env = {
    SystemRoot: process.env.SystemRoot,
    CODEX_HOME: join(root, 'home'),
    LOCALAPPDATA: join(root, 'local'),
    TEMP: join(root, 'temp'),
    TMP: join(root, 'temp'),
    PATH: codex === 'synthetic' ? dirname(probe.binary) : dirname(codex),
  };
  const child = spawn(
    probe.binary,
    ['--launch', root, codex, mode, probe.hash],
    {
      cwd: root,
      env,
      shell: false,
      windowsHide: true,
      // detached avoids libuv's own child job. Only the native launcher job is credited.
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let stdout = '',
    stderr = '',
    closed = false,
    overflow = false;
  let receipt: number[] = [],
    crashTime: number | null = null;
  const start = Date.now();
  child.stdout.on('data', (bytes: Buffer) => {
    if (stdout.length + bytes.length > 65536) {
      overflow = true;
      child.kill();
      return;
    }
    stdout += bytes.toString();
    const match = /READY (\d+),(\d+),(\d+) MEMBERS (True|False)/.exec(stdout);
    if (mode === 'crash' && match && crashTime === null) {
      receipt = [...stdout.matchAll(/MEMBER (\d+) /g)].map((item) =>
        Number(item[1]),
      );
      if (receipt.length < 3) {
        overflow = true;
        child.kill();
        return;
      }
      crashTime = Date.now();
      child.kill();
    }
  });
  child.stderr.on('data', (bytes: Buffer) => {
    if (stderr.length + bytes.length > 65536) {
      overflow = true;
      child.kill();
      return;
    }
    stderr += bytes.toString();
  });
  const exit = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('launcher_timeout'));
    }, 12000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      closed = true;
      resolve(code);
    });
  });
  const absent = (pid: number) => {
    try {
      process.kill(pid, 0);
      return false;
    } catch (error) {
      return (
        !!error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ESRCH'
      );
    }
  };
  let crashTerminated = false;
  if (crashTime !== null) {
    while (Date.now() - crashTime < 500) {
      if (receipt.every(absent)) {
        crashTerminated = true;
        break;
      }
      await delay(1);
    }
  }
  const result = {
    mode,
    root,
    exit,
    closed,
    overflow,
    stdout,
    stderr,
    durationMs: Date.now() - start,
    associatedBeforeResume: /ASSOCIATED \d+ True/.test(stdout),
    members: /MEMBERS True/.test(stdout),
    jobEmpty: /EMPTY 0/.test(stdout),
    terminated:
      mode === 'crash' ? crashTerminated : /RESULT True MS (\d+)/.test(stdout),
    terminationMs:
      mode === 'crash' && crashTime !== null
        ? Date.now() - crashTime
        : Number(/RESULT (?:True|False) MS (\d+)/.exec(stdout)?.[1] ?? NaN),
    cleanup: /CLEAN true/.test(stdout) || crashTerminated,
    requestedBackend: codex === 'synthetic' ? null : 'mxc',
    observedBackend: codex === 'synthetic' ? 'not_applicable' : 'not_verified',
  };
  if (codex !== 'synthetic') {
    const diagnostic = await readFile(
      join(root, 'codex.stderr.txt'),
      'utf8',
    ).catch(() => '');
    if (diagnostic.includes('native MXC is unavailable on this executor'))
      result.observedBackend = 'unavailable';
  }
  await writeFile(
    join(root, 'observation.json'),
    JSON.stringify(result, null, 2),
    { flag: 'wx' },
  );
  return result;
}
