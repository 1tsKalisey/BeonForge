import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  lstatSync,
  renameSync,
  symlinkSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { createHash } from 'node:crypto';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import {
  openSqlitePersistence,
  type DurableStore,
} from '@beonforge/persistence';
import {
  registerProject,
  inspectProject,
  prepareWorktree,
  createWorktree,
  inspectWorktree,
  type WorktreePolicy,
  type ProjectPolicy,
} from '@beonforge/workspace';

const temp = realpathSync(tmpdir());
const fixtures: { root: string; stores: DurableStore[] }[] = [];
function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
    },
  }).trim();
}
async function fixture(commit = true) {
  const root = mkdtempSync(join(temp, 'beonforge-project-'));
  const repo = join(root, 'repo');
  const storage = join(root, 'storage');
  mkdirSync(repo, { mode: 0o700 });
  mkdirSync(storage, { mode: 0o700 });
  const stores: DurableStore[] = [];
  fixtures.push({ root, stores });
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.name', 'Fixture');
  git(repo, 'config', 'user.email', 'fixture@example.invalid');
  writeFileSync(join(repo, 'tracked.txt'), 'tracked');
  if (commit) {
    git(repo, 'add', 'tracked.txt');
    git(repo, 'commit', '-qm', 'fixture');
  }
  const store = await openSqlitePersistence(join(storage, 'projects.sqlite'));
  stores.push(store);
  const policy: ProjectPolicy = {
    roots: [repo],
    gitDirectories: [],
    commonDirectories: [],
  };
  return { root, repo, storage, store, stores, policy };
}
afterEach(async () => {
  for (const f of fixtures.splice(0)) {
    for (const store of f.stores) await store.close();
    expect(dirname(realpathSync(f.root))).toBe(temp);
    rmSync(f.root, { recursive: true, force: true });
  }
});
function snapshot(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  function walk(path: string, prefix: string) {
    for (const name of readdirSync(path).sort()) {
      const full = join(path, name);
      const key = `${prefix}/${name}`;
      const stat = lstatSync(full);
      const stamp = `${stat.mode}:${stat.mtimeMs}:`;
      if (stat.isSymbolicLink()) result[key] = 'link';
      else if (stat.isDirectory()) {
        result[key] = `${stamp}directory`;
        walk(full, key);
      } else
        result[key] =
          stamp + createHash('sha256').update(readFileSync(full)).digest('hex');
    }
  }
  walk(root, '');
  return result;
}
it('registers, deduplicates, inspects tracked changes and leaves index/config/all files identical', async () => {
  const f = await fixture();
  git(f.repo, 'config', 'core.fsmonitor', 'definitely-not-a-command');
  writeFileSync(join(f.repo, 'tracked.txt'), 'changed');
  writeFileSync(join(f.repo, '.gitignore'), 'private/\n.claude/\nknowledge/\n');
  for (const name of ['private', '.claude', 'knowledge']) {
    mkdirSync(join(f.repo, name));
    writeFileSync(join(f.repo, name, 'secret'), 'fixture-private-content');
  }
  const before = snapshot(f.repo);
  const reference = await registerProject(f.repo, f.policy, f.store);
  expect(await registerProject(f.repo, f.policy, f.store)).toEqual(reference);
  expect(await inspectProject(reference, f.policy, f.store)).toMatchObject({
    kind: 'repository',
    detached: false,
    unborn: false,
    trackedChanges: 1,
    hasSubmodules: false,
  });
  expect(snapshot(f.repo)).toEqual(before);
  const descriptor = Buffer.from(
    await f.store.readArtifact(reference),
  ).toString();
  expect(descriptor).not.toContain('fixture-private-content');
  expect(descriptor).not.toContain('tracked.txt');
});
it.each([false, true])(
  'inspects unborn/detached checkout %s',
  async (committed) => {
    const f = await fixture(committed);
    if (committed) git(f.repo, 'checkout', '--detach', '-q');
    const before = snapshot(f.repo);
    const ref = await registerProject(f.repo, f.policy, f.store);
    expect(await inspectProject(ref, f.policy, f.store)).toMatchObject({
      unborn: !committed,
      detached: committed,
    });
    expect(snapshot(f.repo)).toEqual(before);
  },
);
it('requires separate worktree git/common permissions without granting another checkout', async () => {
  const f = await fixture();
  const checkout = join(f.root, 'checkout');
  git(f.repo, 'worktree', 'add', '--detach', '-q', checkout);
  const gitDir = git(checkout, 'rev-parse', '--absolute-git-dir');
  const common = git(
    checkout,
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir',
  );
  const restricted = { ...f.policy, roots: [checkout] };
  await expect(
    registerProject(checkout, restricted, f.store),
  ).rejects.toMatchObject({ code: 'permission_denied' });
  await expect(
    registerProject(
      checkout,
      { ...restricted, gitDirectories: [gitDir] },
      f.store,
    ),
  ).rejects.toMatchObject({ code: 'permission_denied' });
  const policy = {
    ...restricted,
    gitDirectories: [gitDir],
    commonDirectories: [common],
  };
  const before = snapshot(f.repo);
  const workBefore = snapshot(checkout);
  const ref = await registerProject(checkout, policy, f.store);
  expect(await inspectProject(ref, policy, f.store)).toMatchObject({
    kind: 'worktree',
    detached: true,
  });
  const mainRef = await registerProject(f.repo, f.policy, f.store);
  const main = await inspectProject(mainRef, f.policy, f.store);
  const work = await inspectProject(ref, policy, f.store);
  expect(main.repositoryId).toBe(work.repositoryId);
  expect(main.pathId).not.toBe(work.pathId);
  await expect(inspectProject(mainRef, policy, f.store)).rejects.toMatchObject({
    code: 'permission_denied',
  });
  expect(snapshot(f.repo)).toEqual(before);
  expect(snapshot(checkout)).toEqual(workBefore);
});
it.each(['root', 'metadata', 'config'])(
  'detects replacement of %s physical identity',
  async (kind) => {
    const f = await fixture();
    const ref = await registerProject(f.repo, f.policy, f.store);
    if (kind === 'config') {
      const config = join(f.repo, '.git', 'config');
      const data = readFileSync(config);
      renameSync(config, `${config}.old`);
      writeFileSync(config, data);
    } else if (kind === 'metadata') {
      const path = join(f.repo, '.git');
      renameSync(path, join(f.root, 'old-git'));
      git(f.repo, 'init', '-q');
    } else {
      renameSync(f.repo, join(f.root, 'old-root'));
      mkdirSync(f.repo);
      git(f.repo, 'init', '-q');
    }
    await expect(inspectProject(ref, f.policy, f.store)).rejects.toMatchObject({
      code: 'identity_changed',
    });
  },
);
it.each(['subdirectory', 'parent', 'traversal', 'alias', 'not-git', 'bare'])(
  'rejects invalid root %s',
  async (kind) => {
    const f = await fixture();
    const child = join(f.repo, 'child');
    mkdirSync(child);
    let target = child;
    if (kind === 'parent') target = f.root;
    if (kind === 'traversal') target = `${f.repo}/child/..`;
    if (kind === 'alias') {
      target = join(f.root, 'alias');
      symlinkSync(
        f.repo,
        target,
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    }
    if (kind === 'not-git') {
      target = join(f.root, 'empty');
      mkdirSync(target);
    }
    if (kind === 'bare') {
      target = join(f.root, 'bare');
      mkdirSync(target);
      git(target, 'init', '--bare', '-q');
    }
    await expect(
      registerProject(target, { ...f.policy, roots: [f.root] }, f.store),
    ).rejects.toBeInstanceOf(Error);
  },
);
it('clears malicious Git environment and never calls fsmonitor', async () => {
  const f = await fixture();
  const file = join(f.root, 'marker');
  git(
    f.repo,
    'config',
    'core.fsmonitor',
    `touch ${file.replaceAll('\\', '/')}`,
  );
  const ref = await registerProject(f.repo, f.policy, f.store);
  const previous = process.env.GIT_DIR;
  const old = process.env.GIT_CONFIG_COUNT;
  try {
    process.env.GIT_DIR = join(f.root, 'nonexistent');
    process.env.GIT_CONFIG_COUNT = 'bad';
    expect((await inspectProject(ref, f.policy, f.store)).unborn).toBe(false);
  } finally {
    if (previous === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = previous;
    if (old === undefined) delete process.env.GIT_CONFIG_COUNT;
    else process.env.GIT_CONFIG_COUNT = old;
  }
  expect(existsSync(file)).toBe(false);
});
it.each(['include', 'filter'])(
  'rejects config %s that could escape inspection scope',
  async (section) => {
    const f = await fixture();
    const config = join(f.repo, '.git', 'config');
    writeFileSync(
      config,
      readFileSync(config, 'utf8') +
        `\n[${section} "fixture"]\n path = outside\n`,
    );
    await expect(
      registerProject(f.repo, f.policy, f.store),
    ).rejects.toMatchObject({ code: 'unsafe_path' });
  },
);
it('rejects legacy filter sections before executing Git', async () => {
  const f = await fixture();
  const config = join(f.repo, '.git', 'config');
  writeFileSync(
    config,
    readFileSync(config, 'utf8') + '\n[filter.fixture]\n clean = unsafe\n',
  );
  const before = snapshot(f.repo);
  await expect(
    registerProject(f.repo, f.policy, f.store),
  ).rejects.toMatchObject({ code: 'unsafe_path' });
  expect(snapshot(f.repo)).toEqual(before);
});

async function configFixture(location: 'config' | 'config.worktree') {
  const f = await fixture();
  writeFileSync(join(f.repo, '.gitattributes'), 'tracked.txt filter=x\n');
  git(f.repo, 'add', '.gitattributes');
  git(f.repo, 'commit', '-qm', 'fixture attributes');
  let repo = f.repo;
  let config = join(repo, '.git', 'config');
  let policy = f.policy;
  if (location === 'config.worktree') {
    git(repo, 'config', 'extensions.worktreeConfig', 'true');
    repo = join(f.root, 'checkout');
    git(f.repo, 'worktree', 'add', '--detach', '-q', repo);
    const gitDir = git(repo, 'rev-parse', '--absolute-git-dir');
    config = join(gitDir, 'config.worktree');
    writeFileSync(config, '[core]\n logAllRefUpdates = true\n');
    policy = {
      roots: [repo],
      gitDirectories: [gitDir],
      commonDirectories: [join(f.repo, '.git')],
    };
  }
  const marker = join(f.root, 'filter-marker');
  const script = join(f.root, 'filter.mjs');
  writeFileSync(
    script,
    "import { writeFileSync } from 'node:fs'; writeFileSync(new URL('./filter-marker', import.meta.url), 'ran'); process.stdin.pipe(process.stdout);\n",
  );
  const command = `"${process.execPath.replaceAll('\\', '/')}" "${script.replaceAll('\\', '/')}"`;
  const filter = `\n clean = ${JSON.stringify(command)}\n required = true\n`;
  const included = join(f.root, 'included.config');
  writeFileSync(included, `[filter "x"]${filter}`);
  // Dirty tracked content forces Git to check the clean filter if validation is bypassed.
  // Keep its size: Git otherwise detects the size change without running conversion.
  writeFileSync(join(repo, 'tracked.txt'), 'changed');
  return {
    ...f,
    repo,
    config,
    policy,
    marker,
    filter,
    included,
    original: readFileSync(config, 'utf8'),
  };
}
const forbiddenConfigs = [
  { label: 'filter', header: '[filter "x"]', include: false },
  { label: 'adjacent-filter', header: '[core][filter "x"]', include: false },
  { label: 'adjacent-include', header: '[core][include]', include: true },
  { label: 'includeIf', header: '[includeIf "gitdir:**"]', include: true },
  {
    label: 'mixed-adjacent-includeIf',
    header: '[core][InClUdEiF "gitdir:**"]',
    include: true,
  },
  {
    label: 'mixed-adjacent-filter',
    header: '[core][FiLtEr "x"]',
    include: false,
  },
] as const;
it('R039 parser has a private discovery boundary (delegates real Git)', async () => {
  const f = await fixture();
  const original = childProcess.spawn;
  const boundaries: boolean[] = [];
  childProcess.spawn = ((...args: Parameters<typeof original>) => {
    const argv = args[1];
    const options = args[2];
    if (Array.isArray(argv) && argv.includes('--file'))
      boundaries.push(
        !argv.includes('-C') &&
          typeof options?.cwd === 'string' &&
          options.env?.GIT_CEILING_DIRECTORIES === options.cwd &&
          options.cwd !== f.repo,
      );
    return original(...args);
  }) as typeof original;
  syncBuiltinESMExports();
  try {
    await registerProject(f.repo, f.policy, f.store);
    expect(boundaries.length).toBeGreaterThan(0);
    expect(boundaries.every(Boolean)).toBe(true);
  } finally {
    childProcess.spawn = original;
    syncBuiltinESMExports();
  }
});
it.each(['config', 'config.worktree'] as const)(
  'R039 does not discover includes while parsing %s',
  async (location) => {
    const f = await configFixture(location);
    writeFileSync(f.included, '[broken\n');
    writeFileSync(
      f.config,
      f.original +
        `\n[core][include]\n path = ${JSON.stringify(f.included.replaceAll('\\', '/'))}\n`,
    );
    const before = snapshot(f.repo);
    await expect(
      registerProject(f.repo, f.policy, f.store),
    ).rejects.toMatchObject({ code: 'unsafe_path' });
    expect(snapshot(f.repo)).toEqual(before);
    expect(existsSync(f.marker)).toBe(false);
  },
);
it('R039 ceiling excludes hostile repository ancestors of the private parser directory', async () => {
  const hostile = await fixture();
  const clean = await fixture();
  const included = join(hostile.root, 'malformed.config');
  writeFileSync(included, '[broken\n');
  writeFileSync(
    join(hostile.repo, '.git', 'config'),
    readFileSync(join(hostile.repo, '.git', 'config'), 'utf8') +
      `\n[include]\n path = ${JSON.stringify(included.replaceAll('\\', '/'))}\n`,
  );
  const key = process.platform === 'win32' ? 'TEMP' : 'TMPDIR';
  const previous = process.env[key];
  try {
    process.env[key] = hostile.repo;
    const before = snapshot(hostile.repo);
    const ref = await registerProject(clean.repo, clean.policy, clean.store);
    expect((await inspectProject(ref, clean.policy, clean.store)).unborn).toBe(
      false,
    );
    expect(snapshot(hostile.repo)).toEqual(before);
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});
const configCases = (['config', 'config.worktree'] as const).flatMap(
  (location) =>
    (['register', 'inspect'] as const).flatMap((operation) =>
      forbiddenConfigs.map((config) => ({ location, operation, ...config })),
    ),
);
it.each(configCases)(
  'P1 rejects $label in $location during $operation without executing filters',
  async ({ location, operation, header, include }) => {
    const f = await configFixture(location);
    const ref =
      operation === 'inspect'
        ? await registerProject(f.repo, f.policy, f.store)
        : undefined;
    const inode = lstatSync(f.config, { bigint: true }).ino;
    writeFileSync(
      f.config,
      f.original +
        '\n' +
        header +
        (include
          ? `\n path = ${JSON.stringify(f.included.replaceAll('\\', '/'))}\n`
          : f.filter),
    );
    expect(lstatSync(f.config, { bigint: true }).ino).toBe(inode);
    const before = snapshot(f.repo);
    const mainBefore = snapshot(join(f.root, 'repo'));
    const includedBefore = readFileSync(f.included);
    const result: unknown = await (
      ref
        ? inspectProject(ref, f.policy, f.store)
        : registerProject(f.repo, f.policy, f.store)
    ).then(
      () => null,
      (error: unknown) => error,
    );
    expect(existsSync(f.marker), 'external filter must never execute').toBe(
      false,
    );
    expect(result).toMatchObject({ code: 'unsafe_path' });
    expect(snapshot(f.repo)).toEqual(before);
    expect(snapshot(join(f.root, 'repo'))).toEqual(mainBefore);
    expect(readFileSync(f.included)).toEqual(includedBefore);
  },
);
it('P1 fixture proves the harmless clean filter would execute on an unguarded Git status', async () => {
  const f = await configFixture('config');
  writeFileSync(f.config, f.original + '\n[core][filter "x"]' + f.filter);
  git(
    f.repo,
    '--no-optional-locks',
    '-c',
    'core.fsmonitor=false',
    'status',
    '--porcelain=v1',
    '--untracked-files=no',
    '--ignore-submodules=all',
  );
  expect(readFileSync(f.marker, 'utf8')).toBe('ran');
});
it.each(['config', 'config.worktree'] as const)(
  'P1 accepts valid adjacent sections in %s',
  async (location) => {
    const f = await configFixture(location);
    writeFileSync(
      f.config,
      f.original + '\n[core][BeOnFoRgE "a.b"]\n harmless = true\n',
    );
    const before = snapshot(f.repo);
    const ref = await registerProject(f.repo, f.policy, f.store);
    expect((await inspectProject(ref, f.policy, f.store)).trackedChanges).toBe(
      1,
    );
    expect(existsSync(f.marker)).toBe(false);
    expect(snapshot(f.repo)).toEqual(before);
  },
);
it.each(
  (['config', 'config.worktree'] as const).flatMap((location) =>
    (['register', 'inspect'] as const).map((operation) => ({
      location,
      operation,
    })),
  ),
)(
  'P1 rejects malformed $location during $operation',
  async ({ location, operation }) => {
    const f = await configFixture(location);
    const ref =
      operation === 'inspect'
        ? await registerProject(f.repo, f.policy, f.store)
        : undefined;
    writeFileSync(f.config, f.original + '\n[broken\n');
    const before = snapshot(f.repo);
    await expect(
      ref
        ? inspectProject(ref, f.policy, f.store)
        : registerProject(f.repo, f.policy, f.store),
    ).rejects.toMatchObject({ code: 'git_failure' });
    expect(existsSync(f.marker)).toBe(false);
    expect(snapshot(f.repo)).toEqual(before);
  },
);
it.each(['config', 'config.worktree'] as const)(
  'P1 preserves continuation rejection in %s',
  async (location) => {
    const f = await configFixture(location);
    writeFileSync(
      f.config,
      f.original + '\n[fixture]\n value = first\\\n second\n',
    );
    await expect(
      registerProject(f.repo, f.policy, f.store),
    ).rejects.toMatchObject({ code: 'unsafe_path' });
    expect(existsSync(f.marker)).toBe(false);
  },
);
it('P1 rejects expanded config key output beyond the existing Git output limit', async () => {
  const f = await configFixture('config');
  writeFileSync(
    f.config,
    f.original + `\n[${'a'.repeat(200)}]\n` + ' key\n'.repeat(6000),
  );
  expect(lstatSync(f.config).size).toBeLessThan(262144);
  const before = snapshot(f.repo);
  await expect(
    registerProject(f.repo, f.policy, f.store),
  ).rejects.toMatchObject({ code: 'git_limit' });
  expect(snapshot(f.repo)).toEqual(before);
  expect(existsSync(f.marker)).toBe(false);
});
it('rejects metadata junctions without following their contents', async () => {
  const f = await fixture();
  const refs = join(f.repo, '.git', 'refs');
  const outside = join(f.root, 'outside-refs');
  renameSync(refs, outside);
  symlinkSync(outside, refs, process.platform === 'win32' ? 'junction' : 'dir');
  const before = snapshot(f.repo);
  await expect(
    registerProject(f.repo, f.policy, f.store),
  ).rejects.toMatchObject({ code: 'unsafe_path' });
  expect(snapshot(f.repo)).toEqual(before);
});
it('rejects a sibling sharing a textual path prefix with an authorized root', async () => {
  const f = await fixture();
  const other = join(f.root, 'repo-other');
  mkdirSync(other);
  git(other, 'init', '-q');
  await expect(registerProject(other, f.policy, f.store)).rejects.toMatchObject(
    { code: 'permission_denied' },
  );
});
it('rejects unsupported descriptor versions and substituted worktree common directories', async () => {
  const f = await fixture();
  const ref = await registerProject(f.repo, f.policy, f.store);
  const descriptor = JSON.parse(
    Buffer.from(await f.store.readArtifact(ref)).toString(),
  ) as Record<string, unknown>;
  const invalid = await f.store.putArtifact(
    Buffer.from(JSON.stringify({ ...descriptor, schemaVersion: 2 })),
  );
  await expect(
    inspectProject(invalid, f.policy, f.store),
  ).rejects.toMatchObject({ code: 'identity_changed' });
  const checkout = join(f.root, 'checkout');
  git(f.repo, 'worktree', 'add', '--detach', '-q', checkout);
  const gitDir = git(checkout, 'rev-parse', '--absolute-git-dir');
  const common = join(f.repo, '.git');
  const policy = {
    roots: [checkout],
    gitDirectories: [gitDir],
    commonDirectories: [common],
  };
  const workRef = await registerProject(checkout, policy, f.store);
  const pointer = join(gitDir, 'commondir');
  const data = readFileSync(pointer);
  renameSync(pointer, `${pointer}.old`);
  writeFileSync(pointer, data);
  await expect(inspectProject(workRef, policy, f.store)).rejects.toMatchObject({
    code: 'identity_changed',
  });
});
it('CLI inspect rejects missing storage database without creating files', async () => {
  const f = await fixture();
  const storage = join(f.root, 'empty-storage');
  mkdirSync(storage, { mode: 0o700 });
  const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
  const result = spawnSync(
    process.execPath,
    [
      cli,
      'project',
      'inspect',
      '--storage',
      storage,
      '--allow-root',
      f.repo,
      '--ref',
      'a'.repeat(64),
      '--bytes',
      '1',
    ],
    { encoding: 'utf8' },
  );
  expect(result.status).toBe(1);
  expect(readdirSync(storage)).toEqual([]);
});
it('detects submodule gitlinks without reading an unavailable checkout', async () => {
  const f = await fixture();
  const oid = git(f.repo, 'rev-parse', 'HEAD');
  git(f.repo, 'update-index', '--add', '--cacheinfo', `160000,${oid},module`);
  const before = snapshot(f.repo);
  const ref = await registerProject(f.repo, f.policy, f.store);
  expect((await inspectProject(ref, f.policy, f.store)).hasSubmodules).toBe(
    true,
  );
  expect(snapshot(f.repo)).toEqual(before);
});
it('CLI persists reference across processes and protects private storage boundaries', async () => {
  const f = await fixture();
  await f.store.close();
  const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [cli, 'project', ...args], {
      encoding: 'utf8',
    });
  const before = snapshot(f.repo);
  const registration = run(
    'register',
    '--root',
    f.repo,
    '--storage',
    f.storage,
  );
  expect(registration.status, registration.stderr).toBe(0);
  const ref = JSON.parse(registration.stdout) as {
    sha256: string;
    byteLength: number;
  };
  const result = run(
    'inspect',
    '--ref',
    ref.sha256,
    '--bytes',
    String(ref.byteLength),
    '--allow-root',
    f.repo,
    '--storage',
    f.storage,
  );
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout) as unknown).toMatchObject({
    kind: 'repository',
    trackedChanges: 0,
  });
  expect(
    run(
      'inspect',
      '--ref',
      ref.sha256,
      '--bytes',
      String(ref.byteLength),
      '--allow-root',
      f.repo,
      '--storage',
      f.repo,
    ).status,
  ).toBe(1);
  expect(snapshot(f.repo)).toEqual(before);
});

async function workFixture() {
  const f = await fixture();
  const execution = join(f.root, 'execution');
  mkdirSync(execution, { mode: 0o700 });
  const policy: WorktreePolicy = {
    ...f.policy,
    storageRoot: f.storage,
    executionRoots: [execution],
    metadataWriteRoots: [join(f.repo, '.git')],
  };
  const project = await registerProject(f.repo, policy, f.store);
  const commit = git(f.repo, 'rev-parse', 'HEAD');
  return { ...f, execution, policy, project, commit };
}
it('B0302 creates exact detached bytes, preserves original, confirms after reopen and refuses repeats', async () => {
  const f = await workFixture();
  writeFileSync(join(f.repo, 'tracked.txt'), 'dirty source');
  const before = snapshot(f.repo);
  const intent = await prepareWorktree(
    f.project,
    f.commit,
    f.execution,
    f.policy,
    f.store,
  );
  expect((await inspectWorktree(intent, f.policy, f.store)).state).toBe(
    'prepared',
  );
  const report = await createWorktree(intent, f.policy, f.store);
  expect(report.state).toBe('confirmed');
  expect(readFileSync(join(report.destination, 'tracked.txt'), 'utf8')).toBe(
    'tracked',
  );
  expect(git(report.destination, 'rev-parse', 'HEAD')).toBe(f.commit);
  expect(git(report.destination, 'rev-parse', '--git-path', 'index')).not.toBe(
    join(f.repo, '.git', 'index'),
  );
  const after = snapshot(f.repo);
  for (const [path, value] of Object.entries(before))
    if (!['/.git', '/.git/logs'].includes(path))
      expect(after[path], path).toBe(value);
  const added = Object.keys(after).filter((path) => !(path in before));
  expect(added.every((path) => path.startsWith('/.git/worktrees'))).toBe(true);
  await f.store.close();
  const reopened = await openSqlitePersistence(
    join(f.storage, 'projects.sqlite'),
  );
  f.stores.push(reopened);
  expect(await inspectWorktree(intent, f.policy, reopened)).toEqual(report);
  await expect(
    createWorktree(intent, f.policy, reopened),
  ).rejects.toBeInstanceOf(Error);
}, 15000);
it.each([
  'permission',
  'overlap',
  'junction',
  'invalid-commit',
  'occupied',
  'identity',
  'filter',
  'include',
  'symlink',
  'gitlink',
  'attributes',
])('B0302 rejects %s without overwriting', async (kind) => {
  const f = await workFixture();
  let policy = f.policy,
    root = f.execution,
    commit = f.commit;
  if (kind === 'permission') policy = { ...policy, metadataWriteRoots: [] };
  if (kind === 'overlap') {
    root = f.repo;
    policy = { ...policy, executionRoots: [root] };
  }
  if (kind === 'junction') {
    root = join(f.root, 'alias');
    symlinkSync(
      f.execution,
      root,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
  }
  if (kind === 'invalid-commit') commit = 'f'.repeat(40);
  if (kind === 'filter' || kind === 'include')
    writeFileSync(
      join(f.repo, '.git', 'config'),
      readFileSync(join(f.repo, '.git', 'config'), 'utf8') +
        `\n[core][${kind}${kind === 'filter' ? ' "x"' : ''}]\n ${kind === 'filter' ? 'clean' : 'path'} = unavailable\n`,
    );
  if (['symlink', 'gitlink', 'attributes'].includes(kind)) {
    if (kind === 'attributes') {
      writeFileSync(join(f.repo, '.gitattributes'), '* text\n');
      git(f.repo, 'add', '.gitattributes');
    } else
      git(
        f.repo,
        'update-index',
        '--add',
        '--cacheinfo',
        `${kind === 'symlink' ? '120000' : '160000'},${kind === 'symlink' ? git(f.repo, 'rev-parse', 'HEAD:tracked.txt') : f.commit},link`,
      );
    git(f.repo, 'commit', '-qm', 'unsafe tree');
    commit = git(f.repo, 'rev-parse', 'HEAD');
  }
  if (kind === 'occupied' || kind === 'identity') {
    const ref = await prepareWorktree(f.project, commit, root, policy, f.store);
    const report = await inspectWorktree(ref, policy, f.store);
    if (kind === 'occupied') {
      mkdirSync(report.destination);
      writeFileSync(join(report.destination, 'sentinel'), 'keep');
    } else {
      renameSync(f.execution, `${f.execution}-old`);
      mkdirSync(f.execution);
    }
    await expect(createWorktree(ref, policy, f.store)).rejects.toBeInstanceOf(
      Error,
    );
    if (kind === 'occupied')
      expect(readFileSync(join(report.destination, 'sentinel'), 'utf8')).toBe(
        'keep',
      );
  } else
    await expect(
      prepareWorktree(f.project, commit, root, policy, f.store),
    ).rejects.toBeInstanceOf(Error);
});
it('B0302 blocks post-checkout hooks and simultaneous dispatch', async () => {
  const f = await workFixture();
  const hooks = join(f.root, 'hooks');
  mkdirSync(hooks);
  const marker = join(f.root, 'hook-marker');
  writeFileSync(
    join(hooks, 'post-checkout'),
    `#!/bin/sh\necho ran > '${marker.replaceAll('\\', '/')}'\n`,
    { mode: 0o700 },
  );
  git(f.repo, 'config', 'core.hooksPath', hooks);
  const project = await registerProject(f.repo, f.policy, f.store);
  const ref = await prepareWorktree(
    project,
    f.commit,
    f.execution,
    f.policy,
    f.store,
  );
  const results = await Promise.allSettled([
    createWorktree(ref, f.policy, f.store),
    createWorktree(ref, f.policy, f.store),
  ]);
  expect(
    results.filter(
      (r) => r.status === 'fulfilled' && r.value.state === 'confirmed',
    ),
  ).toHaveLength(1);
  expect(existsSync(marker)).toBe(false);
}, 15000);
it('B0302 accepts a linked source only with separate common write permission', async () => {
  const f = await workFixture();
  const checkout = join(f.root, 'linked');
  git(f.repo, 'worktree', 'add', '--detach', '-q', checkout);
  const gitdir = git(checkout, 'rev-parse', '--absolute-git-dir');
  const policy = {
    ...f.policy,
    roots: [checkout],
    gitDirectories: [gitdir],
    commonDirectories: [join(f.repo, '.git')],
  };
  const project = await registerProject(checkout, policy, f.store);
  await expect(
    prepareWorktree(
      project,
      f.commit,
      f.execution,
      { ...policy, metadataWriteRoots: [gitdir] },
      f.store,
    ),
  ).rejects.toBeInstanceOf(Error);
  const intent = await prepareWorktree(
    project,
    f.commit,
    f.execution,
    policy,
    f.store,
  );
  expect((await createWorktree(intent, policy, f.store)).state).toBe(
    'confirmed',
  );
}, 15000);
it('B0302 CLI creates then inspects evidence in another process', async () => {
  const f = await workFixture();
  await f.store.close();
  const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
  const flags = [
    '--storage',
    f.storage,
    '--allow-root',
    f.repo,
    '--write-root',
    join(f.repo, '.git'),
    '--execution-root',
    f.execution,
  ];
  const result = spawnSync(
    process.execPath,
    [
      cli,
      'project',
      'worktree',
      'create',
      ...flags,
      '--ref',
      f.project.sha256,
      '--bytes',
      String(f.project.byteLength),
      '--commit',
      f.commit,
    ],
    { encoding: 'utf8' },
  );
  expect(result.status, result.stderr).toBe(0);
  const lines = result.stdout.trim().split('\n');
  const prepared = JSON.parse(lines[0]!) as {
    intent: { sha256: string; byteLength: number };
  };
  expect(JSON.parse(lines[1]!) as unknown).toMatchObject({
    state: 'confirmed',
  });
  const inspection = spawnSync(
    process.execPath,
    [
      cli,
      'project',
      'worktree',
      'inspect',
      ...flags,
      '--ref',
      prepared.intent.sha256,
      '--bytes',
      String(prepared.intent.byteLength),
    ],
    { encoding: 'utf8' },
  );
  expect(inspection.status, inspection.stderr).toBe(0);
  expect(JSON.parse(inspection.stdout) as unknown).toMatchObject({
    state: 'confirmed',
  });
}, 15000);
it.each(['before', 'during', 'confirmation', 'after'])(
  'B0302 SIGKILL %s creation recovers in a new process without repeating effects',
  async (stage) => {
    const f = await workFixture();
    const ref = await prepareWorktree(
      f.project,
      f.commit,
      f.execution,
      f.policy,
      f.store,
    );
    await f.store.close();
    const runner = join(f.root, 'kill.mjs');
    const workspaceUrl = new URL('../dist/index.js', import.meta.url).href;
    const persistenceUrl = new URL(
      '../../persistence/dist/index.js',
      import.meta.url,
    ).href;
    writeFileSync(
      runner,
      `import cp from 'node:child_process'; import { syncBuiltinESMExports } from 'node:module';
import { createWorktree, inspectWorktree } from ${JSON.stringify(workspaceUrl)};
import { openSqlitePersistence } from ${JSON.stringify(persistenceUrl)};
const policy = ${JSON.stringify(f.policy)}, ref = ${JSON.stringify(ref)};
const store = await openSqlitePersistence(${JSON.stringify(join(f.storage, 'projects.sqlite'))});
const pause = () => { process.stdout.write('BARRIER\\n'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); };
if (process.argv[2] === 'recover') { console.log(JSON.stringify(await inspectWorktree(ref, policy, store))); await store.close(); }
else { const original = cp.spawn; cp.spawn = (...args) => { if (${JSON.stringify(stage)} === 'during' && args[1].includes('read-tree')) pause(); return original(...args); }; syncBuiltinESMExports();
if (${JSON.stringify(stage)} === 'confirmation') { const put = store.putArtifact.bind(store); store.putArtifact = async data => { const result = await put(data); try { if (JSON.parse(Buffer.from(data).toString()).kind === 'worktree-receipt') pause(); } catch {} return result; }; }
if (${JSON.stringify(stage)} === 'before') pause(); await createWorktree(ref, policy, store); pause(); }
`,
    );
    const child = spawn(process.execPath, [runner], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('barrier timeout'));
      }, 15000);
      child.stdout.on('data', (chunk: Buffer) => {
        if (chunk.toString().includes('BARRIER')) child.kill('SIGKILL');
      });
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      child.once('error', reject);
    });
    const recovered = spawnSync(process.execPath, [runner, 'recover'], {
      encoding: 'utf8',
    });
    expect(recovered.status, recovered.stderr).toBe(0);
    const report = JSON.parse(recovered.stdout) as { state: string };
    expect(report.state).toBe(
      stage === 'before'
        ? 'prepared'
        : stage === 'after'
          ? 'confirmed'
          : 'uncertain',
    );
    const list = git(f.repo, 'worktree', 'list', '--porcelain');
    expect(list.split('worktree ').length - 1).toBe(stage === 'before' ? 1 : 2);
  },
  20000,
);
it('B0302 materializes binary/nested blobs and rejects later extra files', async () => {
  const f = await workFixture();
  mkdirSync(join(f.repo, 'dir'));
  const binary = Buffer.from([0, 255, 128, 13, 10]);
  writeFileSync(join(f.repo, 'dir', 'binary'), binary);
  git(f.repo, 'add', 'dir/binary');
  git(f.repo, 'commit', '-qm', 'binary fixture');
  const commit = git(f.repo, 'rev-parse', 'HEAD');
  const ref = await prepareWorktree(
    f.project,
    commit,
    f.execution,
    f.policy,
    f.store,
  );
  const result = await createWorktree(ref, f.policy, f.store);
  expect(result.state).toBe('confirmed');
  expect(readFileSync(join(result.destination, 'dir', 'binary'))).toEqual(
    binary,
  );
  writeFileSync(join(result.destination, 'unexpected'), 'keep');
  expect((await inspectWorktree(ref, f.policy, f.store)).state).toBe(
    'confirmed',
  );
  expect(readFileSync(join(result.destination, 'unexpected'), 'utf8')).toBe(
    'keep',
  );
}, 15000);
it.each(['edit', 'missing', 'invalid', 'cut', 'head', 'gone'] as const)(
  'P31 durable confirmation %s',
  async (kind) => {
    const f = await workFixture();
    const ref = await prepareWorktree(
      f.project,
      f.commit,
      f.execution,
      f.policy,
      f.store,
    );
    const result = await createWorktree(ref, f.policy, f.store);
    const marker = join(dirname(result.destination), 'confirmed.json');
    expect(existsSync(marker)).toBe(true);
    if (kind === 'edit')
      writeFileSync(join(result.destination, 'tracked.txt'), 'edited');
    if (kind === 'missing') rmSync(marker);
    if (kind === 'gone')
      renameSync(result.destination, result.destination + '-moved');
    if (kind === 'head')
      writeFileSync(
        git(result.destination, 'rev-parse', '--git-path', 'HEAD'),
        '0'.repeat(40) + '\n',
      );
    if (kind === 'invalid' || kind === 'cut')
      writeFileSync(marker, kind === 'cut' ? '' : '{}');
    await f.store.close();
    const store = await openSqlitePersistence(
      join(f.storage, 'projects.sqlite'),
    );
    f.stores.push(store);
    const report = await inspectWorktree(ref, f.policy, store);
    expect(report.state).toBe(
      ['edit', 'head', 'gone'].includes(kind) ? 'confirmed' : 'uncertain',
    );
    if (kind === 'head' || kind === 'gone')
      expect(['drift', 'invalid']).toContain(report.current);
    if (kind === 'edit') {
      expect(report.receipt).toEqual(result.receipt);
      expect(report).toMatchObject({ current: 'modified' });
    }
  },
  15000,
);
it.each([
  'working-tree-encoding=UTF-16',
  'filter=x',
  'text',
  'eol=crlf',
  'ident',
])('P32 rejects info attributes %s before reservation', async (attribute) => {
  const f = await workFixture();
  writeFileSync(
    join(f.repo, '.git', 'info', 'attributes'),
    `tracked.txt ${attribute}\n`,
  );
  await expect(
    prepareWorktree(f.project, f.commit, f.execution, f.policy, f.store),
  ).rejects.toBeInstanceOf(Error);
  expect(readdirSync(f.execution)).toEqual([]);
  expect(
    git(f.repo, 'worktree', 'list', '--porcelain').split('worktree ').length -
      1,
  ).toBe(1);
});
it('P33 checks 500 long names through bounded stdin and rejects hostile attributes', async () => {
  const f = await workFixture();
  for (let i = 0; i < 500; i++)
    writeFileSync(
      join(f.repo, `file-${String(i).padStart(3, '0')}-${'x'.repeat(95)}`),
      'data',
    );
  git(f.repo, 'add', '.');
  git(f.repo, 'commit', '-qm', '500 long names');
  const oid = git(f.repo, 'rev-parse', 'HEAD');
  const ref = await prepareWorktree(
    f.project,
    oid,
    f.execution,
    f.policy,
    f.store,
  );
  expect((await inspectWorktree(ref, f.policy, f.store)).state).toBe(
    'prepared',
  );
  const before = readdirSync(f.execution);
  writeFileSync(
    join(f.repo, '.git', 'info', 'attributes'),
    '* filter=hostile\n',
  );
  await expect(
    prepareWorktree(f.project, oid, f.execution, f.policy, f.store),
  ).rejects.toMatchObject({ code: 'unsafe_path' });
  expect(readdirSync(f.execution)).toEqual(before);
}, 180000);
it.each(['throw', 'error', 'stdin', 'timeout'] as const)(
  'P33 sanitizes Git process failure %s',
  async (kind) => {
    const f = await workFixture();
    const original = childProcess.spawn;
    childProcess.spawn = ((...args: Parameters<typeof original>) => {
      if (!Array.isArray(args[1]) || !args[1].includes('check-attr'))
        return original(...args);
      if (kind === 'throw')
        throw Object.assign(new Error('private-sensitive-path'), {
          spawnargs: args[1],
        });
      if (kind === 'error')
        return original('beonforge-nonexistent-executable', [], args[2]);
      if (kind === 'timeout')
        return original(
          process.execPath,
          ['-e', 'process.stdin.resume();setInterval(()=>{},1000)'],
          args[2],
        );
      const child = original(...args);
      setImmediate(() =>
        child.stdin?.emit('error', new Error('private-sensitive-path')),
      );
      return child;
    }) as typeof original;
    syncBuiltinESMExports();
    try {
      const error: unknown = await prepareWorktree(
        f.project,
        f.commit,
        f.execution,
        f.policy,
        f.store,
      ).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toMatchObject({
        code: kind === 'timeout' ? 'git_limit' : 'git_failure',
      });
      expect(String(error)).not.toContain('private-sensitive-path');
      expect(error).not.toHaveProperty('spawnargs');
      expect(readdirSync(f.execution)).toEqual([]);
    } finally {
      childProcess.spawn = original;
      syncBuiltinESMExports();
    }
  },
  15000,
);
it('B0303 representative TypeScript project materializes regular gitignores and keeps private extras out of validation', async () => {
  const f = await workFixture();
  git(f.repo, 'config', 'core.autocrlf', 'false');
  mkdirSync(join(f.repo, 'src'));
  writeFileSync(
    join(f.repo, '.gitignore'),
    '.env\nnode_modules/\ndist/\n.private/\n',
  );
  writeFileSync(join(f.repo, 'src', '.gitignore'), '*.log\n');
  writeFileSync(
    join(f.repo, 'package.json'),
    '{"name":"sample-local-app","private":true,"type":"module"}\n',
  );
  writeFileSync(
    join(f.repo, 'tsconfig.json'),
    '{"compilerOptions":{"strict":true},"include":["src"]}\n',
  );
  writeFileSync(
    join(f.repo, 'src', 'app.ts'),
    'export const greeting: string = "hello";\n',
  );
  writeFileSync(join(f.repo, 'README.md'), '# Sample local project\n');
  git(f.repo, 'add', '.');
  git(f.repo, 'commit', '-qm', 'representative project');
  const project = await registerProject(f.repo, f.policy, f.store);
  const oid = git(f.repo, 'rev-parse', 'HEAD');
  const originalSnapshot = snapshot(f.repo);
  const ref = await prepareWorktree(
    project,
    oid,
    f.execution,
    f.policy,
    f.store,
  );
  const created = await createWorktree(ref, f.policy, f.store);
  expect(created).toMatchObject({ state: 'confirmed', current: 'clean' });
  expect(readFileSync(join(created.destination, '.gitignore'), 'utf8')).toBe(
    git(f.repo, 'show', 'HEAD:.gitignore') + '\n',
  );
  expect(git(created.destination, 'rev-parse', 'HEAD')).toBe(oid);
  expect(lstatSync(join(created.destination, '.gitignore')).isFile()).toBe(
    true,
  );
  expect(git(created.destination, 'hash-object', '.gitignore')).toBe(
    git(f.repo, 'rev-parse', 'HEAD:.gitignore'),
  );
  expect(git(created.destination, 'check-ignore', '.env')).toBe('.env');
  for (const name of ['.private', 'node_modules', 'dist'])
    mkdirSync(join(created.destination, name));
  writeFileSync(join(created.destination, '.env'), 'fixture-private-value');
  writeFileSync(
    join(created.destination, 'node_modules', 'private'),
    'fixture-private-value',
  );
  writeFileSync(join(created.destination, 'untracked.txt'), 'untracked');
  expect(await inspectWorktree(ref, f.policy, f.store)).toMatchObject({
    state: 'confirmed',
    current: 'clean',
    receipt: created.receipt,
  });
  writeFileSync(
    join(created.destination, 'src', 'app.ts'),
    'export const greeting = "changed";\n',
  );
  await f.store.close();
  const store = await openSqlitePersistence(join(f.storage, 'projects.sqlite'));
  f.stores.push(store);
  expect(await inspectWorktree(ref, f.policy, store)).toMatchObject({
    state: 'confirmed',
    current: 'modified',
    receipt: created.receipt,
  });
  await expect(createWorktree(ref, f.policy, store)).rejects.toBeInstanceOf(
    Error,
  );
  const sourceAfter = snapshot(f.repo);
  for (const [path, value] of Object.entries(originalSnapshot))
    if (!['/.git', '/.git/logs'].includes(path))
      expect(sourceAfter[path], path).toBe(value);
}, 30000);
it('B0304 fixes attribute origin and exposes tracked-only validation scope', async () => {
  const f = await workFixture();
  const ref = await prepareWorktree(
    f.project,
    f.commit,
    f.execution,
    f.policy,
    f.store,
  );
  const created = await createWorktree(ref, f.policy, f.store);
  writeFileSync(
    join(created.destination, '.gitattributes'),
    '* working-tree-encoding=INVALID-ENCODING\n',
  );
  writeFileSync(join(created.destination, 'tracked.txt'), 'tracked');
  const original = childProcess.spawn;
  const sources: string[] = [];
  childProcess.spawn = ((...args: Parameters<typeof original>) => {
    if (Array.isArray(args[1]) && args[1].includes('status')) {
      const value: unknown = args[1].find(
        (a: unknown) => typeof a === 'string' && a.startsWith('--attr-source='),
      );
      sources.push(typeof value === 'string' ? value : 'missing');
    }
    return original(...args);
  }) as typeof original;
  syncBuiltinESMExports();
  try {
    const report = await inspectWorktree(ref, f.policy, f.store);
    expect(report).toMatchObject({
      state: 'confirmed',
      current: 'clean',
      validationScope: {
        schemaVersion: 1,
        files: 'tracked',
        untracked: 'excluded',
        ignored: 'excluded',
        attributes: 'commit',
      },
    });
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.every((s) => s === `--attr-source=${f.commit}`)).toBe(true);
  } finally {
    childProcess.spawn = original;
    syncBuiltinESMExports();
  }
}, 20000);
it('B0303 reports HEAD drift observed by the final validation', async () => {
  const f = await workFixture();
  const ref = await prepareWorktree(
    f.project,
    f.commit,
    f.execution,
    f.policy,
    f.store,
  );
  const created = await createWorktree(ref, f.policy, f.store);
  const original = childProcess.spawn;
  let changed = false;
  childProcess.spawn = ((...args: Parameters<typeof original>) => {
    if (
      !changed &&
      Array.isArray(args[1]) &&
      args[1].includes(created.destination) &&
      args[1].includes('--show-toplevel')
    ) {
      changed = true;
      git(created.destination, 'symbolic-ref', 'HEAD', 'refs/heads/another');
    }
    return original(...args);
  }) as typeof original;
  syncBuiltinESMExports();
  try {
    expect(await inspectWorktree(ref, f.policy, f.store)).toMatchObject({
      state: 'confirmed',
      current: 'drift',
      receipt: created.receipt,
    });
    expect(changed).toBe(true);
  } finally {
    childProcess.spawn = original;
    syncBuiltinESMExports();
  }
}, 20000);
it.each([
  '.git',
  '.gitmodules',
  '.gitattributes',
  '.GITIGNORE',
  '.gitignore.',
  'GITIGN~1',
  '.gitignore/child',
  'collision',
])(
  'B0303 rejects unsafe tree name %s',
  async (name) => {
    const f = await workFixture();
    const oid = git(f.repo, 'rev-parse', 'HEAD:tracked.txt');
    if (name === '.git' || name === '.gitignore.') {
      // Git's index rejects these names itself. Build a real local tree object
      // without materializing it, to exercise the application's boundary too.
      const raw = Buffer.concat([
        Buffer.from(`100644 ${name}\0`),
        Buffer.from(oid, 'hex'),
      ]);
      const treeOid = execFileSync(
        'git',
        [
          '-C',
          f.repo,
          'hash-object',
          '--literally',
          '-w',
          '-t',
          'tree',
          '--stdin',
        ],
        { input: raw, encoding: 'utf8', windowsHide: true },
      ).trim();
      const commit = git(
        f.repo,
        'commit-tree',
        treeOid,
        '-m',
        'invalid path fixture',
      );
      await expect(
        prepareWorktree(f.project, commit, f.execution, f.policy, f.store),
      ).rejects.toMatchObject({ code: 'unsafe_path' });
      expect(readdirSync(f.execution)).toEqual([]);
      return;
    }
    git(
      f.repo,
      'update-index',
      '--add',
      '--cacheinfo',
      `100644,${oid},${name === 'collision' ? '.gitignore' : name}`,
    );
    if (name === 'collision')
      git(
        f.repo,
        'update-index',
        '--add',
        '--cacheinfo',
        `100644,${oid},.GITIGNORE`,
      );
    git(f.repo, 'commit', '-qm', 'unsafe name');
    const commit = git(f.repo, 'rev-parse', 'HEAD');
    await expect(
      prepareWorktree(f.project, commit, f.execution, f.policy, f.store),
    ).rejects.toBeInstanceOf(Error);
    expect(readdirSync(f.execution)).toEqual([]);
  },
  10000,
);
it.each([
  'clean',
  'modified',
  'drift',
  'invalid',
  'identity',
  'uncertain',
  'prepared',
  'outside',
])(
  'B0303 CLI current eligibility %s preserves history and denies repeat',
  async (scenario) => {
    const f = await workFixture();
    const ref = await prepareWorktree(
      f.project,
      f.commit,
      f.execution,
      f.policy,
      f.store,
    );
    const created =
      scenario === 'prepared'
        ? await inspectWorktree(ref, f.policy, f.store)
        : await createWorktree(ref, f.policy, f.store);
    if (scenario === 'modified')
      writeFileSync(join(created.destination, 'tracked.txt'), 'modified');
    if (scenario === 'drift')
      git(created.destination, 'symbolic-ref', 'HEAD', 'refs/heads/another');
    if (scenario === 'invalid')
      renameSync(created.destination, created.destination + '-gone');
    if (scenario === 'identity') {
      renameSync(created.destination, created.destination + '-old');
      mkdirSync(created.destination);
      writeFileSync(
        join(created.destination, '.git'),
        readFileSync(join(created.destination + '-old', '.git')),
      );
    }
    if (scenario === 'uncertain')
      rmSync(join(dirname(created.destination), 'confirmed.json'));
    await f.store.close();
    const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
    const output = spawnSync(
      process.execPath,
      [
        cli,
        'project',
        'worktree',
        'inspect',
        '--storage',
        f.storage,
        '--ref',
        ref.sha256,
        '--bytes',
        String(ref.byteLength),
        '--allow-root',
        scenario === 'outside' ? f.execution : f.repo,
        '--write-root',
        join(f.repo, '.git'),
        '--execution-root',
        f.execution,
      ],
      { encoding: 'utf8' },
    );
    expect(output.status, output.stdout + output.stderr).toBe(
      scenario === 'clean' ? 0 : scenario === 'outside' ? 1 : 2,
    );
    if (scenario !== 'outside') {
      const report = JSON.parse(output.stdout) as {
        state: string;
        receipt?: unknown;
      };
      if (
        ['clean', 'modified', 'drift', 'invalid', 'identity'].includes(scenario)
      ) {
        expect(report.state).toBe('confirmed');
        expect(report.receipt).toEqual(created.receipt);
      }
    }
    if (scenario !== 'prepared') {
      const reopened = await openSqlitePersistence(
        join(f.storage, 'projects.sqlite'),
      );
      f.stores.push(reopened);
      await expect(
        createWorktree(ref, f.policy, reopened),
      ).rejects.toBeInstanceOf(Error);
      expect(
        git(f.repo, 'worktree', 'list', '--porcelain').split('worktree ')
          .length - 1,
      ).toBe(2);
    }
  },
  20000,
);
it.each(['deleted', 'staged', 'junction'])(
  'B0303 tracked validation handles %s without reading outside',
  async (kind) => {
    const f = await workFixture();
    mkdirSync(join(f.repo, 'src'));
    writeFileSync(join(f.repo, 'src', 'app.ts'), 'export const value = 1;\n');
    git(f.repo, 'add', 'src');
    git(f.repo, 'commit', '-qm', 'source fixture');
    const ref = await prepareWorktree(
      f.project,
      git(f.repo, 'rev-parse', 'HEAD'),
      f.execution,
      f.policy,
      f.store,
    );
    const created = await createWorktree(ref, f.policy, f.store);
    if (kind === 'deleted') rmSync(join(created.destination, 'src', 'app.ts'));
    if (kind === 'staged') {
      writeFileSync(join(created.destination, 'src', 'app.ts'), 'modified');
      git(created.destination, 'add', 'src/app.ts');
    }
    if (kind === 'junction') {
      const outside = join(f.root, 'outside');
      mkdirSync(outside);
      writeFileSync(join(outside, 'app.ts'), 'private');
      renameSync(
        join(created.destination, 'src'),
        join(created.destination, 'src-old'),
      );
      symlinkSync(
        outside,
        join(created.destination, 'src'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    }
    const report = await inspectWorktree(ref, f.policy, f.store);
    expect(report).toMatchObject({
      state: 'confirmed',
      current: kind === 'junction' ? 'invalid' : 'modified',
      receipt: created.receipt,
    });
    expect(JSON.stringify(report)).not.toContain('private');
  },
  20000,
);
