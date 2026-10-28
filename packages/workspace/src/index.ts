import {
  lstat,
  realpath,
  readFile,
  readdir,
  mkdtemp,
  rmdir,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, relative, isAbsolute, parse, join, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import process from 'node:process';
import type { ArtifactReference } from '@beonforge/contracts';
import type { ArtifactStore } from '@beonforge/persistence';

export class ProjectError extends Error {
  constructor(
    public readonly code:
      | 'unsafe_path'
      | 'permission_denied'
      | 'identity_changed'
      | 'invalid_project'
      | 'git_failure'
      | 'git_limit'
      | 'invalid_descriptor',
  ) {
    super(code);
    this.name = 'ProjectError';
  }
}
export interface ProjectPolicy {
  readonly roots: readonly string[];
  readonly gitDirectories: readonly string[];
  readonly commonDirectories: readonly string[];
}
interface Pin {
  readonly path: string;
  readonly dev: string;
  readonly ino: string;
  readonly kind: 'directory' | 'file';
}
export interface ProjectDescriptor {
  readonly schemaVersion: 1;
  readonly pathId: string;
  readonly repositoryId: string;
  readonly root: string;
  readonly gitDirectory: string;
  readonly commonDirectory: string;
  readonly kind: 'repository' | 'worktree';
  readonly pins: readonly Pin[];
}
export interface ProjectInspection {
  readonly schemaVersion: 1;
  readonly pathId: string;
  readonly repositoryId: string;
  readonly kind: ProjectDescriptor['kind'];
  readonly head: string | null;
  readonly branch: string | null;
  readonly detached: boolean;
  readonly unborn: boolean;
  readonly trackedChanges: number;
  readonly hasSubmodules: boolean;
}
function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
export function contains(root: string, target: string): boolean {
  const r = relative(root, target);
  return (
    r === '' || (!isAbsolute(r) && r !== '..' && !r.startsWith(`..${sep}`))
  );
}
/** Canonical local paths only; every existing component is checked before resolving aliases. */
export async function canonical(path: string): Promise<string> {
  if (
    typeof path !== 'string' ||
    !isAbsolute(path) ||
    path.split(/[\\/]/).some((p) => p === '.' || p === '..') ||
    (process.platform === 'win32' &&
      (!/^[A-Za-z]:[\\/]/.test(path) || path.slice(2).includes(':')))
  )
    throw new ProjectError('unsafe_path');
  let current = parse(path).root;
  for (const part of relative(current, path).split(sep).filter(Boolean)) {
    current = join(current, part);
    const stat = await lstat(current).catch(() => {
      throw new ProjectError('unsafe_path');
    });
    if (stat.isSymbolicLink()) throw new ProjectError('unsafe_path');
  }
  return realpath(path);
}
async function pin(path: string): Promise<Pin> {
  const resolved = await canonical(path);
  const stat = await lstat(resolved, { bigint: true });
  if ((!stat.isDirectory() && !stat.isFile()) || stat.ino === 0n)
    throw new ProjectError('unsafe_path');
  return {
    path: resolved,
    dev: String(stat.dev),
    ino: String(stat.ino),
    kind: stat.isDirectory() ? 'directory' : 'file',
  };
}
async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (e) {
    if (
      typeof e === 'object' &&
      e !== null &&
      'code' in e &&
      e.code === 'ENOENT'
    )
      return false;
    throw new ProjectError('unsafe_path');
  }
}
async function permitted(
  path: string,
  roots: readonly string[],
): Promise<void> {
  for (const root of roots) if (contains(await canonical(root), path)) return;
  throw new ProjectError('permission_denied');
}
async function small(path: string): Promise<string> {
  const p = await pin(path);
  if (p.kind !== 'file' || (await lstat(path)).size > 262144)
    throw new ProjectError('git_limit');
  return readFile(path, 'utf8');
}
async function layout(
  rootInput: string,
  policy: ProjectPolicy,
): Promise<ProjectDescriptor> {
  const root = await canonical(rootInput);
  await permitted(root, policy.roots);
  const entry = await pin(join(root, '.git'));
  let gitDirectory = entry.path;
  const pins = [await pin(root), entry];
  if (entry.kind === 'file') {
    const match = /^gitdir: ([^\r\n]+)\r?\n?$/.exec(await small(entry.path));
    if (!match?.[1]) throw new ProjectError('invalid_project');
    gitDirectory = await canonical(resolve(root, match[1]));
    await permitted(gitDirectory, policy.gitDirectories);
    pins.push(await pin(gitDirectory));
  }
  let commonDirectory = gitDirectory;
  if (await exists(join(gitDirectory, 'commondir'))) {
    const commonFile = join(gitDirectory, 'commondir');
    commonDirectory = await canonical(
      resolve(gitDirectory, (await small(commonFile)).trim()),
    );
    await permitted(commonDirectory, policy.commonDirectories);
    const backlink = join(gitDirectory, 'gitdir');
    if (
      (await canonical(
        resolve(gitDirectory, (await small(backlink)).trim()),
      )) !== entry.path
    )
      throw new ProjectError('invalid_project');
    pins.push(
      await pin(commonFile),
      await pin(backlink),
      await pin(commonDirectory),
    );
  } else if (entry.kind !== 'directory')
    throw new ProjectError('invalid_project');
  const config = join(commonDirectory, 'config');
  pins.push(await pin(config));
  for (const file of [config, join(gitDirectory, 'config.worktree')])
    if (await exists(file)) {
      const content = await small(file);
      if (/\\\r?\n/.test(content)) throw new ProjectError('unsafe_path');
      // Only Git's parser determines keys: adjacent section headers are valid Git syntax.
      // --no-includes prevents reading referenced files; no status/filter-capable command yet.
      const { output } = await git(root, ['config', file]);
      if (output !== '' && !output.endsWith('\0'))
        throw new ProjectError('git_failure');
      const keys = output === '' ? [] : output.slice(0, -1).split('\0');
      for (const key of keys) {
        const separator = key.indexOf('.');
        if (separator <= 0 || key.endsWith('.'))
          throw new ProjectError('git_failure');
        const section = key.slice(0, separator).toLowerCase();
        if (
          section === 'include' ||
          section === 'includeif' ||
          section === 'filter'
        )
          throw new ProjectError('unsafe_path');
      }
      if (file !== config) pins.push(await pin(file));
    }
  // Metadata traversal only: no worktree, ignored, private source contents or other checkout scan.
  let budget = 10000;
  async function checkTree(path: string): Promise<void> {
    if (--budget < 0) throw new ProjectError('git_limit');
    const item = await pin(path);
    if (item.kind === 'directory')
      for (const name of await readdir(path)) await checkTree(join(path, name));
  }
  for (const base of new Set([gitDirectory, commonDirectory])) {
    for (const name of ['objects', 'refs'])
      if (await exists(join(base, name)))
        pins.push(await pin(join(base, name)));
    for (const name of [
      'HEAD',
      'index',
      'packed-refs',
      'info',
      'refs',
      'objects',
    ])
      if (await exists(join(base, name))) await checkTree(join(base, name));
    for (const name of ['alternates', 'http-alternates'])
      if (await exists(join(base, 'objects', 'info', name)))
        throw new ProjectError('unsafe_path');
    // A split index may follow sharedindex files outside the usual metadata trees.
    for (const name of await readdir(base))
      if (name.startsWith('sharedindex.')) await checkTree(join(base, name));
  }
  const rootPin = pins[0];
  const commonPin = pins.find((p) => p.path === commonDirectory);
  if (!rootPin || !commonPin) throw new ProjectError('invalid_project');
  return {
    schemaVersion: 1,
    pathId: hash(root),
    repositoryId: hash(
      JSON.stringify([commonPin.path, commonPin.dev, commonPin.ino]),
    ),
    root,
    gitDirectory,
    commonDirectory,
    kind: entry.kind === 'file' ? 'worktree' : 'repository',
    pins,
  };
}
const commands = {
  root: ['rev-parse', '--show-toplevel'],
  git: ['rev-parse', '--absolute-git-dir'],
  common: ['rev-parse', '--path-format=absolute', '--git-common-dir'],
  head: ['rev-parse', '--verify', '--quiet', 'HEAD'],
  branch: ['symbolic-ref', '--quiet', '--short', 'HEAD'],
  status: [
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=no',
    '--ignore-submodules=all',
  ],
  modules: ['ls-files', '--stage', '-z'],
} as const;
async function git(
  root: string,
  command: keyof typeof commands | readonly ['config', string],
): Promise<{ code: number; output: string }> {
  const args =
    typeof command === 'string'
      ? commands[command]
      : [
          'config',
          '--file',
          command[1],
          '--no-includes',
          '--list',
          '--name-only',
          '-z',
        ];
  const nullFile = process.platform === 'win32' ? 'NUL' : '/dev/null';
  const parserDirectory =
    typeof command !== 'string'
      ? await mkdtemp(join(await realpath(tmpdir()), 'beonforge-config-'))
      : undefined;
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: nullFile,
    GIT_CONFIG_SYSTEM: nullFile,
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    GIT_NO_LAZY_FETCH: '1',
    GIT_NO_REPLACE_OBJECTS: '1',
    LC_ALL: 'C',
    ...(parserDirectory
      ? {
          GIT_CEILING_DIRECTORIES: parserDirectory,
          GIT_DISCOVERY_ACROSS_FILESYSTEM: '0',
        }
      : {}),
  };
  return new Promise<{ code: number; output: string }>(
    (resolveResult, reject) => {
      const child = spawn(
        'git',
        [
          '--no-pager',
          '--no-optional-locks',
          '-c',
          'core.fsmonitor=false',
          '-c',
          'core.untrackedCache=false',
          '-c',
          `core.excludesFile=${nullFile}`,
          '-c',
          `core.attributesFile=${nullFile}`,
          ...(parserDirectory ? [] : ['-C', root]),
          ...args,
        ],
        {
          env,
          ...(parserDirectory ? { cwd: parserDirectory } : {}),
          shell: false,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let output = '';
      let bytes = 0;
      let exceeded = false;
      const timer = setTimeout(() => {
        exceeded = true;
        child.kill('SIGKILL');
      }, 5000);
      child.stdout.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 1048576) {
          exceeded = true;
          child.kill('SIGKILL');
        } else output += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 1048576) {
          exceeded = true;
          child.kill('SIGKILL');
        }
      });
      child.once('error', () => {
        clearTimeout(timer);
        reject(new ProjectError('git_failure'));
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        if (exceeded) reject(new ProjectError('git_limit'));
        else if (
          code === 0 ||
          ((command === 'head' || command === 'branch') && code === 1)
        )
          resolveResult({ code: code ?? -1, output });
        else reject(new ProjectError('git_failure'));
      });
    },
  ).finally(async () => {
    if (parserDirectory) await rmdir(parserDirectory);
  });
}
async function inspect(
  descriptor: ProjectDescriptor,
  policy: ProjectPolicy,
): Promise<ProjectInspection> {
  const before = await layout(descriptor.root, policy);
  if (JSON.stringify(before) !== JSON.stringify(descriptor))
    throw new ProjectError('identity_changed');
  for (const [command, expected] of [
    ['root', descriptor.root],
    ['git', descriptor.gitDirectory],
    ['common', descriptor.commonDirectory],
  ] as const) {
    const actual = (await git(descriptor.root, command)).output.trim();
    if ((await canonical(actual)) !== expected)
      throw new ProjectError('invalid_project');
  }
  const head = await git(descriptor.root, 'head');
  const branch = await git(descriptor.root, 'branch');
  const status = await git(descriptor.root, 'status');
  const modules = await git(descriptor.root, 'modules');
  if (
    JSON.stringify(await layout(descriptor.root, policy)) !==
    JSON.stringify(before)
  )
    throw new ProjectError('identity_changed');
  const oid = head.code === 0 ? head.output.trim() : null;
  if (oid !== null && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(oid))
    throw new ProjectError('git_failure');
  const entries = status.output.split('\0').filter(Boolean);
  let trackedChanges = 0;
  for (let i = 0; i < entries.length; i++) {
    trackedChanges++;
    if (/^[RC]|^.[RC]/.test(entries[i] ?? '')) i++;
  }
  return {
    schemaVersion: 1,
    pathId: descriptor.pathId,
    repositoryId: descriptor.repositoryId,
    kind: descriptor.kind,
    head: oid,
    branch: branch.code === 0 ? branch.output.trim() : null,
    detached: branch.code !== 0,
    unborn: oid === null,
    trackedChanges,
    hasSubmodules: modules.output
      .split('\0')
      .some((line) => line.startsWith('160000 ')),
  };
}
export async function registerProject(
  root: string,
  policy: ProjectPolicy,
  store: ArtifactStore,
): Promise<ArtifactReference> {
  const descriptor = await layout(root, policy);
  await inspect(descriptor, policy);
  return store.putArtifact(Buffer.from(JSON.stringify(descriptor)));
}
export async function inspectProject(
  reference: ArtifactReference,
  policy: ProjectPolicy,
  store: ArtifactStore,
): Promise<ProjectInspection> {
  const bytes = await store.readArtifact(reference);
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    throw new ProjectError('invalid_descriptor');
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    !('root' in value) ||
    typeof value.root !== 'string'
  )
    throw new ProjectError('invalid_descriptor');
  // Reconstructed exact descriptor validates all fields/version and prevents accepting extra paths.
  const actual = await layout(value.root, policy);
  if (JSON.stringify(value) !== JSON.stringify(actual))
    throw new ProjectError('identity_changed');
  return inspect(actual, policy);
}
