import { it, expect, afterEach } from 'vitest';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  openSqlitePersistence,
  type DurableStore,
} from '@beonforge/persistence';
import {
  previewSimulatedRequest,
  runSimulatedProcess,
  inspectSimulatedProcess,
  type SimulatedRequest,
  type SimulatedGrant,
} from '../examples/simulated/supervisor.ts';

const temp = realpathSync(tmpdir());
const roots: { root: string; store: DurableStore }[] = [];
const payload = Buffer.from(
  JSON.stringify({
    schemaVersion: 1,
    baseCommit: 'a'.repeat(40),
    preimageSha256: 'b'.repeat(64),
  }),
);
async function setup(request: SimulatedRequest = { mode: 'success', payload }) {
  const root = mkdtempSync(join(temp, 'beonforge-supervisor-'));
  const path = join(root, 'events.sqlite');
  const store = await openSqlitePersistence(path);
  roots.push({ root, store });
  const grant: SimulatedGrant = {
    runId: 'run',
    canRead: true,
    canRun: true,
    requestSha256: previewSimulatedRequest(request),
  };
  return { root, path, store, grant, request };
}
afterEach(async () => {
  for (const { root, store } of roots.splice(0)) {
    await store.close();
    expect(dirname(realpathSync(root))).toBe(temp);
    rmSync(root, { recursive: true });
  }
});

it('SIGKILL supervisor closes the lifelined direct child and leaves pending without replay', async () => {
  const f = await setup({ mode: 'wait', payload });
  const driver = fileURLToPath(
    new URL('./fixtures/supervisor-crash.mjs', import.meta.url),
  );
  const child = spawn(process.execPath, [driver, f.path], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    env: { SystemRoot: process.env.SystemRoot },
    windowsHide: true,
  });
  let pid: number | undefined;
  const closed = once(child, 'close');
  const timeout = setTimeout(() => child.kill('SIGKILL'), 10000);
  try {
    const message: unknown = await new Promise((resolve) =>
      child.once('message', (value: unknown) => resolve(value)),
    );
    pid = (message as { pid: number }).pid;
    expect(Number.isSafeInteger(pid)).toBe(true);
    child.kill('SIGKILL');
    await closed;
    let alive = true;
    for (let i = 0; i < 100; i++) {
      try {
        process.kill(pid, 0);
      } catch {
        alive = false;
        break;
      }
      await delay(20);
    }
    if (alive) process.kill(pid, 'SIGKILL');
    expect(alive).toBe(false);
    await f.store.close();
    f.store = await openSqlitePersistence(f.path);
    roots[0]!.store = f.store;
    expect(
      (await inspectSimulatedProcess(f.store, 'run', f.grant)).attempt?.status,
    ).toBe('pending');
    expect(
      (await runSimulatedProcess(f.store, 'run', f.request, f.grant)).status,
    ).toBe('blocked');
  } finally {
    clearTimeout(timeout);
    child.kill('SIGKILL');
    await closed;
  }
}, 15000);

it('Node child-process permission is denied rather than claiming arbitrary descendant management', async () => {
  const code =
    "import{spawnSync}from'node:child_process';import process from'node:process';try{spawnSync(process.execPath,['-e','']);process.exitCode=1}catch(e){if(e.code==='ERR_ACCESS_DENIED')process.stdout.write('denied');else process.exitCode=2}";
  const output = await new Promise<string>((resolve, reject) =>
    execFile(
      process.execPath,
      ['--permission', '--input-type=module', '-e', code],
      {
        timeout: 5000,
        maxBuffer: 1024,
        env: { SystemRoot: process.env.SystemRoot },
      },
      (e, out) =>
        e ? reject(new Error('permission_probe_failed')) : resolve(out),
    ),
  );
  expect(output).toBe('denied');
});
async function report(store: DurableStore, grant: SimulatedGrant) {
  const r = await inspectSimulatedProcess(store, 'run', grant);
  return JSON.parse(Buffer.from(r.evidence[0]!.bytes).toString()) as {
    reason: string;
    closed: boolean;
    proposal: string | null;
    stdoutBytes: number;
    chunks: number;
  };
}

it('authorized process succeeds, persists evidence and recovers without another dispatch', async () => {
  const f = await setup();
  expect(
    (await runSimulatedProcess(f.store, 'run', f.request, f.grant)).status,
  ).toBe('succeeded');
  expect(await report(f.store, f.grant)).toMatchObject({
    reason: 'ok',
    closed: true,
  });
  const events = (await f.store.readEvents()).length;
  await f.store.close();
  f.store = await openSqlitePersistence(f.path);
  roots[0]!.store = f.store;
  expect(
    (await runSimulatedProcess(f.store, 'run', f.request, f.grant)).status,
  ).toBe('succeeded');
  expect((await f.store.readEvents()).length).toBe(events);
  const reader = fileURLToPath(
    new URL('./fixtures/supervisor-reader.mjs', import.meta.url),
  );
  const output = await new Promise<string>((resolve, reject) =>
    execFile(
      process.execPath,
      [reader, f.path],
      {
        env: { SystemRoot: process.env.SystemRoot },
        timeout: 10000,
        maxBuffer: 65536,
      },
      (e, out) => (e ? reject(new Error('reader_failed')) : resolve(out)),
    ),
  );
  expect(JSON.parse(output)).toEqual({
    status: 'succeeded',
    reason: 'ok',
    closed: true,
  });
});
it.each(['invalid-json', 'fail'] as const)(
  'rejects %s and confirms child closure',
  async (mode) => {
    const f = await setup({ mode, payload });
    expect(
      (await runSimulatedProcess(f.store, 'run', f.request, f.grant)).status,
    ).toBe('failed');
    expect((await report(f.store, f.grant)).closed).toBe(true);
  },
);
it('fragmented canonical UTF8 proposal is verified incrementally', async () => {
  const f = await setup({ mode: 'fragmented', payload });
  expect(
    (await runSimulatedProcess(f.store, 'run', f.request, f.grant)).status,
  ).toBe('succeeded');
  expect((await report(f.store, f.grant)).chunks).toBeGreaterThan(1);
});
it('output exact boundary accepted and one byte below rejected with child closed', async () => {
  const first = await setup();
  await runSimulatedProcess(first.store, 'run', first.request, first.grant);
  const bytes = (await report(first.store, first.grant)).stdoutBytes;
  for (const limit of [bytes, bytes - 1]) {
    const f = await setup({ mode: 'success', payload, maxOutputBytes: limit });
    const r = await runSimulatedProcess(f.store, 'run', f.request, f.grant);
    expect(r.status).toBe(limit === bytes ? 'succeeded' : 'failed');
    expect(await report(f.store, f.grant)).toMatchObject({
      reason: limit === bytes ? 'ok' : 'output_limit',
      closed: true,
    });
  }
});
it('exact 65536-byte input allowed, oversize rejected before writes', async () => {
  const exact = Buffer.concat([
    payload,
    Buffer.alloc(65536 - payload.length, 32),
  ]);
  const f = await setup({ mode: 'success', payload: exact });
  expect(
    (await runSimulatedProcess(f.store, 'run', f.request, f.grant)).status,
  ).toBe('succeeded');
  expect(() =>
    previewSimulatedRequest({
      mode: 'success',
      payload: Buffer.concat([exact, Buffer.from(' ')]),
    }),
  ).toThrow('simulation_invalid');
});
it.each([
  Buffer.from([255]),
  Buffer.from('null'),
  Buffer.concat([Buffer.from([239, 187, 191]), payload]),
  Buffer.from(
    payload
      .toString()
      .replace('"schemaVersion":1', '"schemaVersion":0,"schemaVersion":1'),
  ),
])('invalid input/BOM/duplicates fail before persistence', async (bytes) => {
  const f = await setup();
  await expect(
    runSimulatedProcess(
      f.store,
      'run',
      { mode: 'success', payload: bytes },
      f.grant,
    ),
  ).rejects.toThrow('simulation_invalid');
  expect(await f.store.readEvents()).toHaveLength(0);
});
it('own explicit grants, exact binding and revocation required', async () => {
  const f = await setup();
  for (const grant of [
    { ...f.grant, canRun: false },
    { ...f.grant, requestSha256: '0'.repeat(64) },
    Object.create(f.grant) as SimulatedGrant,
  ])
    await expect(
      runSimulatedProcess(f.store, 'run', f.request, grant),
    ).rejects.toThrow('simulation_denied');
  expect(await f.store.readEvents()).toHaveLength(0);
  const revoke = new Proxy(f.store, {
    get(target, key) {
      if (key === 'putArtifact')
        return async (bytes: Uint8Array) => {
          const ref = await target.putArtifact(bytes);
          f.grant.canRun = false;
          return ref;
        };
      const v: unknown = Reflect.get(target, key);
      return typeof v === 'function'
        ? (v as (...args: unknown[]) => unknown).bind(target)
        : v;
    },
  });
  await expect(
    runSimulatedProcess(revoke, 'run', f.request, f.grant),
  ).resolves.toMatchObject({ status: 'failed' });
  expect((await report(f.store, f.grant)).stdoutBytes).toBe(0);
});
it('timeout and cancellation close supported direct child, no orphan or retry', async () => {
  for (const cancel of [false, true]) {
    const f = await setup({ mode: 'wait', payload, timeoutMs: 300 });
    const c = new AbortController();
    const timer = cancel ? setTimeout(() => c.abort(), 100) : undefined;
    try {
      const r = await runSimulatedProcess(
        f.store,
        'run',
        f.request,
        f.grant,
        c.signal,
      );
      expect(['failed', 'cancelled']).toContain(r.status);
      expect(await report(f.store, f.grant)).toMatchObject({
        reason: cancel ? 'cancelled' : 'timeout',
        closed: true,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
});
it('lost finish after actual process effect persists pending and blocks redispatch', async () => {
  const f = await setup();
  const broken = new Proxy(f.store, {
    get(target, key) {
      if (key === 'append')
        return async (...args: Parameters<DurableStore['append']>) => {
          if (
            args[0].type === 'block.finished' &&
            args[0].result.blockId === 'process'
          )
            throw new Error('lost_finish');
          return target.append(...args);
        };
      const v: unknown = Reflect.get(target, key);
      return typeof v === 'function'
        ? (v as (...args: unknown[]) => unknown).bind(target)
        : v;
    },
  });
  await expect(
    runSimulatedProcess(broken, 'run', f.request, f.grant),
  ).rejects.toThrow();
  await f.store.close();
  f.store = await openSqlitePersistence(f.path);
  roots[0]!.store = f.store;
  expect(
    (await runSimulatedProcess(f.store, 'run', f.request, f.grant)).status,
  ).toBe('blocked');
  expect(
    (await inspectSimulatedProcess(f.store, 'run', f.grant)).attempt?.status,
  ).toBe('pending');
});

it('live revocation stops a waiting child, and another dispatch is refused while active', async () => {
  const f = await setup({ mode: 'wait', payload, timeoutMs: 1000 });
  const timer = setTimeout(() => {
    f.grant.canRun = false;
  }, 150);
  try {
    const first = runSimulatedProcess(f.store, 'run', f.request, f.grant);
    await delay(75);
    await expect(
      runSimulatedProcess(f.store, 'run', f.request, f.grant),
    ).rejects.toThrow('simulation_busy');
    expect((await first).status).toBe('failed');
    expect(await report(f.store, f.grant)).toMatchObject({
      reason: 'denied',
      closed: true,
    });
    f.grant.canRead = false;
    await expect(
      inspectSimulatedProcess(f.store, 'run', f.grant),
    ).rejects.toThrow('simulation_denied');
  } finally {
    clearTimeout(timer);
  }
});
it('getters do not authorize dispatch and cancellation before dispatch creates no child', async () => {
  const f = await setup();
  let accessed = false;
  const grant = { ...f.grant };
  Object.defineProperty(grant, 'canRun', {
    get() {
      accessed = true;
      return true;
    },
  });
  await expect(
    runSimulatedProcess(f.store, 'run', f.request, grant),
  ).rejects.toThrow('simulation_denied');
  expect(accessed).toBe(false);
  expect(await f.store.readEvents()).toHaveLength(0);
  const c = new AbortController();
  c.abort();
  await runSimulatedProcess(f.store, 'run', f.request, f.grant, c.signal);
  expect(await report(f.store, f.grant)).toMatchObject({
    reason: 'cancelled',
    stdoutBytes: 0,
    closed: true,
  });
});
