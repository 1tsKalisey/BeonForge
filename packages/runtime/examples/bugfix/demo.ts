import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import {
  lstat,
  realpath,
  readdir,
  mkdir,
  mkdtemp,
  open,
} from 'node:fs/promises';
import { join, basename } from 'node:path';
import { types } from 'node:util';
import process from 'node:process';
import {
  parseArtifactReference,
  type ArtifactReference,
} from '@beonforge/contracts';
import {
  openSqlitePersistence,
  type DurableStore,
} from '@beonforge/persistence';
import {
  executeWorkflow,
  type BlockHandler,
  type HandlerReport,
  type Workflow,
} from '@beonforge/runtime';
import {
  canonical,
  ProjectError,
  ContextError,
  contains,
  registerProject,
  inspectProject,
  prepareWorktree,
  createWorktree,
  inspectWorktree,
  buildContextPackage,
  buildContextEnvelope,
  readContextEnvelope,
  type WorktreePolicy,
  type ContextPolicy,
} from '@beonforge/workspace';
import { BEFORE, AFTER, FILES, EXPECTED_DIFF } from './fixture.ts';

export type BugfixCode =
  | 'demo_denied'
  | 'demo_invalid'
  | 'demo_changed'
  | 'demo_process_failed'
  | 'demo_interrupted'
  | 'demo_review_exists'
  | 'demo_storage_failure';
export class BugfixError extends Error {
  readonly code: BugfixCode;
  constructor(code: BugfixCode) {
    super(code);
    this.name = 'BugfixError';
    this.code = code;
  }
}
export interface BugfixPolicy {
  root: string;
  canRead: boolean;
  canRun?: boolean;
  canPatch?: boolean;
  patchSha256?: string;
  canReview?: boolean;
  canDiscard?: boolean;
}
interface Pin {
  path: string;
  dev: string;
  ino: string;
}
interface State {
  schemaVersion: 1;
  kind: 'synthetic-bugfix';
  pins: Pin[];
  project: ArtifactReference;
  intent: ArtifactReference;
  package: ArtifactReference;
  envelope: ArtifactReference;
  commit: string;
  destination: string;
}
export interface BugfixEvidence {
  schemaVersion: 1;
  kind: 'synthetic-bugfix-evidence';
  baseCommit: string;
  intent: ArtifactReference;
  envelope: ArtifactReference;
  patchSha256: string;
  beforeSha256: string;
  afterSha256: string;
  diff: string;
  redExit: 1;
  greenExit: 0;
  review: 'pending';
  integration: 'not_performed';
}
const fail = (code: BugfixCode): never => {
  throw new BugfixError(code);
};
const hash = (bytes: string | Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');
const bytes = (value: unknown): Buffer =>
  Buffer.from(JSON.stringify(value), 'utf8');
function own(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object' || types.isProxy(value))
    return fail('demo_invalid');
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor && !Object.hasOwn(descriptor, 'value'))
    return fail('demo_invalid');
  return descriptor?.value as unknown;
}
function authorize(
  root: string,
  policy: BugfixPolicy,
  flag?: 'canRun' | 'canPatch' | 'canReview' | 'canDiscard',
  patch?: string,
): void {
  if (
    own(policy, 'root') !== root ||
    own(policy, 'canRead') !== true ||
    (flag && own(policy, flag) !== true) ||
    (patch && own(policy, 'patchSha256') !== patch)
  )
    fail('demo_denied');
}
async function identity(path: string): Promise<Pin> {
  if ((await canonical(path)) !== path) return fail('demo_changed');
  const s = await lstat(path, { bigint: true });
  if (!s.isDirectory() || s.isSymbolicLink() || s.ino === 0n)
    return fail('demo_changed');
  return { path, dev: String(s.dev), ino: String(s.ino) };
}
async function safeRead(path: string): Promise<Buffer> {
  if ((await canonical(path)) !== path) return fail('demo_changed');
  const s = await lstat(path, { bigint: true });
  if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1n || s.size > 32768n)
    return fail('demo_changed');
  const f = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const a = await f.stat({ bigint: true });
    if (a.dev !== s.dev || a.ino !== s.ino) return fail('demo_changed');
    const data = await f.readFile();
    const b = await f.stat({ bigint: true }),
      c = await lstat(path, { bigint: true });
    if (
      a.size !== b.size ||
      a.mtimeNs !== b.mtimeNs ||
      a.ctimeNs !== b.ctimeNs ||
      b.ino !== c.ino ||
      b.dev !== c.dev ||
      c.nlink !== 1n ||
      c.isSymbolicLink()
    )
      return fail('demo_changed');
    return data;
  } finally {
    await f.close();
  }
}
async function exclusive(path: string, data: Uint8Array): Promise<void> {
  const f = await open(path, 'wx', 0o600);
  try {
    await f.writeFile(data);
    await f.sync();
  } finally {
    await f.close();
  }
}
function environment(root: string): NodeJS.ProcessEnv {
  const home = join(root, 'process');
  return {
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
    HOME: home,
    USERPROFILE: home,
    TMP: home,
    TEMP: home,
    TMPDIR: home,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: join(home, 'empty'),
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_ATTR_NOSYSTEM: '1',
    GIT_NO_LAZY_FETCH: '1',
    GIT_CEILING_DIRECTORIES: root,
    LANG: 'C',
    LC_ALL: 'C',
    NO_COLOR: '1',
  };
}
async function command(
  root: string,
  cwd: string,
  executable: string,
  args: string[],
  signal?: AbortSignal,
): Promise<{ code: number; out: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      args,
      {
        cwd,
        env: environment(root),
        timeout: 10000,
        maxBuffer: 65536,
        windowsHide: true,
        killSignal: 'SIGKILL',
        ...(signal ? { signal } : {}),
      },
      (error, stdout) => {
        // Never expose native errors, spawnargs, stderr or absolute fixture paths.
        if (error && (error.killed || error.name === 'AbortError'))
          return reject(new BugfixError('demo_interrupted'));
        if (error && typeof error.code !== 'number')
          return reject(new BugfixError('demo_process_failed'));
        resolve({
          code: (error?.code as number | undefined) ?? 0,
          out: stdout,
        });
      },
    );
  });
}
async function git(root: string, cwd: string, args: string[]): Promise<string> {
  const r = await command(root, cwd, 'git', [
    '--no-pager',
    '--no-optional-locks',
    '-c',
    'core.fsmonitor=false',
    '-c',
    `core.hooksPath=${join(root, 'process', 'hooks')}`,
    '-c',
    'core.autocrlf=false',
    '-c',
    'gc.auto=0',
    '-c',
    'commit.gpgSign=false',
    '-c',
    'user.name=BeonForge Synthetic',
    '-c',
    'user.email=synthetic@example.invalid',
    ...args,
  ]);
  if (r.code !== 0) return fail('demo_process_failed');
  return r.out;
}
async function fixture(root: string, content: string): Promise<void> {
  for (const path of [root, join(root, 'src'), join(root, 'test')])
    await identity(path);
  const expected = ['.git', '.gitignore', 'package.json', 'src', 'test'].sort();
  if (
    (await readdir(root)).sort().join('\0') !== expected.join('\0') ||
    (await readdir(join(root, 'src'))).join() !== 'add.ts' ||
    (await readdir(join(root, 'test'))).join() !== 'add.test.mjs'
  )
    return fail('demo_changed');
  for (const [name, value] of Object.entries(FILES)) {
    const actual = await safeRead(join(root, name));
    if (!actual.equals(Buffer.from(name === 'src/add.ts' ? content : value)))
      return fail('demo_changed');
  }
}
function pinnedPaths(root: string, destination: string): string[] {
  return [
    root,
    join(root, 'project'),
    join(root, 'storage'),
    join(root, 'process'),
    join(root, 'process', 'hooks'),
    join(root, 'worktrees'),
    join(root, 'evidence'),
    destination,
    join(destination, 'src'),
    join(destination, 'test'),
    join(root, 'project', 'src'),
    join(root, 'project', 'test'),
  ];
}
function workspace(root: string, state: State): WorktreePolicy {
  return {
    roots: [join(root, 'project'), state.destination],
    gitDirectories: [join(root, 'project', '.git', 'worktrees')],
    commonDirectories: [join(root, 'project', '.git')],
    executionRoots: [join(root, 'worktrees')],
    metadataWriteRoots: [join(root, 'project', '.git')],
    storageRoot: join(root, 'storage'),
  };
}
function context(root: string, state: State): ContextPolicy {
  return {
    canRead: true,
    canPublish: true,
    allowedIntents: [state.intent],
    allowedPaths: Object.keys(FILES),
    workspace: workspace(root, state),
  };
}
function preview(state: State) {
  const value = {
    schemaVersion: 1,
    path: 'src/add.ts',
    baseCommit: state.commit,
    intent: state.intent,
    beforeSha256: hash(BEFORE),
    afterSha256: hash(AFTER),
  };
  return { ...value, patchSha256: hash(bytes(value)) };
}
async function load(root: string, policy: BugfixPolicy): Promise<State> {
  authorize(root, policy);
  if (
    (await canonical(root)) !== root ||
    !basename(root).startsWith('beonforge-bugfix-')
  )
    return fail('demo_denied');
  const raw: unknown = JSON.parse(
    new TextDecoder('utf8', { fatal: true }).decode(
      await safeRead(join(root, 'session.json')),
    ),
  );
  if (
    own(raw, 'schemaVersion') !== 1 ||
    own(raw, 'kind') !== 'synthetic-bugfix'
  )
    return fail('demo_invalid');
  const commit = own(raw, 'commit'),
    destination = own(raw, 'destination'),
    pins = own(raw, 'pins');
  if (
    typeof commit !== 'string' ||
    !/^[a-f0-9]{40}$/.test(commit) ||
    typeof destination !== 'string' ||
    !contains(join(root, 'worktrees'), destination) ||
    !Array.isArray(pins) ||
    pins.length !== 12
  )
    return fail('demo_invalid');
  const paths = pinnedPaths(root, destination);
  const checked: Pin[] = [];
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    if (!path) return fail('demo_invalid');
    const pin = await identity(path),
      previous: unknown = pins[i];
    if (
      own(previous, 'path') !== pin.path ||
      own(previous, 'dev') !== pin.dev ||
      own(previous, 'ino') !== pin.ino
    )
      return fail('demo_changed');
    checked.push(pin);
  }
  if (
    (await safeRead(join(root, 'process', 'empty'))).length ||
    (await readdir(join(root, 'process', 'hooks'))).length
  )
    return fail('demo_changed');
  authorize(root, policy);
  return {
    schemaVersion: 1,
    kind: 'synthetic-bugfix',
    pins: checked,
    project: parseArtifactReference(own(raw, 'project')),
    intent: parseArtifactReference(own(raw, 'intent')),
    package: parseArtifactReference(own(raw, 'package')),
    envelope: parseArtifactReference(own(raw, 'envelope')),
    commit,
    destination,
  };
}
async function validate(
  root: string,
  policy: BugfixPolicy,
  state: State,
  store: DurableStore,
  content: string,
): Promise<void> {
  await load(root, policy);
  const original = await inspectProject(
    state.project,
    workspace(root, state),
    store,
  );
  if (original.head !== state.commit || original.trackedChanges !== 0)
    return fail('demo_changed');
  await fixture(join(root, 'project'), BEFORE);
  const report = await inspectWorktree(
    state.intent,
    workspace(root, state),
    store,
  );
  if (
    report.state !== 'confirmed' ||
    report.destination !== state.destination ||
    report.current !== (content === BEFORE ? 'clean' : 'modified')
  )
    return fail('demo_changed');
  await fixture(state.destination, content);
  const envelope = await readContextEnvelope(
    state.envelope,
    context(root, state),
    store,
  );
  if (
    envelope.manifest.package.sha256 !== state.package.sha256 ||
    envelope.context.manifest.source.commit !== state.commit
  )
    return fail('demo_changed');
  authorize(root, policy);
}
async function storeAt(
  root: string,
  initialize = false,
): Promise<DurableStore> {
  const database = join(root, 'storage', 'events.sqlite');
  if (!initialize) {
    try {
      if ((await canonical(database)) !== database) return fail('demo_changed');
      const stat = await lstat(database);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.size === 0 ||
        stat.nlink !== 1
      )
        return fail('demo_changed');
    } catch {
      return fail('demo_changed');
    }
  }
  return openSqlitePersistence(database);
}
async function boundary<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof BugfixError) throw error;
    if (error instanceof ProjectError || error instanceof ContextError)
      throw new BugfixError('demo_changed');
    throw new BugfixError('demo_storage_failure');
  }
}

/** Explicitly authorizes only new synthetic fixture creation in this empty private parent. */
export async function prepareBugfixDemo(authorizedParent: string) {
  return boundary(async () => {
    const parent = await canonical(authorizedParent);
    if (
      parent !== authorizedParent ||
      ['*', '?', ',', '[', ']', '{', '}', '\n', '\r', '\0'].some((c) =>
        parent.includes(c),
      ) ||
      (await readdir(parent)).length
    )
      return fail('demo_denied');
    const stat = await lstat(parent);
    if (
      process.platform !== 'win32' &&
      (stat.uid !== process.getuid?.() || stat.mode & 0o077)
    )
      return fail('demo_denied');
    const root = await realpath(
      await mkdtemp(join(parent, 'beonforge-bugfix-')),
    );
    for (const dir of [
      'project',
      'storage',
      'worktrees',
      'evidence',
      'process',
      'process/hooks',
      'project/src',
      'project/test',
    ])
      await mkdir(join(root, dir), { mode: 0o700 });
    await exclusive(join(root, 'process', 'empty'), Buffer.alloc(0));
    for (const [path, data] of Object.entries(FILES))
      await exclusive(join(root, 'project', path), Buffer.from(data));
    await git(root, join(root, 'project'), [
      'init',
      '-q',
      '--initial-branch=fixture',
      `--template=${join(root, 'process', 'hooks')}`,
      '--object-format=sha1',
    ]);
    await git(root, join(root, 'project'), [
      'add',
      '--',
      ...Object.keys(FILES),
    ]);
    await git(root, join(root, 'project'), [
      'commit',
      '-qm',
      'synthetic arithmetic fixture',
    ]);
    const commit = (
      await git(root, join(root, 'project'), ['rev-parse', 'HEAD'])
    ).trim();
    const store = await storeAt(root, true);
    try {
      const projectPolicy = {
        roots: [join(root, 'project')],
        gitDirectories: [],
        commonDirectories: [],
      };
      const project = await registerProject(
        join(root, 'project'),
        projectPolicy,
        store,
      );
      const wp = {
        ...projectPolicy,
        executionRoots: [join(root, 'worktrees')],
        metadataWriteRoots: [join(root, 'project', '.git')],
        storageRoot: join(root, 'storage'),
      };
      const intent = await prepareWorktree(
        project,
        commit,
        join(root, 'worktrees'),
        wp,
        store,
      );
      const report = await createWorktree(intent, wp, store);
      if (report.state !== 'confirmed' || report.current !== 'clean')
        return fail('demo_changed');
      const state: State = {
        schemaVersion: 1,
        kind: 'synthetic-bugfix',
        pins: [],
        project,
        intent,
        commit,
        destination: report.destination,
        package: project,
        envelope: project,
      };
      const cp = context(root, state);
      state.package = await buildContextPackage(
        intent,
        Object.keys(FILES),
        cp,
        store,
      );
      state.envelope = await buildContextEnvelope(
        state.package,
        'Correct only the synthetic add subtraction bug. No integration; await human review.',
        cp,
        store,
      );
      state.pins = await Promise.all(
        pinnedPaths(root, state.destination).map(identity),
      );
      await exclusive(join(root, 'session.json'), bytes(state));
      return {
        root,
        destination: state.destination,
        baseCommit: commit,
        intent,
        package: state.package,
        envelope: state.envelope,
        preview: preview(state),
        review: 'pending' as const,
      };
    } finally {
      await store.close();
    }
  });
}
async function testFixture(
  root: string,
  state: State,
  expected: 0 | 1,
  signal?: AbortSignal,
) {
  const result = await command(
    root,
    state.destination,
    process.execPath,
    [
      '--permission',
      `--allow-fs-read=${state.destination}`,
      '--test-isolation=none',
      '--test-reporter=tap',
      '--test',
      'test/add.test.mjs',
    ],
    signal,
  );
  if (
    result.code !== expected ||
    !result.out.includes('synthetic-add-2-plus-2') ||
    !result.out.includes('# tests 1') ||
    !result.out.includes(`# pass ${expected === 0 ? 1 : 0}`) ||
    !result.out.includes(`# fail ${expected}`) ||
    (expected === 1 && !result.out.includes('ERR_ASSERTION'))
  )
    return fail('demo_process_failed');
  return {
    command:
      'node --permission --allow-fs-read=<authorized-worktree> --test-isolation=none --test-reporter=tap --test test/add.test.mjs',
    exitCode: expected,
    assertion: 'synthetic-add-2-plus-2',
    expected: true,
  };
}
async function rewrite(
  path: string,
  before: string,
  after: string,
  check: () => void,
): Promise<void> {
  const expected = await safeRead(path);
  if (!expected.equals(Buffer.from(before))) return fail('demo_changed');
  const pin = await lstat(path, { bigint: true });
  const file = await open(path, constants.O_RDWR | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await file.stat({ bigint: true });
    if (
      stat.dev !== pin.dev ||
      stat.ino !== pin.ino ||
      stat.nlink !== 1n ||
      !(await file.readFile()).equals(expected)
    )
      return fail('demo_changed');
    check();
    const written = await file.write(
      Buffer.from(after),
      0,
      Buffer.byteLength(after),
      0,
    );
    if (written.bytesWritten !== Buffer.byteLength(after))
      return fail('demo_changed');
    await file.truncate(Buffer.byteLength(after));
    await file.sync();
  } finally {
    await file.close();
  }
  if (!(await safeRead(path)).equals(Buffer.from(after)))
    return fail('demo_changed');
}
const graph = (names: string[], inputs: ArtifactReference[]): Workflow => ({
  schemaVersion: 1,
  nodes: names.map((id, i) => ({
    manifest: {
      schemaVersion: 1,
      blockId: id,
      handler: `synthetic.${id}`,
      handlerVersion: 1,
      effects: 'external',
      inputs,
    },
    dependsOn: i ? [names[i - 1] ?? 'invalid'] : [],
  })),
});
function handler(
  name: string,
  fn: (signal: AbortSignal) => Promise<unknown>,
  settling: Promise<unknown>[],
): BlockHandler {
  return {
    name: `synthetic.${name}`,
    version: 1,
    effects: 'external',
    async execute({ signal }): Promise<HandlerReport> {
      try {
        if (signal.aborted) return fail('demo_interrupted');
        const job = fn(signal);
        settling.push(job);
        const result = await job;
        if (signal.aborted) return fail('demo_interrupted');
        return { status: 'succeeded', outputs: [bytes(result)] };
      } catch (error) {
        return {
          status: 'uncertain',
          outputs: [],
          error: {
            code: 'execution_failed',
            message:
              error instanceof BugfixError
                ? error.code
                : 'Synthetic operation unconfirmed',
          },
        };
      }
    },
  };
}
/** Does not review or integrate changes. Reopening delegates uncertain/confirmed handling to the kernel. */
export async function runBugfixDemo(
  root: string,
  policy: BugfixPolicy,
  signal?: AbortSignal,
) {
  return boundary(async () => {
    const state = await load(root, policy),
      patch = preview(state).patchSha256;
    authorize(root, policy, 'canRun');
    authorize(root, policy, 'canPatch', patch);
    const store = await storeAt(root);
    const settling: Promise<unknown>[] = [];
    const step = (
      name: string,
      fn: (signal: AbortSignal) => Promise<unknown>,
    ) => handler(name, fn, settling);
    try {
      try {
        await lstat(join(root, 'review.json'));
        return fail('demo_review_exists');
      } catch (error) {
        if (!(
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'ENOENT'
        ))
          throw error;
      }
      const current = await safeRead(join(state.destination, 'src/add.ts'));
      if (
        !current.equals(Buffer.from(BEFORE)) &&
        !current.equals(Buffer.from(AFTER))
      )
        return fail('demo_changed');
      await validate(root, policy, state, store, current.toString('utf8'));
      const handlers = [
        step('red', async (signal) => {
          await validate(root, policy, state, store, BEFORE);
          authorize(root, policy, 'canRun');
          const result = await testFixture(root, state, 1, signal);
          await validate(root, policy, state, store, BEFORE);
          return result;
        }),
        step('patch', async (signal) => {
          await validate(root, policy, state, store, BEFORE);
          authorize(root, policy, 'canPatch', patch);
          await exclusive(
            join(root, 'evidence', 'patch-dispatch.json'),
            bytes(preview(state)),
          );
          await rewrite(
            join(state.destination, 'src/add.ts'),
            BEFORE,
            AFTER,
            () => {
              if (signal.aborted) return fail('demo_interrupted');
              authorize(root, policy, 'canPatch', patch);
            },
          );
          await validate(root, policy, state, store, AFTER);
          return preview(state);
        }),
        step('green', async (signal) => {
          await validate(root, policy, state, store, AFTER);
          authorize(root, policy, 'canRun');
          const result = await testFixture(root, state, 0, signal);
          await validate(root, policy, state, store, AFTER);
          return result;
        }),
        step('evidence', async () => {
          await validate(root, policy, state, store, AFTER);
          const diff = await git(root, state.destination, [
            'diff',
            '--no-ext-diff',
            '--no-textconv',
            '--no-renames',
            '--no-color',
            '--src-prefix=a/',
            '--dst-prefix=b/',
            '--',
            'src/add.ts',
          ]);
          if (
            diff.replace(/^index [a-f0-9]+\.\.[a-f0-9]+ 100644\n/m, '') !==
            EXPECTED_DIFF
          )
            return fail('demo_changed');
          await validate(root, policy, state, store, AFTER);
          return {
            schemaVersion: 1,
            kind: 'synthetic-bugfix-evidence',
            baseCommit: state.commit,
            intent: state.intent,
            envelope: state.envelope,
            patchSha256: patch,
            beforeSha256: hash(BEFORE),
            afterSha256: hash(AFTER),
            diff,
            redExit: 1,
            greenExit: 0,
            review: 'pending',
            integration: 'not_performed',
          } satisfies BugfixEvidence;
        }),
      ];
      const workflow = graph(
        ['red', 'patch', 'green', 'evidence'],
        [state.envelope, state.intent],
      );
      const report = await executeWorkflow(
        store,
        'synthetic-bugfix',
        workflow,
        handlers,
        {
          external: ['red', 'patch', 'green', 'evidence'],
          timeoutMs: 60000,
          ...(signal ? { signal } : {}),
        },
      );
      const evidence =
        (
          await store.getAttempt({
            runId: 'synthetic-bugfix',
            blockId: 'evidence',
            attemptId: '1',
          })
        )?.result?.evidence[0] ?? null;
      return {
        report,
        evidence,
        review: 'pending' as const,
        integration: 'not_performed' as const,
      };
    } finally {
      await Promise.allSettled(settling);
      await store.close();
    }
  });
}
export async function inspectBugfixDemo(root: string, policy: BugfixPolicy) {
  return boundary(async () => {
    const state = await load(root, policy),
      store = await storeAt(root);
    try {
      const attempt = await store.getAttempt({
        runId: 'synthetic-bugfix',
        blockId: 'evidence',
        attemptId: '1',
      });
      const evidence =
        attempt?.status === 'succeeded'
          ? (attempt.result?.evidence[0] ?? null)
          : null;
      const artifact: unknown = evidence
        ? JSON.parse(
            new TextDecoder('utf8', { fatal: true }).decode(
              await store.readArtifact(evidence),
            ),
          )
        : null;
      const checkpoint = await inspectWorktree(
        state.intent,
        workspace(root, state),
        store,
      );
      const historical = await readContextEnvelope(
        state.envelope,
        context(root, state),
        store,
      );
      if (
        historical.manifest.package.sha256 !== state.package.sha256 ||
        historical.context.manifest.source.commit !== state.commit
      )
        return fail('demo_changed');
      const history = await store.readEvents();
      let review: unknown = 'pending';
      try {
        await lstat(join(root, 'review.json'));
        const marker: unknown = JSON.parse(
          (await safeRead(join(root, 'review.json'))).toString('utf8'),
        );
        const decision = own(marker, 'decision');
        if (
          own(marker, 'schemaVersion') !== 1 ||
          (decision !== 'approve' && decision !== 'discard') ||
          own(marker, 'state') !== 'intent' ||
          !evidence ||
          JSON.stringify(parseArtifactReference(own(marker, 'evidence'))) !==
            JSON.stringify(evidence)
        )
          return fail('demo_invalid');
        const attempt = await store.getAttempt({
          runId: 'synthetic-review',
          blockId: 'review',
          attemptId: '1',
        });
        if (attempt?.status === 'succeeded') {
          const receipt = attempt.result?.evidence[0];
          if (!receipt) return fail('demo_changed');
          const confirmed: unknown = JSON.parse(
            new TextDecoder('utf8', { fatal: true }).decode(
              await store.readArtifact(receipt),
            ),
          );
          if (
            own(confirmed, 'schemaVersion') !== 1 ||
            own(confirmed, 'decision') !== decision ||
            own(confirmed, 'integration') !== 'not_performed' ||
            JSON.stringify(
              parseArtifactReference(own(confirmed, 'evidence')),
            ) !== JSON.stringify(evidence)
          )
            return fail('demo_changed');
        }
        review = {
          decision,
          source: 'explicit-caller-decision',
          status:
            attempt?.status === 'succeeded'
              ? 'confirmed'
              : attempt?.status === 'uncertain'
                ? 'uncertain'
                : 'pending',
          evidence,
        };
      } catch (error) {
        if (!(
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'ENOENT'
        ))
          throw error;
      }
      const attempts = await Promise.all(
        ['red', 'patch', 'green', 'evidence'].map(async (blockId) => ({
          blockId,
          status:
            (
              await store.getAttempt({
                runId: 'synthetic-bugfix',
                blockId,
                attemptId: '1',
              })
            )?.status ?? 'not_started',
        })),
      );
      authorize(root, policy);
      return {
        preview: preview(state),
        worktree: checkpoint,
        evidence,
        artifact,
        context: {
          package: state.package,
          envelope: state.envelope,
          map: historical.map,
          operatorInstructions: historical.operatorInstructions,
          sourceValidation: historical.context.sourceValidation,
        },
        review,
        events: history.length,
        attempts,
        integration: 'not_performed' as const,
      };
    } finally {
      await store.close();
    }
  });
}
/** A supplied human decision is recorded, never inferred from a successful run. No integration exists. */
export async function reviewBugfixDemo(
  root: string,
  decision: 'approve' | 'discard',
  evidenceSha256: string,
  policy: BugfixPolicy,
  signal?: AbortSignal,
) {
  return boundary(async () => {
    const state = await load(root, policy);
    if (decision !== 'approve' && decision !== 'discard')
      return fail('demo_invalid');
    authorize(root, policy, 'canReview');
    if (decision === 'discard') authorize(root, policy, 'canDiscard');
    if (signal?.aborted) return fail('demo_interrupted');
    const view = await inspectBugfixDemo(root, policy);
    if (!view.evidence || view.evidence.sha256 !== evidenceSha256)
      return fail('demo_denied');
    if (view.review !== 'pending') return fail('demo_review_exists');
    const store = await storeAt(root);
    const settling: Promise<unknown>[] = [];
    try {
      await validate(root, policy, state, store, AFTER);
      authorize(root, policy, 'canReview');
      if (decision === 'discard') authorize(root, policy, 'canDiscard');
      // Exclusive durable decision intent. A cut here remains pending, not a fabricated completed review.
      if (signal?.aborted) return fail('demo_interrupted');
      await exclusive(
        join(root, 'review.json'),
        bytes({
          schemaVersion: 1,
          decision,
          evidence: view.evidence,
          state: 'intent',
        }),
      );
      const report = await executeWorkflow(
        store,
        'synthetic-review',
        graph(['review'], [view.evidence]),
        [
          handler(
            'review',
            async (signal) => {
              await validate(root, policy, state, store, AFTER);
              authorize(root, policy, 'canReview');
              if (decision === 'discard') {
                authorize(root, policy, 'canDiscard');
                await rewrite(
                  join(state.destination, 'src/add.ts'),
                  AFTER,
                  BEFORE,
                  () => {
                    if (signal.aborted) return fail('demo_interrupted');
                    authorize(root, policy, 'canReview');
                    authorize(root, policy, 'canDiscard');
                  },
                );
                await validate(root, policy, state, store, BEFORE);
                await testFixture(root, state, 1, signal);
                if (
                  await git(root, state.destination, [
                    'diff',
                    '--no-ext-diff',
                    '--no-textconv',
                    '--no-color',
                    '--',
                  ])
                )
                  return fail('demo_changed');
              }
              return {
                schemaVersion: 1,
                decision,
                evidence: view.evidence,
                integration: 'not_performed',
              };
            },
            settling,
          ),
        ],
        {
          external: ['review'],
          timeoutMs: 60000,
          ...(signal ? { signal } : {}),
        },
      );
      return { report, decision, integration: 'not_performed' as const };
    } finally {
      await Promise.allSettled(settling);
      await store.close();
    }
  });
}
