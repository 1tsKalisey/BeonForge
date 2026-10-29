import { afterEach, expect, it, vi } from 'vitest';
import * as workspace from '@beonforge/workspace';
import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  writeFileSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  existsSync,
} from 'node:fs';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import {
  openSqlitePersistence,
  type DurableStore,
  type ArtifactStore,
} from '@beonforge/persistence';
import {
  parseArtifactReference,
  type ArtifactReference,
} from '@beonforge/contracts';
import {
  buildContextPackage,
  readContextPackage,
  registerProject,
  prepareWorktree,
  createWorktree,
  type ContextPolicy,
  type ContextManifest,
} from '@beonforge/workspace';

const temp = realpathSync(tmpdir());
// Each test creates and verifies a real multi-file Git worktree, not a mock.
vi.setConfig({ testTimeout: 60000, hookTimeout: 30000 });
const fixtures: { root: string; stores: DurableStore[] }[] = [];
function git(root: string, ...args: string[]) {
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
async function fixture(extra: Record<string, string | Uint8Array> = {}) {
  const root = mkdtempSync(join(temp, 'beonforge-context-'));
  const repo = join(root, 'repo'),
    storage = join(root, 'storage'),
    execution = join(root, 'execution');
  for (const p of [repo, storage, execution]) mkdirSync(p, { mode: 0o700 });
  const stores: DurableStore[] = [];
  fixtures.push({ root, stores });
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.name', 'Fixture');
  git(repo, 'config', 'user.email', 'fixture@example.invalid');
  const content = {
    '.gitignore': 'node_modules/\n.env\nignored.txt\n',
    'package.json': '{"name":"temporary-typescript-project","private":true}\n',
    'tsconfig.json': '{"compilerOptions":{"strict":true}}\n',
    'src/app.ts': 'export const greeting: string = "hola";\r\n',
    'README.md': '# Temporary TypeScript project\n',
    ...extra,
  };
  for (const [path, bytes] of Object.entries(content)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), bytes);
  }
  git(repo, 'add', '-f', '.');
  git(repo, 'commit', '-qm', 'fixture');
  const store = await openSqlitePersistence(join(storage, 'projects.sqlite'));
  stores.push(store);
  const projectPolicy = {
    roots: [repo],
    gitDirectories: [],
    commonDirectories: [],
  };
  const project = await registerProject(repo, projectPolicy, store);
  const worktree = {
    ...projectPolicy,
    executionRoots: [execution],
    metadataWriteRoots: [join(repo, '.git')],
    storageRoot: storage,
  };
  const intent = await prepareWorktree(
    project,
    git(repo, 'rev-parse', 'HEAD'),
    execution,
    worktree,
    store,
  );
  const report = await createWorktree(intent, worktree, store);
  expect(report).toMatchObject({ state: 'confirmed', current: 'clean' });
  const policy: ContextPolicy = {
    workspace: worktree,
    canRead: true,
    canPublish: true,
    allowedIntents: [intent],
    allowedPaths: Object.keys(content),
  };
  return {
    root,
    repo,
    storage,
    store,
    stores,
    intent,
    report,
    policy,
    destination: report.destination,
    content,
  };
}
afterEach(async () => {
  for (const f of fixtures.splice(0)) {
    for (const store of f.stores) await store.close();
    expect(dirname(realpathSync(f.root))).toBe(temp);
    rmSync(f.root, { recursive: true, force: true });
  }
});
function sha(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}
function recorder(store: ArtifactStore) {
  const writes: Uint8Array[] = [];
  return {
    writes,
    store: {
      readArtifact: store.readArtifact.bind(store),
      putArtifact: async (b: Uint8Array) => {
        writes.push(b);
        return store.putArtifact(b);
      },
    },
  };
}
async function mutate(
  f: Awaited<ReturnType<typeof fixture>>,
  ref: ArtifactReference,
  change: (m: ContextManifest) => unknown,
) {
  const manifest = JSON.parse(
    Buffer.from(await f.store.readArtifact(ref)).toString('utf8'),
  ) as ContextManifest;
  return f.store.putArtifact(Buffer.from(JSON.stringify(change(manifest))));
}

it('B0304 publishes the compiled minimal context API', () => {
  expect(workspace).toHaveProperty('buildContextPackage');
  expect(workspace).toHaveProperty('readContextPackage');
});

it('B0304 deterministic explicit selection contains exact working-tree bytes and no absolute paths', async () => {
  const f = await fixture();
  const beforeIndex = readFileSync(join(f.repo, '.git', 'index'));
  const beforeConfig = readFileSync(join(f.repo, '.git', 'config'));
  const ownIndex = join(
    git(f.destination, 'rev-parse', '--absolute-git-dir'),
    'index',
  );
  const beforeOwnIndex = readFileSync(ownIndex);
  const beforeFiles = Object.keys(f.content).map((p) => [
    p,
    sha(readFileSync(join(f.destination, p))),
  ]);
  const ref = await buildContextPackage(
    f.intent,
    ['src/app.ts', '.gitignore'],
    f.policy,
    f.store,
  );
  expect(
    await buildContextPackage(
      f.intent,
      ['.gitignore', 'src/app.ts'],
      f.policy,
      f.store,
    ),
  ).toEqual(ref);
  const result = await readContextPackage(ref, f.policy, f.store);
  expect(result.sourceValidation).toBe('historical-not-revalidated');
  expect(result.files.map((x) => x.path)).toEqual(['.gitignore', 'src/app.ts']);
  for (const file of result.files) {
    expect(Buffer.from(file.bytes)).toEqual(
      readFileSync(join(f.destination, file.path)),
    );
    expect(
      result.manifest.files.find((x) => x.path === file.path)?.artifact,
    ).toEqual({ sha256: sha(file.bytes), byteLength: file.bytes.length });
  }
  expect(Buffer.from(result.files[1]!.bytes).toString()).toContain('\r\n');
  expect(result.manifest).toMatchObject({
    schemaVersion: 1,
    contentSource: 'working-tree-bytes',
    validationScope: {
      untracked: 'excluded',
      ignored: 'excluded',
      attributes: 'commit',
    },
    totals: {
      fileCount: 2,
      tokenEstimate: {
        algorithm: 'utf8-byte-units-v1',
        approximate: true,
        provider: null,
      },
    },
  });
  const serialized = Buffer.from(await f.store.readArtifact(ref)).toString();
  expect(serialized).not.toContain(f.root);
  expect(serialized).not.toContain('timestamp');
  expect(result.manifest.totals.tokenEstimate.value).toBe(
    result.manifest.totals.byteLength,
  );
  expect(readFileSync(join(f.repo, '.git', 'index'))).toEqual(beforeIndex);
  expect(readFileSync(join(f.repo, '.git', 'config'))).toEqual(beforeConfig);
  expect(readFileSync(ownIndex)).toEqual(beforeOwnIndex);
  expect(
    Object.keys(f.content).map((p) => [
      p,
      sha(readFileSync(join(f.destination, p))),
    ]),
  ).toEqual(beforeFiles);
});

it('B0304 rejects duplicates, invalid spelling and unauthorized selections before publication', async () => {
  const f = await fixture();
  const r = recorder(f.store);
  for (const paths of [
    [],
    ['src/app.ts', 'src/app.ts'],
    ['../repo/README.md'],
    ['src\\app.ts'],
    ['/README.md'],
    ['src/APP.ts'],
    ['src/./app.ts'],
    ['CON.txt'],
    ['src/app.ts.'],
    ['.GITIGNORE'],
  ]) {
    await expect(
      buildContextPackage(f.intent, paths, f.policy, r.store),
    ).rejects.toHaveProperty('code');
  }
  await expect(
    buildContextPackage(
      f.intent,
      ['README.md'],
      { ...f.policy, allowedPaths: [] },
      r.store,
    ),
  ).rejects.toMatchObject({ code: 'context_denied' });
  await expect(
    buildContextPackage(
      f.intent,
      ['README.md'],
      { ...f.policy, allowedIntents: [] },
      r.store,
    ),
  ).rejects.toMatchObject({ code: 'context_denied' });
  await expect(
    buildContextPackage(
      f.intent,
      ['README.md'],
      { ...f.policy, canPublish: false },
      r.store,
    ),
  ).rejects.toMatchObject({ code: 'context_denied' });
  expect(r.writes).toHaveLength(0);
});
it('B0304 untracked and ignored files never become selectable even with path grants', async () => {
  const f = await fixture();
  for (const path of ['extra.txt', 'ignored.txt'])
    writeFileSync(join(f.destination, path), 'not captured');
  const r = recorder(f.store);
  for (const path of ['extra.txt', 'ignored.txt'])
    await expect(
      buildContextPackage(
        f.intent,
        [path],
        { ...f.policy, allowedPaths: [path] },
        r.store,
      ),
    ).rejects.toMatchObject({ code: 'context_denied' });
  expect(r.writes).toHaveLength(0);
  const ref = await buildContextPackage(
    f.intent,
    ['README.md'],
    f.policy,
    f.store,
  );
  expect((await readContextPackage(ref, f.policy, f.store)).files).toHaveLength(
    1,
  );
});
it.each([
  '.env',
  '.env.local',
  'private/token.txt',
  'knowledge/note.md',
  '.claude/prompt.md',
  'credentials/token.txt',
  'id_rsa',
  'certificate.pem',
])(
  'B0304 denies tracked private path %s before any publication',
  async (path) => {
    const f = await fixture({ [path]: 'sensitive fixture data' });
    const r = recorder(f.store);
    await expect(
      buildContextPackage(f.intent, [path], f.policy, r.store),
    ).rejects.toMatchObject({ code: 'context_denied' });
    expect(r.writes).toHaveLength(0);
  },
);
it.each([
  '-----BEGIN PRIVATE KEY-----\nfixture\n',
  'api_key = "fixture_secret_12345678"\n',
  'hello\0world',
])(
  'B0304 rejects suspect or binary text without CAS writes %#',
  async (content) => {
    const f = await fixture({ 'suspect.txt': content });
    const r = recorder(f.store);
    await expect(
      buildContextPackage(
        f.intent,
        ['README.md', 'suspect.txt'],
        f.policy,
        r.store,
      ),
    ).rejects.toMatchObject({ code: 'context_sensitive' });
    expect(r.writes).toHaveLength(0);
  },
);
it('B0304 rejects non-UTF8 bytes', async () => {
  const f = await fixture({ 'invalid.txt': new Uint8Array([255, 254]) });
  const r = recorder(f.store);
  await expect(
    buildContextPackage(f.intent, ['invalid.txt'], f.policy, r.store),
  ).rejects.toMatchObject({ code: 'context_sensitive' });
  expect(r.writes).toHaveLength(0);
});
it('B0304 rejects tracked modifications, staged changes, HEAD drift and revoked workspace grants', async () => {
  const f = await fixture();
  const path = join(f.destination, 'README.md');
  writeFileSync(path, 'changed\n');
  await expect(
    buildContextPackage(f.intent, ['README.md'], f.policy, f.store),
  ).rejects.toMatchObject({ code: 'context_source_invalid' });
  git(f.destination, 'add', 'README.md');
  // Working-tree bytes match creation, while the index alone remains altered.
  writeFileSync(path, f.content['README.md']);
  await expect(
    buildContextPackage(f.intent, ['README.md'], f.policy, f.store),
  ).rejects.toMatchObject({ code: 'context_source_invalid' });
  git(f.destination, 'reset', '--hard', 'HEAD');
  await expect(
    buildContextPackage(
      f.intent,
      ['README.md'],
      { ...f.policy, workspace: { ...f.policy.workspace, executionRoots: [] } },
      f.store,
    ),
  ).rejects.toMatchObject({ code: 'context_source_invalid' });
  git(f.repo, 'commit', '--allow-empty', '-qm', 'drift');
  git(f.destination, 'checkout', '--detach', git(f.repo, 'rev-parse', 'HEAD'));
  await expect(
    buildContextPackage(f.intent, ['README.md'], f.policy, f.store),
  ).rejects.toMatchObject({ code: 'context_source_invalid' });
});
it('B0304 rejects exact-case substitution even if Git considers it clean', async () => {
  const f = await fixture();
  renameSync(
    join(f.destination, 'src', 'app.ts'),
    join(f.destination, 'src', 'temp.ts'),
  );
  renameSync(
    join(f.destination, 'src', 'temp.ts'),
    join(f.destination, 'src', 'APP.ts'),
  );
  await expect(
    buildContextPackage(f.intent, ['src/app.ts'], f.policy, f.store),
  ).rejects.toHaveProperty('code');
});
it('B0304 refuses uncertain creation without changing the historical protocol', async () => {
  const f = await fixture();
  rmSync(join(dirname(f.destination), 'confirmed.json'));
  const r = recorder(f.store);
  await expect(
    buildContextPackage(f.intent, ['README.md'], f.policy, r.store),
  ).rejects.toMatchObject({ code: 'context_source_invalid' });
  expect(r.writes).toHaveLength(0);
});
it('B0304 ignores hostile untracked attributes and refuses executable configuration without execution', async () => {
  const f = await fixture();
  const marker = join(f.root, 'never-executed.txt');
  writeFileSync(
    join(f.destination, '.gitattributes'),
    '* working-tree-encoding=DOES-NOT-EXIST text eol=crlf ident\n',
  );
  writeFileSync(join(f.destination, 'README.md'), f.content['README.md']);
  const ref = await buildContextPackage(
    f.intent,
    ['README.md'],
    f.policy,
    f.store,
  );
  expect((await readContextPackage(ref, f.policy, f.store)).files).toHaveLength(
    1,
  );
  const config = join(f.repo, '.git', 'config');
  writeFileSync(
    config,
    readFileSync(config, 'utf8') +
      '\n[filter "hostile"]\n clean = ' +
      JSON.stringify(
        `node -e "require('node:fs').writeFileSync('${marker.replaceAll('\\', '/')}','ran')"`,
      ) +
      '\n',
  );
  await expect(
    buildContextPackage(f.intent, ['README.md'], f.policy, f.store),
  ).rejects.toMatchObject({ code: 'context_source_invalid' });
  expect(existsSync(marker)).toBe(false);
});
it('B0304 rejects junction substitution and changed checkout identity', async () => {
  const f = await fixture();
  const saved = join(f.root, 'saved-src');
  renameSync(join(f.destination, 'src'), saved);
  symlinkSync(
    saved,
    join(f.destination, 'src'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await expect(
    buildContextPackage(f.intent, ['src/app.ts'], f.policy, f.store),
  ).rejects.toHaveProperty('code');
  rmSync(join(f.destination, 'src'));
  renameSync(saved, join(f.destination, 'src'));
  renameSync(f.destination, join(f.root, 'saved-worktree'));
  mkdirSync(f.destination);
  await expect(
    buildContextPackage(f.intent, ['README.md'], f.policy, f.store),
  ).rejects.toMatchObject({ code: 'context_source_invalid' });
});
it('B0304 detects concurrent changes during bounded file reads before CAS publication', async () => {
  const f = await fixture();
  const r = recorder(f.store);
  const original = fsPromises.open;
  let changed = false;
  fsPromises.open = async (...args: Parameters<typeof original>) => {
    const h = await original(...args);
    if (args[0] === join(f.destination, 'README.md')) {
      const read = h.read.bind(h);
      h.read = async (...a: Parameters<typeof h.read>) => {
        const result = await read(...a);
        if (!changed) {
          changed = true;
          writeFileSync(join(f.destination, 'README.md'), 'concurrent edit\n');
        }
        return result;
      };
    }
    return h;
  };
  syncBuiltinESMExports();
  try {
    await expect(
      buildContextPackage(f.intent, ['README.md'], f.policy, r.store),
    ).rejects.toMatchObject({ code: 'context_changed' });
    expect(changed).toBe(true);
    expect(r.writes).toHaveLength(0);
  } finally {
    fsPromises.open = original;
    syncBuiltinESMExports();
  }
});
it.each(['count', 'individual', 'total'] as const)(
  'B0304 enforces %s limit before publication',
  async (kind) => {
    const extras: Record<string, string> =
      kind === 'count'
        ? Object.fromEntries(
            Array.from({ length: 17 }, (_, i) => [`file${i}.txt`, 'x']),
          )
        : kind === 'individual'
          ? { 'large.txt': 'x'.repeat(16385) }
          : {
              'a.txt': 'x'.repeat(16384),
              'b.txt': 'x'.repeat(16384),
              'c.txt': 'x',
            };
    const f = await fixture(extras);
    const r = recorder(f.store);
    await expect(
      buildContextPackage(f.intent, Object.keys(extras), f.policy, r.store),
    ).rejects.toMatchObject({ code: 'context_limit' });
    expect(r.writes).toHaveLength(0);
    if (kind === 'count') {
      const ref = await buildContextPackage(
        f.intent,
        Object.keys(extras).slice(0, 16),
        f.policy,
        f.store,
      );
      expect(
        (await readContextPackage(ref, f.policy, f.store)).manifest.files,
      ).toHaveLength(16);
    }
  },
);
it('B0304 accepts byte boundaries and empty text', async () => {
  const f = await fixture({
    'a.txt': 'x'.repeat(16384),
    'b.txt': 'x'.repeat(16384),
    'empty.txt': '',
  });
  const ref = await buildContextPackage(
    f.intent,
    ['a.txt', 'b.txt', 'empty.txt'],
    f.policy,
    f.store,
  );
  expect(
    (await readContextPackage(ref, f.policy, f.store)).manifest.totals,
  ).toMatchObject({ fileCount: 3, byteLength: 32768 });
});
it('B0304 rechecks CAS grants independently from historical manifests', async () => {
  const f = await fixture();
  const ref = await buildContextPackage(
    f.intent,
    ['README.md'],
    f.policy,
    f.store,
  );
  for (const deny of [
    { canRead: false },
    { allowedIntents: [] },
    { allowedPaths: [] },
  ])
    await expect(
      readContextPackage(ref, { ...f.policy, ...deny }, f.store),
    ).rejects.toMatchObject({ code: 'context_denied' });
  writeFileSync(join(f.destination, 'README.md'), 'legitimate later edit');
  const read = await readContextPackage(ref, f.policy, f.store);
  expect(Buffer.from(read.files[0]!.bytes).toString()).toBe(
    f.content['README.md'],
  );
  expect(read.sourceValidation).toBe('historical-not-revalidated');
});
it.each([
  'version',
  'totals',
  'path',
  'missing',
  'receipt',
  'extra',
  'order',
] as const)('B0304 rejects manifest tampering: %s', async (kind) => {
  const f = await fixture();
  const ref = await buildContextPackage(
    f.intent,
    ['README.md', 'src/app.ts'],
    f.policy,
    f.store,
  );
  const tampered = await mutate(f, ref, (m) =>
    kind === 'version'
      ? { ...m, schemaVersion: 2 }
      : kind === 'totals'
        ? { ...m, totals: { ...m.totals, byteLength: 0 } }
        : kind === 'path'
          ? { ...m, files: [{ ...m.files[0], path: '../outside' }] }
          : kind === 'missing'
            ? {
                ...m,
                files: m.files.map((x) => ({
                  ...x,
                  artifact: { ...x.artifact, sha256: '0'.repeat(64) },
                })),
              }
            : kind === 'receipt'
              ? { ...m, source: { ...m.source, receipt: m.files[0]!.artifact } }
              : kind === 'extra'
                ? { ...m, unauthorized: true }
                : { ...m, files: [...m.files].reverse() },
  );
  await expect(
    readContextPackage(tampered, f.policy, f.store),
  ).rejects.toHaveProperty('code');
});
it('B0304 verifies hashes independently of the CAS adapter and handles partial publication', async () => {
  const f = await fixture();
  const ref = await buildContextPackage(
    f.intent,
    ['README.md'],
    f.policy,
    f.store,
  );
  const result = await readContextPackage(ref, f.policy, f.store);
  const blob = result.manifest.files[0]!.artifact;
  const corrupt: ArtifactStore = {
    putArtifact: f.store.putArtifact.bind(f.store),
    readArtifact: async (r) =>
      r.sha256 === blob.sha256
        ? Buffer.alloc(r.byteLength)
        : f.store.readArtifact(r),
  };
  await expect(
    readContextPackage(ref, f.policy, corrupt),
  ).rejects.toMatchObject({ code: 'context_integrity' });
  const lyingWriter: ArtifactStore = {
    readArtifact: f.store.readArtifact.bind(f.store),
    putArtifact: async (bytes) => ({
      ...(await f.store.putArtifact(bytes)),
      sha256: '0'.repeat(64),
    }),
  };
  await expect(
    buildContextPackage(f.intent, ['README.md'], f.policy, lyingWriter),
  ).rejects.toMatchObject({ code: 'context_integrity' });
  await expect(
    readContextPackage(
      { sha256: '0'.repeat(64), byteLength: 1 },
      f.policy,
      f.store,
    ),
  ).rejects.toMatchObject({ code: 'context_integrity' });
  const writes: ArtifactReference[] = [];
  const interrupted: ArtifactStore = {
    readArtifact: f.store.readArtifact.bind(f.store),
    putArtifact: async (b) => {
      if (writes.length === 1) throw Error('simulated interruption');
      const r = await f.store.putArtifact(b);
      writes.push(r);
      return r;
    },
  };
  await expect(
    buildContextPackage(
      f.intent,
      ['README.md', 'src/app.ts'],
      f.policy,
      interrupted,
    ),
  ).rejects.toMatchObject({ code: 'context_source_invalid' });
  expect(writes).toHaveLength(1);
  await expect(
    readContextPackage(writes[0]!, f.policy, f.store),
  ).rejects.toMatchObject({ code: 'context_integrity' });
});
it('B0304 TypeScript demo persists explicit CAS package and verifies same bytes in another process', async () => {
  const f = await fixture();
  const paths = ['.gitignore', 'package.json', 'tsconfig.json', 'src/app.ts'];
  const expected = [...paths].sort().map((path) => {
    const bytes = readFileSync(join(f.destination, path));
    return { path, sha256: sha(bytes), bytes: bytes.toString('base64') };
  });
  await f.store.close();
  f.stores.length = 0;
  const cli = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('../dist/cli.js', import.meta.url)),
      'project',
      'worktree',
      'inspect',
      '--storage',
      f.storage,
      '--ref',
      f.intent.sha256,
      '--bytes',
      String(f.intent.byteLength),
      '--allow-root',
      f.repo,
      '--execution-root',
      f.policy.workspace.executionRoots[0]!,
      '--write-root',
      join(f.repo, '.git'),
    ],
    { encoding: 'utf8', timeout: 15000, windowsHide: true },
  );
  expect(cli.status, cli.stderr).toBe(0);
  expect(JSON.parse(cli.stdout)).toMatchObject({
    state: 'confirmed',
    current: 'clean',
    validationScope: {
      files: 'tracked',
      untracked: 'excluded',
      ignored: 'excluded',
      attributes: 'commit',
    },
  });
  const script = join(f.root, 'recover.mjs');
  const workspaceUrl = pathToFileURL(
    fileURLToPath(new URL('../dist/index.js', import.meta.url)),
  ).href;
  const persistenceUrl = pathToFileURL(
    fileURLToPath(new URL('../../persistence/dist/index.js', import.meta.url)),
  ).href;
  const producerScript = join(f.root, 'capture.mjs');
  writeFileSync(
    producerScript,
    `import {buildContextPackage} from ${JSON.stringify(workspaceUrl)};\nimport {openSqlitePersistence} from ${JSON.stringify(persistenceUrl)};\nconst store=await openSqlitePersistence(${JSON.stringify(join(f.storage, 'projects.sqlite'))});\ntry {console.log(JSON.stringify(await buildContextPackage(${JSON.stringify(f.intent)},${JSON.stringify(paths)},${JSON.stringify(f.policy)},store)));} finally {await store.close();}\n`,
  );
  const producer = spawnSync(process.execPath, [producerScript], {
    encoding: 'utf8',
    timeout: 20000,
    windowsHide: true,
  });
  expect(producer.status, producer.stderr).toBe(0);
  const parsed: unknown = JSON.parse(producer.stdout);
  const ref = parseArtifactReference(parsed);
  writeFileSync(
    script,
    `import {readContextPackage} from ${JSON.stringify(workspaceUrl)};\nimport {openSqlitePersistence} from ${JSON.stringify(persistenceUrl)};\nimport {createHash} from 'node:crypto';\nconst store=await openSqlitePersistence(${JSON.stringify(join(f.storage, 'projects.sqlite'))});\ntry { const result=await readContextPackage(${JSON.stringify(ref)},${JSON.stringify({ canRead: true, allowedIntents: [f.intent], allowedPaths: paths })},store);console.log(JSON.stringify(result.files.map(x=>({path:x.path,sha256:createHash('sha256').update(x.bytes).digest('hex'),bytes:Buffer.from(x.bytes).toString('base64')})))); } finally {await store.close();}\n`,
  );
  const child = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true,
  });
  expect(child.status, child.stderr).toBe(0);
  expect(JSON.parse(child.stdout)).toEqual(expected);
  expect(existsSync(join(f.repo, '.git', 'index'))).toBe(true);
});
