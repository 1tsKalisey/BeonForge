import { afterEach, expect, it, vi } from 'vitest';
import {
  mkdtempSync,
  realpathSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  lstatSync,
  renameSync,
  symlinkSync,
  linkSync,
  appendFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';
import { Socket } from 'node:net';
import { syncBuiltinESMExports } from 'node:module';
import {
  openSqlitePersistence,
  type DurableStore,
} from '@beonforge/persistence';
import { canonical } from '@beonforge/workspace';
import {
  prepareBugfixDemo,
  runBugfixDemo,
  inspectBugfixDemo,
  reviewBugfixDemo,
  BugfixError,
  type BugfixPolicy,
  type BugfixEvidence,
} from '../examples/bugfix/demo.ts';
import {
  BEFORE,
  AFTER,
  FILES,
  EXPECTED_DIFF,
} from '../examples/bugfix/fixture.ts';

const injection = vi.hoisted(() => ({
  finishPatch: false,
  revoke: null as null | (() => void),
}));
vi.mock('@beonforge/persistence', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@beonforge/persistence')>();
  return {
    ...actual,
    async openSqlitePersistence(
      ...args: Parameters<typeof actual.openSqlitePersistence>
    ) {
      const store = await actual.openSqlitePersistence(...args);
      return new Proxy(store, {
        get(target, key) {
          if (key === 'append')
            return async (...args: Parameters<DurableStore['append']>) => {
              const [event] = args;
              if (
                injection.finishPatch &&
                event.type === 'block.finished' &&
                event.result.blockId === 'patch'
              ) {
                injection.finishPatch = false;
                throw new actual.PersistenceError('storage_failure');
              }
              const result = await target.append(...args);
              if (
                event.type === 'block.finished' &&
                event.result.blockId === 'red'
              )
                injection.revoke?.();
              return result;
            };
          const value: unknown = Reflect.get(target, key);
          return typeof value === 'function'
            ? (value as (...args: unknown[]) => unknown).bind(target)
            : value;
        },
      });
    },
  };
});
const temporary = realpathSync(tmpdir());
const parents: string[] = [];
async function parent() {
  const path = realpathSync(
    mkdtempSync(join(temporary, 'beonforge-m041-test-')),
  );
  parents.push(path);
  return canonical(path);
}
async function prepared() {
  const f = await prepareBugfixDemo(await parent());
  const policy: BugfixPolicy = {
    root: f.root,
    canRead: true,
    canRun: true,
    canPatch: true,
    patchSha256: f.preview.patchSha256,
    canReview: true,
    canDiscard: true,
  };
  return { ...f, policy };
}
function inventory(root: string, omitAdmin = false): Record<string, string> {
  const entries: Record<string, string> = {};
  const visit = (path: string, relative: string) => {
    const stat = lstatSync(path);
    expect(stat.isSymbolicLink()).toBe(false);
    if (stat.isDirectory())
      for (const child of readdirSync(path)) {
        if (omitAdmin && relative === '.git' && child === 'worktrees') continue;
        visit(join(path, child), relative ? `${relative}/${child}` : child);
      }
    else
      entries[relative] = createHash('sha256')
        .update(readFileSync(path))
        .digest('hex');
  };
  visit(root, '');
  return entries;
}
async function code(promise: Promise<unknown>, expected: string) {
  let error: unknown;
  try {
    await promise;
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(BugfixError);
  expect(error).toMatchObject({ code: expected, message: expected });
}
afterEach(() => {
  injection.finishPatch = false;
  injection.revoke = null;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  syncBuiltinESMExports();
  for (const p of parents.splice(0)) {
    expect(dirname(realpathSync(p))).toBe(temporary);
    expect(p.startsWith(join(temporary, 'beonforge-m041-test-'))).toBe(true);
    rmSync(p, { recursive: true, force: true });
  }
});
it('M041: new synthetic project -> confirmed worktree/context -> actual red -> fixed patch -> green -> exact diff, pending human review', async () => {
  const f = await prepared();
  const original = inventory(join(f.root, 'project'), true);
  const sentinel = join(dirname(f.root), 'synthetic-outside-sentinel.txt');
  writeFileSync(sentinel, 'synthetic sentinel');
  const network = vi
    .spyOn(Socket.prototype, 'connect')
    .mockImplementation(() => {
      throw new Error('network denied');
    });
  syncBuiltinESMExports();
  const result = await runBugfixDemo(f.root, f.policy);
  expect(result.report).toMatchObject({
    status: 'succeeded',
    completed: ['red', 'patch', 'green', 'evidence'],
  });
  expect(result).toMatchObject({
    review: 'pending',
    integration: 'not_performed',
  });
  expect(result.evidence).not.toBeNull();
  const view = await inspectBugfixDemo(f.root, f.policy);
  const evidence = view.artifact as BugfixEvidence;
  expect(evidence).toMatchObject({
    baseCommit: f.baseCommit,
    redExit: 1,
    greenExit: 0,
    review: 'pending',
    integration: 'not_performed',
    patchSha256: f.preview.patchSha256,
  });
  expect(
    evidence.diff.replace(/^index [a-f0-9]+\.\.[a-f0-9]+ 100644\n/m, ''),
  ).toBe(EXPECTED_DIFF);
  expect(view.worktree).toMatchObject({
    state: 'confirmed',
    current: 'modified',
  });
  expect(view.review).toBe('pending');
  for (const [name, content] of Object.entries(FILES))
    expect(readFileSync(join(f.destination, name), 'utf8')).toBe(
      name === 'src/add.ts' ? AFTER : content,
    );
  expect(readFileSync(join(f.destination, 'src/add.ts'), 'utf8')).toBe(AFTER);
  expect(inventory(join(f.root, 'project'), true)).toEqual(original);
  expect(readFileSync(sentinel, 'utf8')).toBe('synthetic sentinel');
  expect(network).not.toHaveBeenCalled();
  const again = await runBugfixDemo(f.root, f.policy);
  expect(again.evidence).toEqual(result.evidence);
  expect((await inspectBugfixDemo(f.root, f.policy)).events).toBe(view.events);
}, 120000);
it('discard requires explicit decision/hash and restores only the synthetic file, original branch remains intact', async () => {
  const f = await prepared();
  const original = inventory(join(f.root, 'project'), true);
  const result = await runBugfixDemo(f.root, f.policy);
  if (!result.evidence) throw new Error('fixture');
  const decision = await reviewBugfixDemo(
    f.root,
    'discard',
    result.evidence.sha256,
    f.policy,
  );
  expect(decision.report.status).toBe('succeeded');
  expect(readFileSync(join(f.destination, 'src/add.ts'), 'utf8')).toBe(BEFORE);
  expect(inventory(join(f.root, 'project'), true)).toEqual(original);
  const view = await inspectBugfixDemo(f.root, f.policy);
  expect(view.review).toMatchObject({
    decision: 'discard',
    status: 'confirmed',
  });
  expect(view.worktree).toMatchObject({ state: 'confirmed', current: 'clean' });
  expect(view.artifact).toMatchObject({ review: 'pending', greenExit: 0 }); // historical evidence is never rewritten
  await code(
    reviewBugfixDemo(f.root, 'discard', result.evidence.sha256, f.policy),
    'demo_review_exists',
  );
  await code(runBugfixDemo(f.root, f.policy), 'demo_review_exists');
}, 120000);
it('approve only records supplied decision, no merge/commit or inferred human acceptance', async () => {
  const f = await prepared();
  const result = await runBugfixDemo(f.root, f.policy);
  if (!result.evidence) throw new Error('fixture');
  const before = inventory(join(f.root, 'project'), true);
  expect(
    (
      await reviewBugfixDemo(
        f.root,
        'approve',
        result.evidence.sha256,
        f.policy,
      )
    ).report.status,
  ).toBe('succeeded');
  expect((await inspectBugfixDemo(f.root, f.policy)).review).toMatchObject({
    decision: 'approve',
    status: 'confirmed',
  });
  expect(readFileSync(join(f.destination, 'src/add.ts'), 'utf8')).toBe(AFTER);
  expect(inventory(join(f.root, 'project'), true)).toEqual(before);
}, 120000);
it.each(['canRun', 'canPatch', 'canRead', 'patchSha256', 'root'] as const)(
  'unauthorized fixed operation is rejected before execution: %s',
  async (key) => {
    const f = await prepared();
    const bad = {
      ...f.policy,
      [key]:
        key === 'root'
          ? dirname(f.root)
          : key === 'patchSha256'
            ? '0'.repeat(64)
            : false,
    };
    await code(runBugfixDemo(f.root, bad), 'demo_denied');
    expect(readFileSync(join(f.destination, 'src/add.ts'), 'utf8')).toBe(
      BEFORE,
    );
    expect((await inspectBugfixDemo(f.root, f.policy)).events).toBe(0);
  },
  120000,
);
it('inherited grants/getters do not authorize and revocation between red and patch prevents mutation', async () => {
  const f = await prepared();
  const inherited = Object.assign(Object.create({ canPatch: true }) as object, {
    ...f.policy,
  });
  delete (inherited as Partial<BugfixPolicy>).canPatch;
  await code(runBugfixDemo(f.root, inherited), 'demo_denied');
  const getter = vi.fn(() => true);
  const malicious = Object.defineProperty({ ...f.policy }, 'canPatch', {
    get: getter,
  });
  await code(runBugfixDemo(f.root, malicious), 'demo_invalid');
  expect(getter).not.toHaveBeenCalled();
  injection.revoke = () => {
    f.policy.canPatch = false;
  };
  expect((await runBugfixDemo(f.root, f.policy)).report).toMatchObject({
    status: 'blocked',
    stoppedBlock: 'patch',
    reason: 'uncertain',
  });
  expect(readFileSync(join(f.destination, 'src/add.ts'), 'utf8')).toBe(BEFORE);
}, 120000);
it.each(['source', 'test', 'extra', 'attributes', 'head'] as const)(
  'reject unexpected repository modification before executing code: %s',
  async (kind) => {
    const f = await prepared();
    if (kind === 'source')
      writeFileSync(join(f.destination, 'src/add.ts'), 'not authorized');
    if (kind === 'test')
      writeFileSync(
        join(f.destination, 'test/add.test.mjs'),
        'throw new Error("synthetic tampering")',
      );
    if (kind === 'extra')
      writeFileSync(join(f.destination, 'ignored.log'), 'synthetic ignored');
    if (kind === 'attributes')
      writeFileSync(
        join(f.destination, '.gitattributes'),
        '* filter=hostile\n',
      );
    if (kind === 'head') {
      const pointer = readFileSync(join(f.destination, '.git'), 'utf8')
        .trim()
        .slice(8);
      writeFileSync(join(pointer, 'HEAD'), '0'.repeat(40) + '\n');
    }
    await code(
      runBugfixDemo(f.root, f.policy),
      kind === 'head' ? 'demo_changed' : 'demo_changed',
    );
  },
  120000,
);
it('descriptor cannot authorize an outside worktree and a replaced physical directory is rejected', async () => {
  const f = await prepared(),
    session = join(f.root, 'session.json');
  const original = readFileSync(session, 'utf8');
  const raw = JSON.parse(original) as { destination: string };
  raw.destination = join(dirname(f.root), 'outside');
  writeFileSync(session, JSON.stringify(raw));
  await code(runBugfixDemo(f.root, f.policy), 'demo_invalid');
  writeFileSync(session, original);
  renameSync(join(f.destination, 'src'), join(f.destination, 'old-src'));
  mkdirSync(join(f.destination, 'src'));
  writeFileSync(join(f.destination, 'src/add.ts'), BEFORE);
  await code(runBugfixDemo(f.root, f.policy), 'demo_changed');
}, 120000);
it.each(['junction', 'hardlink'] as const)(
  'reject links without modifying the synthetic outside sentinel: %s',
  async (kind) => {
    const f = await prepared();
    const outside = join(dirname(f.root), 'synthetic-outside');
    mkdirSync(outside);
    const sentinel = join(outside, 'add.ts');
    writeFileSync(sentinel, BEFORE);
    if (kind === 'junction') {
      renameSync(join(f.destination, 'src'), join(f.destination, 'saved-src'));
      symlinkSync(outside, join(f.destination, 'src'), 'junction');
    } else {
      rmSync(join(f.destination, 'src/add.ts'));
      linkSync(sentinel, join(f.destination, 'src/add.ts'));
    }
    await code(runBugfixDemo(f.root, f.policy), 'demo_changed');
    expect(readFileSync(sentinel, 'utf8')).toBe(BEFORE);
  },
  120000,
);
it('lost patch confirmation survives reopening and blocks retry without duplicating the effect', async () => {
  const f = await prepared();
  injection.finishPatch = true;
  await code(runBugfixDemo(f.root, f.policy), 'demo_storage_failure');
  expect(readFileSync(join(f.destination, 'src/add.ts'), 'utf8')).toBe(AFTER);
  const result = await runBugfixDemo(f.root, f.policy);
  expect(result.report).toMatchObject({
    status: 'blocked',
    stoppedBlock: 'patch',
    reason: 'pending',
  });
  expect(result.evidence).toBeNull();
  expect(readFileSync(join(f.destination, 'src/add.ts'), 'utf8')).toBe(AFTER);
  expect((await inspectBugfixDemo(f.root, f.policy)).review).toBe('pending');
}, 120000);
it('explicit discard denies wrong hash, missing permission and edited postimage; no automatic cleanup', async () => {
  const f = await prepared(),
    result = await runBugfixDemo(f.root, f.policy);
  if (!result.evidence) throw new Error('fixture');
  const controller = new AbortController();
  controller.abort();
  await code(
    reviewBugfixDemo(
      f.root,
      'discard',
      result.evidence.sha256,
      f.policy,
      controller.signal,
    ),
    'demo_interrupted',
  );
  expect(existsSync(join(f.root, 'review.json'))).toBe(false);
  await code(
    reviewBugfixDemo(f.root, 'discard', '0'.repeat(64), f.policy),
    'demo_denied',
  );
  await code(
    reviewBugfixDemo(f.root, 'discard', result.evidence.sha256, {
      ...f.policy,
      canDiscard: false,
    }),
    'demo_denied',
  );
  writeFileSync(
    join(f.destination, 'src/add.ts'),
    AFTER + '// synthetic concurrent edit\n',
  );
  await code(
    reviewBugfixDemo(f.root, 'discard', result.evidence.sha256, f.policy),
    'demo_changed',
  );
  expect(readdirSync(f.root)).not.toContain('review.json');
  expect(readFileSync(join(f.destination, 'src/add.ts'), 'utf8')).toContain(
    'concurrent edit',
  );
}, 120000);
function cli(args: string[]) {
  return new Promise<{ code: number | null; out: string; err: string }>(
    (resolve, reject) => {
      execFile(
        process.execPath,
        ['examples/bugfix/cli.mjs', ...args],
        { windowsHide: true, timeout: 120000, maxBuffer: 65536 },
        (error, out, err) => {
          if (error && typeof error.code !== 'number')
            reject(new Error('CLI process failed'));
          else
            resolve({
              code: (error?.code as number | undefined) ?? 0,
              out,
              err,
            });
        },
      );
    },
  );
}
it('CLI demo across processes recovers exactly the same context/evidence and stops at pending review', async () => {
  const f = await prepared();
  const run = await cli([
    'run',
    '--root',
    f.root,
    '--allow-fixture-read',
    '--allow-fixture-execution',
    '--allow-fixed-patch',
    '--patch-sha256',
    f.preview.patchSha256,
  ]);
  expect(run.code, run.out + run.err).toBe(0);
  const inspected = await cli([
    'inspect',
    '--root',
    f.root,
    '--allow-fixture-read',
  ]);
  expect(inspected.code, inspected.out + inspected.err).toBe(0);
  expect(JSON.parse(inspected.out)).toMatchObject({
    evidence: (JSON.parse(run.out) as { evidence: unknown }).evidence,
    review: 'pending',
    artifact: { redExit: 1, greenExit: 0, envelope: f.envelope },
    integration: 'not_performed',
  });
  const denied = await cli(['run', '--root', f.root, '--allow-fixture-read']);
  expect(denied.code).toBe(1);
  expect(JSON.parse(denied.out)).toEqual({ code: 'demo_denied' });
}, 120000);
it('preparation rejects nonempty, relative or linked authorization parents without inspecting other repositories', async () => {
  const p = await parent();
  writeFileSync(join(p, 'synthetic-sentinel'), 'synthetic');
  await code(prepareBugfixDemo(p), 'demo_denied');
  await code(prepareBugfixDemo('.'), 'demo_changed');
  const q = await parent(),
    alias = join(q, 'alias');
  symlinkSync(p, alias, 'junction');
  await code(prepareBugfixDemo(alias), 'demo_changed');
  expect(readdirSync(p)).toEqual(['synthetic-sentinel']);
});

it('hostile Git filter configuration is rejected without executing a synthetic marker command', async () => {
  const f = await prepared();
  const marker = join(f.root, 'process', 'unexpected-marker');
  const script = join(f.root, 'process', 'hostile.cjs');
  writeFileSync(
    script,
    `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'unexpected');`,
  );
  appendFileSync(
    join(f.root, 'project', '.git', 'config'),
    `\n[core][filter "hostile"]\nclean = "${process.execPath.replaceAll('\\', '/')}" "${script.replaceAll('\\', '/')}"\n`,
  );
  await code(runBugfixDemo(f.root, f.policy), 'demo_changed');
  expect(existsSync(marker)).toBe(false);
  expect(readFileSync(join(f.destination, 'src/add.ts'), 'utf8')).toBe(BEFORE);
}, 120000);

it('fixture subprocesses discard inherited Node injection and Git configuration variables', async () => {
  const f = await prepared();
  const marker = join(f.root, 'process', 'injected-marker');
  const script = join(f.root, 'process', 'injected.cjs');
  writeFileSync(
    script,
    `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'unexpected');`,
  );
  vi.stubEnv('NODE_OPTIONS', `--require=${script}`);
  vi.stubEnv('GIT_CONFIG_COUNT', '1');
  vi.stubEnv('GIT_CONFIG_KEY_0', 'include.path');
  vi.stubEnv('GIT_CONFIG_VALUE_0', join(f.root, 'process', 'does-not-exist'));
  expect((await runBugfixDemo(f.root, f.policy)).report.status).toBe(
    'succeeded',
  );
  expect(existsSync(marker)).toBe(false);
}, 120000);

it('cancellation at a confirmed red boundary does not apply a late patch after returning', async () => {
  const f = await prepared();
  const controller = new AbortController();
  injection.revoke = () => controller.abort();
  expect(
    (await runBugfixDemo(f.root, f.policy, controller.signal)).report.status,
  ).toBe('cancelled');
  expect(readFileSync(join(f.destination, 'src/add.ts'), 'utf8')).toBe(BEFORE);
  expect(existsSync(join(f.root, 'evidence', 'patch-dispatch.json'))).toBe(
    false,
  );
}, 120000);

it('a preexisting patch dispatch is never reused or cleaned automatically', async () => {
  const f = await prepared();
  const receipt = join(f.root, 'evidence', 'patch-dispatch.json');
  writeFileSync(receipt, 'synthetic interrupted dispatch', { flag: 'wx' });
  const run = await runBugfixDemo(f.root, f.policy);
  expect(run.report).toMatchObject({
    status: 'blocked',
    reason: 'uncertain',
    stoppedBlock: 'patch',
  });
  const events = (await inspectBugfixDemo(f.root, f.policy)).events;
  expect((await runBugfixDemo(f.root, f.policy)).report.status).toBe('blocked');
  expect((await inspectBugfixDemo(f.root, f.policy)).events).toBe(events);
  expect(readFileSync(receipt, 'utf8')).toBe('synthetic interrupted dispatch');
  expect(readFileSync(join(f.destination, 'src/add.ts'), 'utf8')).toBe(BEFORE);
}, 120000);

it.each(['intent', 'truncated'] as const)(
  'interrupted review marker remains conservative without a fabricated approval: %s',
  async (kind) => {
    const f = await prepared(),
      run = await runBugfixDemo(f.root, f.policy);
    if (!run.evidence) throw new Error('fixture');
    const marker = join(f.root, 'review.json');
    const data =
      kind === 'intent'
        ? JSON.stringify({
            schemaVersion: 1,
            decision: 'discard',
            evidence: run.evidence,
            state: 'intent',
          })
        : '{';
    writeFileSync(marker, data, { flag: 'wx' });
    if (kind === 'intent') {
      expect((await inspectBugfixDemo(f.root, f.policy)).review).toMatchObject({
        decision: 'discard',
        status: 'pending',
      });
      await code(
        reviewBugfixDemo(f.root, 'discard', run.evidence.sha256, f.policy),
        'demo_review_exists',
      );
    } else
      await code(inspectBugfixDemo(f.root, f.policy), 'demo_storage_failure');
    expect(readFileSync(marker, 'utf8')).toBe(data);
    expect(readFileSync(join(f.destination, 'src/add.ts'), 'utf8')).toBe(AFTER);
  },
  120000,
);

it('SIGKILL after exclusive dispatch: second process reports blocked, with no duplicate write or automatic cleanup', async () => {
  const f = await prepared();
  const child = spawn(
    process.execPath,
    [
      'examples/bugfix/cli.mjs',
      'run',
      '--root',
      f.root,
      '--allow-fixture-read',
      '--allow-fixture-execution',
      '--allow-fixed-patch',
      '--patch-sha256',
      f.preview.patchSha256,
    ],
    { windowsHide: true, stdio: 'ignore' },
  );
  const closed = once(child, 'close');
  const marker = join(f.root, 'evidence', 'patch-dispatch.json');
  try {
    const deadline = Date.now() + 60000;
    while (
      !existsSync(marker) &&
      child.exitCode === null &&
      Date.now() < deadline
    )
      await delay(5);
    expect(existsSync(marker)).toBe(true);
    child.kill('SIGKILL');
    await closed;
    const current = readFileSync(join(f.destination, 'src/add.ts'), 'utf8');
    const reply = await cli([
      'run',
      '--root',
      f.root,
      '--allow-fixture-read',
      '--allow-fixture-execution',
      '--allow-fixed-patch',
      '--patch-sha256',
      f.preview.patchSha256,
    ]);
    if ([BEFORE, AFTER].includes(current)) {
      expect(reply.code, reply.out + reply.err).toBe(2);
      expect(JSON.parse(reply.out)).toMatchObject({
        report: { status: 'blocked', reason: 'pending', stoppedBlock: 'patch' },
        evidence: null,
        review: 'pending',
      });
    } else {
      expect(reply.code).toBe(1);
      expect(JSON.parse(reply.out)).toEqual({ code: 'demo_changed' });
    }
    const store = await openSqlitePersistence(
      join(f.root, 'storage', 'events.sqlite'),
    );
    try {
      expect(
        (
          await store.getAttempt({
            runId: 'synthetic-bugfix',
            blockId: 'patch',
            attemptId: '1',
          })
        )?.status,
      ).toBe('pending');
    } finally {
      await store.close();
    }
    expect(readFileSync(join(f.destination, 'src/add.ts'), 'utf8')).toBe(
      current,
    );
    expect(existsSync(marker)).toBe(true);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await closed;
    }
  }
}, 120000);

it('a contradictory review marker cannot replace the decision confirmed in SQLite/CAS', async () => {
  const f = await prepared(),
    run = await runBugfixDemo(f.root, f.policy);
  if (!run.evidence) throw new Error('fixture');
  expect(
    (await reviewBugfixDemo(f.root, 'approve', run.evidence.sha256, f.policy))
      .report.status,
  ).toBe('succeeded');
  const marker = join(f.root, 'review.json');
  const raw = JSON.parse(readFileSync(marker, 'utf8')) as { decision: string };
  raw.decision = 'discard';
  writeFileSync(marker, JSON.stringify(raw));
  await code(inspectBugfixDemo(f.root, f.policy), 'demo_changed');
  expect(readFileSync(join(f.destination, 'src/add.ts'), 'utf8')).toBe(AFTER);
}, 120000);

it('inspect and run never recreate a missing database from an existing session', async () => {
  const f = await prepared();
  const db = join(f.root, 'storage', 'events.sqlite');
  rmSync(db);
  await code(inspectBugfixDemo(f.root, f.policy), 'demo_changed');
  expect(existsSync(db)).toBe(false);
  await code(runBugfixDemo(f.root, f.policy), 'demo_changed');
  expect(existsSync(db)).toBe(false);
}, 120000);
