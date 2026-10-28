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
import { execFileSync, spawnSync } from 'node:child_process';
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
