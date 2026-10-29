import {
  lstat,
  realpath,
  readFile,
  readdir,
  mkdtemp,
  rmdir,
  mkdir,
  open,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  resolve,
  relative,
  isAbsolute,
  parse,
  join,
  sep,
  dirname,
} from 'node:path';
import { parseArtifactReference } from '@beonforge/contracts';
import { createHash } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
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
  emptyTree: ['hash-object', '-t', 'tree', '--stdin'],
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
  command:
    | keyof typeof commands
    | readonly ['config' | 'tree' | 'blob' | 'commit' | 'index', string]
    | readonly ['add', string, string, string]
    | readonly ['attributes', string, readonly string[]],
  attributeSource?: string,
): Promise<{ code: number; output: string; data: Buffer }> {
  if (
    command === 'status' &&
    (!attributeSource ||
      !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(attributeSource))
  )
    throw new ProjectError('git_failure');
  const args =
    typeof command === 'string'
      ? commands[command]
      : command[0] === 'config'
        ? [
            'config',
            '--file',
            command[1],
            '--no-includes',
            '--list',
            '--name-only',
            '-z',
          ]
        : command[0] === 'tree'
          ? ['ls-tree', '-r', '-z', command[1]]
          : command[0] === 'blob'
            ? ['cat-file', 'blob', command[1]]
            : command[0] === 'commit'
              ? ['cat-file', '-t', command[1]]
              : command[0] === 'index'
                ? ['read-tree', command[1]]
                : command[0] === 'attributes'
                  ? [
                      'check-attr',
                      `--source=${command[1]}`,
                      '--stdin',
                      '-z',
                      'working-tree-encoding',
                      'filter',
                      'text',
                      'eol',
                      'ident',
                    ]
                  : [
                      'worktree',
                      'add',
                      '--detach',
                      '--no-checkout',
                      '--lock',
                      '--reason',
                      command[3]!,
                      command[1],
                      command[2]!,
                    ];
  const nullFile = process.platform === 'win32' ? 'NUL' : '/dev/null';
  const input =
    typeof command !== 'string' && command[0] === 'attributes'
      ? Buffer.from(command[2].join('\0') + '\0')
      : Buffer.alloc(0);
  if (input.length > 1048576) throw new ProjectError('git_limit');
  const parserDirectory =
    typeof command !== 'string' && command[0] === 'config'
      ? await mkdtemp(join(await realpath(tmpdir()), 'beonforge-config-'))
      : undefined;
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_ATTR_NOSYSTEM: '1',
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
  const hooks =
    typeof command !== 'string' &&
    (command[0] === 'add' || command[0] === 'index')
      ? await mkdtemp(join(await realpath(tmpdir()), 'beonforge-hooks-'))
      : undefined;
  return new Promise<{ code: number; output: string; data: Buffer }>(
    (resolveResult, reject) => {
      let child: ChildProcessWithoutNullStreams;
      try {
        child = spawn(
          'git',
          [
            '--no-pager',
            '--no-optional-locks',
            ...(command === 'status'
              ? [`--attr-source=${attributeSource!}`]
              : []),
            '-c',
            'core.fsmonitor=false',
            '-c',
            'core.untrackedCache=false',
            '-c',
            `core.excludesFile=${nullFile}`,
            '-c',
            `core.attributesFile=${nullFile}`,
            ...(hooks ? ['-c', `core.hooksPath=${hooks}`] : []),
            ...(parserDirectory ? [] : ['-C', root]),
            ...args,
          ],
          {
            env,
            ...(parserDirectory ? { cwd: parserDirectory } : {}),
            shell: false,
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe'],
          },
        );
      } catch {
        reject(new ProjectError('git_failure'));
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      let exceeded = false;
      let inputFailed = false;
      const timer = setTimeout(() => {
        exceeded = true;
        child.kill('SIGKILL');
      }, 5000);
      child.stdout.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 1048576) {
          exceeded = true;
          child.kill('SIGKILL');
        } else chunks.push(chunk);
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
        child.kill('SIGKILL');
        reject(new ProjectError('git_failure'));
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        if (exceeded) reject(new ProjectError('git_limit'));
        else if (inputFailed) reject(new ProjectError('git_failure'));
        else if (
          code === 0 ||
          ((command === 'head' || command === 'branch') && code === 1)
        )
          resolveResult({
            code: code ?? -1,
            output: Buffer.concat(chunks).toString('utf8'),
            data: Buffer.concat(chunks),
          });
        else reject(new ProjectError('git_failure'));
      });
      child.stdin.on('error', () => {
        inputFailed = true;
        child.kill('SIGKILL');
      });
      try {
        child.stdin.end(input);
      } catch {
        inputFailed = true;
        child.kill('SIGKILL');
      }
    },
  ).finally(async () => {
    if (parserDirectory) await rmdir(parserDirectory);
    if (hooks) await rmdir(hooks);
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
  const oid = head.code === 0 ? head.output.trim() : null;
  if (oid !== null && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(oid))
    throw new ProjectError('git_failure');
  const attributeSource =
    oid ?? (await git(descriptor.root, 'emptyTree')).output.trim();
  const status = await git(descriptor.root, 'status', attributeSource);
  const modules = await git(descriptor.root, 'modules');
  if (
    JSON.stringify(await layout(descriptor.root, policy)) !==
    JSON.stringify(before)
  )
    throw new ProjectError('identity_changed');
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

export interface WorktreePolicy extends ProjectPolicy {
  readonly executionRoots: readonly string[];
  readonly metadataWriteRoots: readonly string[];
  readonly storageRoot: string;
}
interface WorktreeIntent {
  schemaVersion: 1;
  kind: 'worktree-intent';
  project: ArtifactReference;
  commit: string;
  execution: Pin;
  reservation: Pin;
}
export const WORKTREE_VALIDATION_SCOPE = Object.freeze({
  schemaVersion: 1 as const,
  files: 'tracked' as const,
  baseline: 'creation-commit' as const,
  untracked: 'excluded' as const,
  ignored: 'excluded' as const,
  attributes: 'commit' as const,
  atomicSnapshot: false as const,
});
export interface WorktreeReport {
  /** clean covers tracked bytes/index at the creation commit, never untracked/ignored; not an execution permission or atomic snapshot. */
  readonly current?: 'clean' | 'modified' | 'drift' | 'invalid';
  readonly validationScope?: typeof WORKTREE_VALIDATION_SCOPE;
  readonly state: 'prepared' | 'pending' | 'uncertain' | 'confirmed';
  readonly intent: ArtifactReference;
  readonly destination: string;
  readonly receipt?: ArtifactReference;
}
const activeWorktrees = new Set<string>();
async function json(
  store: ArtifactStore,
  ref: ArtifactReference,
): Promise<unknown> {
  try {
    return JSON.parse(
      Buffer.from(await store.readArtifact(ref)).toString('utf8'),
    ) as unknown;
  } catch {
    throw new ProjectError('invalid_descriptor');
  }
}
async function source(
  ref: ArtifactReference,
  policy: ProjectPolicy,
  store: ArtifactStore,
): Promise<ProjectDescriptor> {
  await inspectProject(ref, policy, store);
  return (await json(store, ref)) as ProjectDescriptor;
}
async function tree(root: string, oid: string) {
  if (
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(oid) ||
    (await git(root, ['commit', oid])).output.trim() !== 'commit'
  )
    throw new ProjectError('invalid_project');
  const output = (await git(root, ['tree', oid])).output;
  if (output && !output.endsWith('\0')) throw new ProjectError('git_failure');
  const names = new Map<string, string>();
  let total = 0;
  const files: { name: string; mode: string; oid: string; data: Buffer }[] = [];
  for (const entry of output ? output.slice(0, -1).split('\0') : []) {
    const match =
      /^(100644|100755) blob ([a-f0-9]{40}|[a-f0-9]{64})\t(.+)$/.exec(entry);
    if (!match?.[1] || !match[2] || !match[3])
      throw new ProjectError('unsafe_path');
    const name = match[3];
    const parts = name.split('/');
    if (
      parts.length > 16 ||
      parts.some(
        (p, index) =>
          !/^[A-Za-z0-9_. -]+$/.test(p) ||
          /[. ]$/.test(p) ||
          (/^\.git/i.test(p) &&
            !(p === '.gitignore' && index === parts.length - 1)) ||
          /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p),
      )
    )
      throw new ProjectError('unsafe_path');
    for (let i = 1; i <= parts.length; i++) {
      const original = parts.slice(0, i).join('/');
      const key = original.toLowerCase();
      if (
        (names.has(key) && names.get(key) !== original) ||
        files.some((f) => f.name.toLowerCase() === key)
      )
        throw new ProjectError('unsafe_path');
      names.set(key, original);
    }
    const data = (await git(root, ['blob', match[2]])).data;
    total += data.length;
    if (files.length >= 512 || total > 33554432)
      throw new ProjectError('git_limit');
    files.push({ name, mode: match[1], oid: match[2], data });
  }
  if (files.length) {
    const output = (
      await git(root, ['attributes', oid, files.map((f) => f.name)])
    ).output;
    if (!output.endsWith('\0')) throw new ProjectError('git_failure');
    const fields = output.slice(0, -1).split('\0');
    if (fields.length !== files.length * 15)
      throw new ProjectError('git_failure');
    const attributes = [
      'working-tree-encoding',
      'filter',
      'text',
      'eol',
      'ident',
    ];
    for (let i = 0; i < fields.length; i += 3) {
      if (
        fields[i] !== files[Math.floor(i / 15)]?.name ||
        fields[i + 1] !== attributes[(i / 3) % 5]
      )
        throw new ProjectError('git_failure');
      if (fields[i + 2] !== 'unspecified')
        throw new ProjectError('unsafe_path');
    }
  }
  return files;
}
async function writeExclusive(
  path: string,
  data: Uint8Array,
  mode = 0o600,
): Promise<void> {
  const file = await open(path, 'wx', mode);
  try {
    await file.writeFile(data);
    await file.sync();
  } finally {
    await file.close();
  }
}
async function executionRoot(
  path: string,
  d: ProjectDescriptor,
  policy: WorktreePolicy,
): Promise<Pin> {
  const execution = await pin(path);
  if (execution.kind !== 'directory') throw new ProjectError('unsafe_path');
  const permissions = await lstat(execution.path);
  if (
    process.platform !== 'win32' &&
    ((permissions.mode & 0o077) !== 0 || permissions.uid !== process.getuid?.())
  )
    throw new ProjectError('unsafe_path');
  await permitted(execution.path, policy.executionRoots);
  await permitted(d.gitDirectory, policy.metadataWriteRoots);
  await permitted(d.commonDirectory, policy.metadataWriteRoots);
  for (const other of [
    d.root,
    d.gitDirectory,
    d.commonDirectory,
    await canonical(policy.storageRoot),
  ])
    if (contains(other, execution.path) || contains(execution.path, other))
      throw new ProjectError('unsafe_path');
  for (let parent = execution.path; ; parent = dirname(parent)) {
    for (const marker of [
      'blobs',
      'staging',
      'manifest.json',
      'beonforge-backup.json',
      'restore-source.json',
    ])
      if (await exists(join(parent, marker)))
        throw new ProjectError('unsafe_path');
    if (dirname(parent) === parent) break;
  }
  return execution;
}
export async function prepareWorktree(
  project: ArtifactReference,
  commit: string,
  root: string,
  policy: WorktreePolicy,
  store: ArtifactStore,
): Promise<ArtifactReference> {
  const d = await source(project, policy, store);
  const execution = await executionRoot(root, d, policy);
  await tree(d.root, commit);
  const reservation = await pin(
    await mkdtemp(join(execution.path, 'beonforge-worktree-')),
  );
  return store.putArtifact(
    Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        kind: 'worktree-intent',
        project,
        commit,
        execution,
        reservation,
      } satisfies WorktreeIntent),
    ),
  );
}
async function loadIntent(
  ref: ArtifactReference,
  policy: WorktreePolicy,
  store: ArtifactStore,
) {
  const raw = await json(store, ref);
  if (typeof raw !== 'object' || raw === null)
    throw new ProjectError('invalid_descriptor');
  const value = raw as Partial<WorktreeIntent>;
  if (
    Object.keys(value).sort().join() !==
      'commit,execution,kind,project,reservation,schemaVersion' ||
    value.schemaVersion !== 1 ||
    value.kind !== 'worktree-intent' ||
    typeof value.commit !== 'string' ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value.commit) ||
    typeof value.execution?.path !== 'string' ||
    typeof value.reservation?.path !== 'string'
  )
    throw new ProjectError('invalid_descriptor');
  const project = parseArtifactReference(value.project);
  const d = await source(project, policy, store);
  const execution = await executionRoot(value.execution.path, d, policy);
  const reservation = await pin(value.reservation.path);
  if (
    reservation.kind !== 'directory' ||
    JSON.stringify(execution) !== JSON.stringify(value.execution) ||
    JSON.stringify(reservation) !== JSON.stringify(value.reservation) ||
    dirname(reservation.path) !== execution.path ||
    !reservation.path.startsWith(join(execution.path, 'beonforge-worktree-'))
  )
    throw new ProjectError('identity_changed');
  return {
    commit: value.commit,
    project,
    d,
    destination: join(reservation.path, 'checkout'),
    reservation,
  };
}
export async function inspectWorktree(
  ref: ArtifactReference,
  policy: WorktreePolicy,
  store: ArtifactStore,
): Promise<WorktreeReport> {
  return inspectWorktreeInternal(ref, policy, store, false);
}
async function inspectWorktreeInternal(
  ref: ArtifactReference,
  policy: WorktreePolicy,
  store: ArtifactStore,
  confirm: boolean,
): Promise<WorktreeReport> {
  const { commit, d, destination, reservation } = await loadIntent(
    ref,
    policy,
    store,
  );
  const base = {
    intent: ref,
    destination,
    validationScope: WORKTREE_VALIDATION_SCOPE,
  };
  const dispatched = join(reservation.path, 'dispatch.json');
  if (!(await exists(dispatched)))
    return {
      ...base,
      state: (await exists(destination)) ? 'uncertain' : 'prepared',
    };
  if ((await small(dispatched)) !== ref.sha256)
    throw new ProjectError('identity_changed');
  if (activeWorktrees.has(d.commonDirectory))
    return { ...base, state: 'pending' };
  const marker = join(reservation.path, 'confirmed.json');
  let historical: ArtifactReference | undefined;
  if (await exists(marker)) {
    try {
      const record = JSON.parse(await small(marker)) as {
        schemaVersion?: unknown;
        receipt?: unknown;
        intent?: unknown;
      };
      if (
        record.schemaVersion !== 1 ||
        JSON.stringify(record.intent) !== JSON.stringify(ref) ||
        Object.keys(record).sort().join() !== 'intent,receipt,schemaVersion'
      )
        throw new ProjectError('invalid_descriptor');
      historical = parseArtifactReference(record.receipt);
      const receipt = (await json(store, historical)) as {
        schemaVersion?: unknown;
        kind?: unknown;
        intent?: unknown;
        project?: unknown;
        commit?: unknown;
      };
      if (
        receipt.schemaVersion !== 1 ||
        receipt.kind !== 'worktree-receipt' ||
        receipt.commit !== commit ||
        JSON.stringify(receipt.intent) !== JSON.stringify(ref)
      )
        throw new ProjectError('invalid_descriptor');
      const project = parseArtifactReference(receipt.project);
      const descriptor = (await json(store, project)) as ProjectDescriptor;
      const targetPolicy = {
        ...policy,
        roots: [destination],
        gitDirectories: [join(d.commonDirectory, 'worktrees')],
        commonDirectories: [d.commonDirectory],
      };
      try {
        if (
          descriptor.root !== destination ||
          JSON.stringify(await layout(destination, targetPolicy)) !==
            JSON.stringify(descriptor)
        )
          return {
            ...base,
            state: 'confirmed',
            receipt: historical,
            current: 'drift',
          };
        if (
          (await small(join(descriptor.gitDirectory, 'locked'))).trim() !==
          `beonforge:${ref.sha256}`
        )
          throw new ProjectError('identity_changed');
        // Check metadata only here. Filesystem safety is validated below before
        // any Git status call can inspect tracked paths through altered parents.
        const head = await git(destination, 'head');
        const branch = await git(destination, 'branch');
        if (
          branch.code === 0 ||
          head.code !== 0 ||
          head.output.trim() !== commit
        )
          return {
            ...base,
            state: 'confirmed',
            receipt: historical,
            current: 'drift',
          };
      } catch {
        return {
          ...base,
          state: 'confirmed',
          receipt: historical,
          current: 'invalid',
        };
      }
    } catch {
      return { ...base, state: 'uncertain' };
    }
  }
  try {
    const targetPolicy = {
      ...policy,
      roots: [destination],
      gitDirectories: [join(d.commonDirectory, 'worktrees')],
      commonDirectories: [d.commonDirectory],
    };
    const descriptor = await layout(destination, targetPolicy);
    if (
      (await small(join(descriptor.gitDirectory, 'locked'))).trim() !==
      `beonforge:${ref.sha256}`
    )
      throw new ProjectError('identity_changed');
    const files = await tree(d.root, commit);
    const expected = new Set(['.git', ...files.map((f) => f.name)]);
    for (const f of files) {
      let dir = dirname(f.name);
      while (dir !== '.') {
        expected.add(dir.replaceAll('\\', '/'));
        dir = dirname(dir);
      }
    }
    async function checkEntries(dir: string, prefix = ''): Promise<void> {
      for (const name of await readdir(dir)) {
        const relativeName = prefix + name;
        if (!expected.has(relativeName))
          throw new ProjectError('identity_changed');
        const stat = await lstat(join(dir, name));
        if (stat.isSymbolicLink()) throw new ProjectError('unsafe_path');
        if (stat.isDirectory())
          await checkEntries(join(dir, name), relativeName + '/');
      }
    }
    // Creation must be exact. Later inspections deliberately ignore untracked/ignored
    // names and contents: clean means tracked state, not an empty private workspace.
    if (!historical) await checkEntries(destination);
    for (const f of files) {
      let path = destination;
      for (const part of f.name.split('/')) {
        path = join(path, part);
        if (!(await exists(path))) throw new ProjectError('identity_changed');
        path = await canonical(path);
      }
      const stat = await lstat(path);
      if (!stat.isFile()) throw new ProjectError('unsafe_path');
      if (stat.size !== f.data.length)
        throw new ProjectError('identity_changed');
      if (!(await readFile(path)).equals(f.data))
        throw new ProjectError('identity_changed');
    }
    const entries = (await git(destination, 'modules')).output
      .split('\0')
      .filter(Boolean)
      .sort();
    if (
      JSON.stringify(entries) !==
      JSON.stringify(files.map((f) => `${f.mode} ${f.oid} 0\t${f.name}`).sort())
    )
      throw new ProjectError('identity_changed');
    let inspection: ProjectInspection;
    try {
      inspection = await inspect(descriptor, targetPolicy);
    } catch (error: unknown) {
      if (
        historical &&
        error instanceof ProjectError &&
        error.code === 'identity_changed'
      )
        return {
          ...base,
          state: 'confirmed',
          receipt: historical,
          current: 'drift',
        };
      throw error;
    }
    if (!inspection.detached || inspection.head !== commit) {
      if (historical)
        return {
          ...base,
          state: 'confirmed',
          receipt: historical,
          current: 'drift',
        };
      throw new ProjectError('identity_changed');
    }
    if (inspection.trackedChanges !== 0)
      throw new ProjectError('identity_changed');
    if (historical)
      return {
        ...base,
        state: 'confirmed',
        receipt: historical,
        current: 'clean',
      };
    if (!confirm) return { ...base, state: 'uncertain' };
    const project = await store.putArtifact(
      Buffer.from(JSON.stringify(descriptor)),
    );
    const receipt = await store.putArtifact(
      Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          kind: 'worktree-receipt',
          intent: ref,
          project,
          commit,
        }),
      ),
    );
    await canonical(reservation.path);
    await writeExclusive(
      marker,
      Buffer.from(JSON.stringify({ schemaVersion: 1, intent: ref, receipt })),
    );
    return { ...base, state: 'confirmed', receipt, current: 'clean' };
  } catch (error: unknown) {
    if (historical)
      return {
        ...base,
        state: 'confirmed',
        receipt: historical,
        current:
          error instanceof ProjectError && error.code === 'identity_changed'
            ? 'modified'
            : 'invalid',
      };
    return { ...base, state: 'uncertain' };
  }
}
export async function createWorktree(
  ref: ArtifactReference,
  policy: WorktreePolicy,
  store: ArtifactStore,
): Promise<WorktreeReport> {
  const { commit, project, d, destination, reservation } = await loadIntent(
    ref,
    policy,
    store,
  );
  if (activeWorktrees.has(d.commonDirectory))
    throw new ProjectError('permission_denied');
  if (
    (await exists(join(reservation.path, 'dispatch.json'))) ||
    (await exists(destination))
  )
    throw new ProjectError('invalid_project');
  const files = await tree(d.root, commit);
  await source(project, policy, store);
  await loadIntent(ref, policy, store);
  // Recheck after awaits: only one operation per common-dir in this process.
  if (activeWorktrees.has(d.commonDirectory))
    throw new ProjectError('permission_denied');
  activeWorktrees.add(d.commonDirectory);
  try {
    await writeExclusive(
      join(reservation.path, 'dispatch.json'),
      Buffer.from(ref.sha256),
    );
    await git(d.root, ['add', destination, commit, `beonforge:${ref.sha256}`]);
    const targetPolicy = {
      roots: [destination],
      gitDirectories: [join(d.commonDirectory, 'worktrees')],
      commonDirectories: [d.commonDirectory],
    };
    const targetIdentity = await layout(destination, targetPolicy);
    for (const f of files) {
      const path = join(destination, f.name);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await canonical(dirname(path));
      await writeExclusive(path, f.data, f.mode === '100755' ? 0o700 : 0o600);
    }
    if (
      JSON.stringify(await layout(destination, targetPolicy)) !==
      JSON.stringify(targetIdentity)
    )
      throw new ProjectError('identity_changed');
    await git(destination, ['index', commit]);
  } catch {
    return {
      intent: ref,
      destination,
      state: 'uncertain',
      validationScope: WORKTREE_VALIDATION_SCOPE,
    };
  } finally {
    activeWorktrees.delete(d.commonDirectory);
  }
  return inspectWorktreeInternal(ref, policy, store, true);
}
