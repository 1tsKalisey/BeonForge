import { fork, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { open as openFile } from 'node:fs/promises';
import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { afterEach, expect, it } from 'vitest';
import { openSqlitePersistence } from '@beonforge/persistence';
import { executeWorkflow, type BlockHandler } from '@beonforge/runtime';

const temporary = realpathSync(tmpdir());
const roots: string[] = [];
const children = new Set<ChildProcess>();
function fixture() {
  const root = mkdtempSync(join(temporary, 'beonforge-workflow-demo-'));
  roots.push(root);
  return root;
}
afterEach(async () => {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await once(child, 'exit');
    }
  }
  children.clear();
  for (const root of roots.splice(0)) {
    expect(dirname(realpathSync(root))).toBe(temporary);
    rmSync(root, { recursive: true, force: true });
  }
});
function workflow(handler: string, effects: 'none' | 'external' = 'none') {
  return {
    schemaVersion: 1,
    nodes: ['a', 'b'].map((blockId, i) => ({
      manifest: {
        schemaVersion: 1,
        blockId,
        handler,
        handlerVersion: 1,
        inputs: [],
        effects,
      },
      dependsOn: i ? ['a'] : [],
    })),
  };
}
async function runCli(
  args: string[],
  interrupt?: 'after-report' | 'before-runtime',
) {
  const child = spawn(
    process.execPath,
    [
      ...(interrupt
        ? [
            '--import',
            new URL('./fixtures/interrupt-cli.mjs', import.meta.url).href,
          ]
        : []),
      fileURLToPath(new URL('../dist/cli.js', import.meta.url)),
      ...args,
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BEONFORGE_INTERRUPT_STAGE: interrupt ?? '' },
    },
  );
  children.add(child);
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk: Uint8Array) => {
    stdout += Buffer.from(chunk).toString();
  });
  child.stderr?.on('data', (chunk: Uint8Array) => {
    stderr += Buffer.from(chunk).toString();
  });
  const exit: unknown = await once(child, 'exit', {
    signal: AbortSignal.timeout(15000),
  });
  return {
    code: Array.isArray(exit) ? (exit[0] as unknown) : undefined,
    stdout,
    stderr,
  };
}

it.each(['missing-file', 'missing-parent', 'existing-artifacts'] as const)(
  'P3-3 inspect rejects %s without initializing any store',
  async (kind) => {
    const root = fixture();
    const path =
      kind === 'missing-parent'
        ? join(root, 'missing', 'events.sqlite')
        : join(root, 'events.sqlite');
    if (kind === 'existing-artifacts') {
      mkdirSync(`${path}.artifacts`, { mode: 0o700 });
      writeFileSync(join(`${path}.artifacts`, 'sentinel'), 'keep');
    }
    const before = readdirSync(root, { recursive: true }).sort();
    const result = await runCli(['inspect', '--db', path, '--run', 'missing']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('database_not_found');
    expect(result.stdout).toBe('');
    expect(existsSync(path)).toBe(false);
    expect(readdirSync(root, { recursive: true }).sort()).toEqual(before);
  },
);

it.each(['empty-file', 'directory'] as const)(
  'P3-3 inspect does not initialize an %s as a database',
  async (kind) => {
    const root = fixture();
    const path = join(root, 'events.sqlite');
    if (kind === 'empty-file') writeFileSync(path, '');
    else mkdirSync(path, { mode: 0o700 });
    const result = await runCli(['inspect', '--db', path, '--run', 'invalid']);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(existsSync(`${path}.artifacts`)).toBe(false);
    if (kind === 'empty-file') expect(readFileSync(path).byteLength).toBe(0);
    else expect(readdirSync(path)).toEqual([]);
  },
);

it('P3-3 inspect still reads an existing initialized store', async () => {
  const root = fixture();
  const path = join(root, 'events.sqlite');
  const file = join(root, 'workflow.json');
  writeFileSync(file, JSON.stringify(workflow('fixture.seed')));
  expect(
    (
      await runCli([
        'run',
        '--db',
        path,
        '--run',
        'existing',
        '--workflow',
        file,
      ])
    ).code,
  ).toBe(0);
  const before = readdirSync(`${path}.artifacts`, { recursive: true }).sort();
  const result = await runCli(['inspect', '--db', path, '--run', 'existing']);
  expect(result.code, result.stderr).toBe(0);
  expect(result.stdout.trim().split('\n')).toHaveLength(6);
  expect(readdirSync(`${path}.artifacts`, { recursive: true }).sort()).toEqual(
    before,
  );
});

it.each([
  ['fixture.seed', 'succeeded', 0],
  ['fixture.fail', 'failed', 1],
  ['fixture.wait', 'blocked', 2],
] as const)(
  'P3-2 uses the actual %s report before a late abort signal',
  async (handler, status, code) => {
    const root = fixture();
    const path = join(root, 'events.sqlite');
    const file = join(root, 'workflow.json');
    writeFileSync(file, JSON.stringify(workflow(handler)));
    const result = await runCli(
      [
        'run',
        '--db',
        path,
        '--run',
        'signal',
        '--workflow',
        file,
        '--timeout-ms',
        '20',
      ],
      'after-report',
    );
    expect(JSON.parse(result.stdout) as unknown).toMatchObject({ status });
    expect(result.code, result.stderr).toBe(code);
  },
);

it('P3-2 keeps exit 130 for an applicable cancellation before execution', async () => {
  const root = fixture();
  const path = join(root, 'events.sqlite');
  const file = join(root, 'workflow.json');
  writeFileSync(file, JSON.stringify(workflow('fixture.seed')));
  const result = await runCli(
    ['run', '--db', path, '--run', 'signal', '--workflow', file],
    'before-runtime',
  );
  expect(result.code, result.stderr).toBe(130);
  expect(JSON.parse(result.stdout) as unknown).toMatchObject({
    status: 'cancelled',
    cancellationPersisted: null,
  });
});

it.each([
  '1e3',
  '0x3e8',
  '1.0',
  '+1000',
  ' 1000',
  '1000 ',
  '01000',
  '0',
  '-1',
  '2147483648',
  'Infinity',
  'NaN',
])(
  'P3-2 rejects noncanonical/out-of-range timeout %s before creating storage',
  async (timeout) => {
    const root = fixture();
    const path = join(root, 'events.sqlite');
    const file = join(root, 'workflow.json');
    writeFileSync(file, JSON.stringify(workflow('fixture.seed')));
    const result = await runCli([
      'run',
      '--db',
      path,
      '--run',
      'invalid-timeout',
      '--workflow',
      file,
      '--timeout-ms',
      timeout,
    ]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('invalid_options');
    expect(existsSync(path)).toBe(false);
    expect(existsSync(`${path}.artifacts`)).toBe(false);
  },
);

it.each(['1', '2147483647'])(
  'P3-2 accepts the canonical timeout boundary %s',
  async (timeout) => {
    const root = fixture();
    const path = join(root, 'events.sqlite');
    const file = join(root, 'workflow.json');
    writeFileSync(file, JSON.stringify(workflow('fixture.seed')));
    const result = await runCli([
      'run',
      '--db',
      path,
      '--run',
      'bounds',
      '--workflow',
      file,
      '--timeout-ms',
      timeout,
    ]);
    expect(result.code, result.stderr).toBe(0);
  },
);

it.each(['after-finish', 'after-checkpoint', 'inside-effect'] as const)(
  'demonstrates real SIGKILL and safe resume at %s',
  async (mode) => {
    const root = fixture();
    const path = join(root, 'events.sqlite');
    const input = workflow('fixture.receipt', 'external');
    writeFileSync(join(root, 'workflow.json'), JSON.stringify(input));
    const child = fork(
      new URL('./fixtures/crash-workflow.mjs', import.meta.url),
      [root, mode],
      { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
    );
    children.add(child);
    let stderr = '';
    child.stderr?.on('data', (chunk: Uint8Array) => {
      stderr += Buffer.from(chunk).toString();
    });
    const exited = once(child, 'exit');
    const message: unknown = await Promise.race([
      once(child, 'message', { signal: AbortSignal.timeout(10000) }),
      exited.then(() => {
        throw new Error(`Child failed: ${stderr}`);
      }),
    ]);
    expect(Array.isArray(message) ? (message[0] as unknown) : null).toEqual({
      phase: mode,
    });
    child.kill('SIGKILL');
    await exited;
    expect(readFileSync(join(root, 'barrier'), 'utf8')).toBe(mode);
    expect(readFileSync(join(root, 'a.receipt'), 'utf8')).toBe('a');
    let calls = 0;
    const store = await openSqlitePersistence(path);
    try {
      const handler: BlockHandler = {
        name: 'fixture.receipt',
        version: 1,
        effects: 'external',
        async execute({ inputs }) {
          calls++;
          const id = inputs.length ? 'b' : 'a';
          const receipt = await openFile(
            join(root, `${id}.receipt`),
            'wx',
            0o600,
          );
          try {
            await receipt.writeFile(id);
            await receipt.sync();
          } finally {
            await receipt.close();
          }
          return { status: 'succeeded', outputs: [Buffer.from(id)] };
        },
      };
      const before = await store.readEvents();
      const resumed = await executeWorkflow(store, 'demo', input, [handler], {
        external: ['a', 'b'],
        retryFailed: ['a', 'b'],
      });
      if (mode === 'inside-effect') {
        expect(resumed).toMatchObject({
          status: 'blocked',
          reason: 'pending',
          stoppedBlock: 'b',
        });
        expect(calls).toBe(0);
        expect(await store.readEvents()).toEqual(before);
      } else {
        expect(resumed.status).toBe('succeeded');
        expect(calls).toBe(1);
        if (mode === 'after-finish') expect(resumed.tailEvents).toBe(2);
        else expect(resumed.recoveredFrom).toBe(4);
        const done = await store.readEvents();
        expect(done).toHaveLength(6);
        expect(
          (
            await executeWorkflow(store, 'demo', input, [handler], {
              external: ['a', 'b'],
            })
          ).status,
        ).toBe('succeeded');
        expect(await store.readEvents()).toEqual(done);
        expect(calls).toBe(1);
      }
      expect(readFileSync(join(root, 'b.receipt'), 'utf8')).toBe('b');
      expect(
        readdirSync(root)
          .filter((name) => name.endsWith('.receipt'))
          .sort(),
      ).toEqual(['a.receipt', 'b.receipt']);
      console.info(
        JSON.stringify({
          cut: mode,
          recovered: resumed.status,
          reason: resumed.reason,
          recoveredFrom: resumed.recoveredFrom,
          tailEvents: resumed.tailEvents,
          reexecutedConfirmed: 0,
          resumedEffects: calls,
          receipts: 2,
        }),
      );
    } finally {
      await store.close();
    }
  },
  20000,
);

it('runs the compiled CLI, inspects durable events and reopens without duplicate execution', async () => {
  const root = fixture();
  const path = join(root, 'events.sqlite');
  const file = join(root, 'workflow.json');
  writeFileSync(file, JSON.stringify(workflow('fixture.seed')));
  const args = ['run', '--db', path, '--run', 'cli', '--workflow', file];
  const first = await runCli(args);
  expect(first.code, first.stderr).toBe(0);
  const report: unknown = JSON.parse(first.stdout);
  expect(report).toMatchObject({ status: 'succeeded', completed: ['a', 'b'] });
  const second = await runCli(args);
  expect(second.code, second.stderr).toBe(0);
  expect(JSON.parse(second.stdout) as unknown).toMatchObject({
    status: 'succeeded',
    recoveredFrom: 6,
    tailEvents: 0,
  });
  const inspected = await runCli(['inspect', '--db', path, '--run', 'cli']);
  expect(inspected.code, inspected.stderr).toBe(0);
  expect(inspected.stdout.trim().split('\n')).toHaveLength(6);
  expect(inspected.stdout).not.toContain('BeonForge\\n');
});

it('CLI rejects invalid input and unsupported/external handlers without reporting success', async () => {
  const root = fixture();
  const path = join(root, 'events.sqlite');
  const file = join(root, 'workflow.json');
  writeFileSync(file, '{broken-json');
  expect(
    (await runCli(['run', '--db', path, '--run', 'cli', '--workflow', file]))
      .code,
  ).toBe(1);
  expect(existsSync(path)).toBe(false);
  writeFileSync(file, JSON.stringify(workflow('not-registered', 'external')));
  const missing = await runCli([
    'run',
    '--db',
    path,
    '--run',
    'cli',
    '--workflow',
    file,
    '--external',
    'a,b',
  ]);
  expect(missing.code).toBe(1);
  expect(missing.stderr).toContain('handler_mismatch');
  const duplicate = await runCli([
    'inspect',
    '--db',
    path,
    '--run',
    'cli',
    '--run',
    'cli',
  ]);
  expect(duplicate.code).toBe(1);
  expect(duplicate.stderr).toContain('invalid_options');
});

it('CLI persists a known fixture failure and requires explicit retry', async () => {
  const root = fixture();
  const path = join(root, 'events.sqlite');
  const file = join(root, 'workflow.json');
  writeFileSync(file, JSON.stringify(workflow('fixture.fail')));
  const args = ['run', '--db', path, '--run', 'failed', '--workflow', file];
  expect((await runCli(args)).code).toBe(1);
  expect((await runCli(args)).code).toBe(1);
  const store = await openSqlitePersistence(path);
  try {
    expect(await store.readEvents()).toHaveLength(4);
  } finally {
    await store.close();
  }
  expect((await runCli([...args, '--retry-failed', 'a'])).code).toBe(1);
  const retry = await openSqlitePersistence(path);
  try {
    expect(await retry.readEvents()).toHaveLength(6);
  } finally {
    await retry.close();
  }
});

it('CLI timeout records uncertainty and a later invocation cannot retry it', async () => {
  const root = fixture();
  const path = join(root, 'events.sqlite');
  const file = join(root, 'workflow.json');
  writeFileSync(file, JSON.stringify(workflow('fixture.wait')));
  const args = ['run', '--db', path, '--run', 'timeout', '--workflow', file];
  const first = await runCli([...args, '--timeout-ms', '20']);
  expect(first.code, first.stderr).toBe(2);
  expect(JSON.parse(first.stdout) as unknown).toMatchObject({
    status: 'blocked',
    reason: 'uncertain',
  });
  const second = await runCli([...args, '--retry-failed', 'a']);
  expect(second.code, second.stderr).toBe(2);
  expect(JSON.parse(second.stdout) as unknown).toMatchObject({
    reason: 'uncertain',
  });
  const store = await openSqlitePersistence(path);
  try {
    expect(await store.readEvents()).toHaveLength(4);
  } finally {
    await store.close();
  }
});
