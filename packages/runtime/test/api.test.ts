import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import {
  TaskService,
  TaskError,
  authorizeDataDirectory,
  type TaskView,
} from '../examples/api/tasks.ts';
import { startApiServer, type ApiServer } from '../examples/api/server.ts';
import { EXPECTED_DIFF } from '../examples/bugfix/fixture.ts';

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});
function data(): string {
  const dir = mkdtempSync(
    join(realpathSync.native(tmpdir()), 'beonforge-api-'),
  );
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
async function settled(service: TaskService, id: string): Promise<TaskView> {
  for (let i = 0; i < 600; i++) {
    const view = await service.get(id);
    if (view.state !== 'running' && service.busy === null) return view;
    await delay(50);
  }
  throw new Error('task_did_not_settle');
}
const code = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return 'resolved';
  } catch (error) {
    return error instanceof TaskError ? error.code : String(error);
  }
};

it('rejects data directories that are relative, non-canonical or inside the checkout', async () => {
  expect(await code(() => authorizeDataDirectory('relative/dir'))).toBe(
    'task_denied',
  );
  const repo = fileURLToPath(new URL('../../../', import.meta.url)).replace(
    /[\\/]$/,
    '',
  );
  expect(await code(() => authorizeDataDirectory(repo))).toBe('task_denied');
  expect(await code(() => authorizeDataDirectory(join(repo, 'packages')))).toBe(
    'task_denied',
  );
  expect(
    await code(() => authorizeDataDirectory(join(data(), 'missing'))),
  ).toBe('task_denied');
});

it('rejects unknown executors, extra and real-dispatch fields before creating anything', async () => {
  const dir = data();
  const service = await TaskService.open(dir);
  cleanup.push(() => service.close());
  for (const body of [
    { schemaVersion: 1, executor: 'codex-real' },
    { schemaVersion: 2, executor: 'synthetic-bugfix' },
    { schemaVersion: 1, executor: 'synthetic-bugfix', binary: 'codex.exe' },
    { schemaVersion: 1, executor: 'synthetic-bugfix', simulated: false },
    { schemaVersion: 1 },
    Object.create({
      schemaVersion: 1,
      executor: 'synthetic-bugfix',
    }) as unknown,
  ])
    expect(await code(() => service.create(body))).toBe('task_invalid');
  expect(await service.list()).toEqual([]);
});

it('runs the M04.1 bugfix task, shows only its own evidence, reviews it and survives restart', async () => {
  const dir = data();
  let service = await TaskService.open(dir);
  const created = await service.create({
    schemaVersion: 1,
    executor: 'synthetic-bugfix',
  });
  expect(created).toMatchObject({
    state: 'prepared',
    simulated: true,
    tests: [],
    diff: null,
    proposal: null,
    review: { status: 'not_available' },
    integration: 'not_performed',
  });
  expect(created.steps.map((s) => s.status)).toEqual(
    Array(4).fill('not_started'),
  );
  const patch = created.preview?.patchSha256 ?? '';
  expect(patch).toMatch(/^[a-f0-9]{64}$/);

  expect(
    await code(() =>
      service.run(created.id, {
        schemaVersion: 1,
        confirmPatchSha256: '0'.repeat(64),
      }),
    ),
  ).toBe('task_denied');
  expect(await code(() => service.run(created.id, { schemaVersion: 1 }))).toBe(
    'task_invalid',
  );
  const running = await service.run(created.id, {
    schemaVersion: 1,
    confirmPatchSha256: patch,
  });
  expect(running.state).toBe('running');
  expect(
    await code(() =>
      service.create({ schemaVersion: 1, executor: 'synthetic-bugfix' }),
    ),
  ).toBe('task_busy');

  const done = await settled(service, created.id);
  expect(done).toMatchObject({
    state: 'succeeded',
    review: { status: 'pending' },
    lastError: null,
  });
  expect(done.tests.map((t) => [t.phase, t.exitCode, t.assertion])).toEqual([
    ['red', 1, 'synthetic-add-2-plus-2'],
    ['green', 0, 'synthetic-add-2-plus-2'],
  ]);
  expect(
    done.diff?.text.replace(/^index [a-f0-9]+\.\.[a-f0-9]+ 100644\n/m, ''),
  ).toBe(EXPECTED_DIFF);
  expect(
    await code(() =>
      service.run(created.id, { schemaVersion: 1, confirmPatchSha256: patch }),
    ),
  ).toBe('task_conflict');

  // Restart: a new service instance derives everything from SQLite/CAS on disk.
  await service.close();
  service = await TaskService.open(dir);
  cleanup.push(() => service.close());
  const reopened = await service.get(created.id);
  expect({ ...reopened, lastError: null }).toEqual({
    ...done,
    lastError: null,
  });

  const evidence = reopened.diff?.evidenceSha256 ?? '';
  expect(
    await code(() =>
      service.review(created.id, {
        schemaVersion: 1,
        decision: 'approve',
        evidenceSha256: '1'.repeat(64),
      }),
    ),
  ).toBe('task_denied');
  expect(
    await code(() =>
      service.review(created.id, {
        schemaVersion: 1,
        decision: 'merge',
        evidenceSha256: evidence,
      }),
    ),
  ).toBe('task_invalid');
  await service.review(created.id, {
    schemaVersion: 1,
    decision: 'approve',
    evidenceSha256: evidence,
  });
  const reviewed = await settled(service, created.id);
  expect(reviewed.review).toEqual({ status: 'confirmed', decision: 'approve' });
  expect(reviewed.state).toBe('succeeded');
  expect(reviewed.integration).toBe('not_performed');
  expect(
    await code(() =>
      service.review(created.id, {
        schemaVersion: 1,
        decision: 'discard',
        evidenceSha256: evidence,
      }),
    ),
  ).toBe('task_conflict');
}, 120000);

it('discards a bugfix task explicitly through M04.1 review', async () => {
  const service = await TaskService.open(data());
  cleanup.push(() => service.close());
  const created = await service.create({
    schemaVersion: 1,
    executor: 'synthetic-bugfix',
  });
  await service.run(created.id, {
    schemaVersion: 1,
    confirmPatchSha256: created.preview?.patchSha256,
  });
  const done = await settled(service, created.id);
  await service.review(created.id, {
    schemaVersion: 1,
    decision: 'discard',
    evidenceSha256: done.diff?.evidenceSha256,
  });
  const reviewed = await settled(service, created.id);
  expect(reviewed.review).toEqual({ status: 'confirmed', decision: 'discard' });
  // Historical green evidence remains; it is not merged with the discard.
  expect(reviewed.tests.map((t) => t.phase)).toEqual(['red', 'green']);
}, 120000);

it('runs the c.2 simulated Codex task with proposal-only evidence and survives restart', async () => {
  const dir = data();
  let service = await TaskService.open(dir);
  const created = await service.create({
    schemaVersion: 1,
    executor: 'codex-simulated',
  });
  expect(created.state).toBe('prepared');
  expect(
    await code(() =>
      service.run(created.id, {
        schemaVersion: 1,
        confirmPatchSha256: created.preview?.patchSha256,
      }),
    ),
  ).toBe('task_invalid');
  const both = await Promise.allSettled([
    service.run(created.id, { schemaVersion: 1 }),
    service.run(created.id, { schemaVersion: 1 }),
  ]);
  expect(both.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
  const done = await settled(service, created.id);
  expect(done).toMatchObject({
    state: 'succeeded',
    tests: [],
    diff: null,
    review: { status: 'not_available' },
    steps: [{ blockId: 'codex-run', status: 'succeeded' }],
  });
  expect(done.proposal).toMatchObject({
    baseCommit: created.preview?.baseCommit,
    path: 'src/add.ts',
    preimageSha256: created.preview?.beforeSha256,
    contentSha256: created.preview?.afterSha256,
    matchesKnownPostimage: true,
  });
  expect(await code(() => service.run(created.id, { schemaVersion: 1 }))).toBe(
    'task_conflict',
  );
  expect(
    await code(() =>
      service.review(created.id, {
        schemaVersion: 1,
        decision: 'approve',
        evidenceSha256: done.proposal?.evidenceSha256,
      }),
    ),
  ).toBe('task_invalid');
  await service.close();
  service = await TaskService.open(dir);
  cleanup.push(() => service.close());
  expect({ ...(await service.get(created.id)), lastError: null }).toEqual({
    ...done,
    lastError: null,
  });
}, 120000);

it('backend shutdown during a run never yields a retryable started task after reopening', async () => {
  const dir = data();
  let service = await TaskService.open(dir);
  const created = await service.create({
    schemaVersion: 1,
    executor: 'synthetic-bugfix',
  });
  await service.run(created.id, {
    schemaVersion: 1,
    confirmPatchSha256: created.preview?.patchSha256,
  });
  await delay(200);
  await service.close(); // Cooperative abort, then wait for settlement.
  service = await TaskService.open(dir);
  cleanup.push(() => service.close());
  const reopened = await service.get(created.id);
  const started = reopened.steps.some((s) => s.status !== 'not_started');
  expect(reopened.state).not.toBe('running');
  if (started) {
    expect(reopened.state).not.toBe('prepared');
    expect(
      await code(() =>
        service.run(created.id, {
          schemaVersion: 1,
          confirmPatchSha256: created.preview?.patchSha256,
        }),
      ),
    ).toBe('task_conflict');
  } else expect(reopened.state).toBe('prepared');
}, 120000);

function call(
  server: ApiServer,
  method: string,
  path: string,
  options: { headers?: Record<string, string>; body?: string } = {},
): Promise<{
  status: number;
  json: unknown;
  headers: Record<string, unknown>;
}> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: server.port,
        method,
        path,
        headers: { Host: `127.0.0.1:${server.port}`, ...options.headers },
      },
      (res) => {
        let text = '';
        res.on('data', (c: Buffer) => (text += c.toString()));
        res.on('end', () => {
          let json: unknown = null;
          try {
            json = JSON.parse(text);
          } catch {
            json = text;
          }
          resolve({ status: res.statusCode ?? 0, json, headers: res.headers });
        });
      },
    );
    req.on('error', reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

it('serves the API only to its own loopback origin with a session token and strict bodies', async () => {
  const server = await startApiServer({
    dataDirectory: data(),
    port: 0,
    webRoot: null,
  });
  cleanup.push(() => server.close());
  expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  const session = await call(server, 'GET', '/api/v1/session');
  expect(session.status).toBe(200);
  expect(session.headers['content-security-policy']).toContain(
    "default-src 'self'",
  );
  expect(session.headers['access-control-allow-origin']).toBeUndefined();
  const token = (session.json as { token: string }).token;
  const json = {
    'Content-Type': 'application/json',
    'X-BeonForge-Token': token,
  };

  expect(
    (
      await call(server, 'GET', '/api/v1/session', {
        headers: { Host: 'evil.example:80' },
      })
    ).status,
  ).toBe(421);
  expect(
    (
      await call(server, 'GET', '/api/v1/tasks', {
        headers: { ...json, Origin: 'http://evil.example' },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await call(server, 'GET', '/api/v1/tasks', {
        headers: { ...json, 'Sec-Fetch-Site': 'cross-site' },
      })
    ).status,
  ).toBe(403);
  expect((await call(server, 'GET', '/api/v1/tasks')).status).toBe(401);
  expect(
    (
      await call(server, 'GET', '/api/v1/tasks', {
        headers: { 'X-BeonForge-Token': 'f'.repeat(64) },
      })
    ).status,
  ).toBe(401);
  const post = (body: string, headers = json) =>
    call(server, 'POST', '/api/v1/tasks', { headers, body });
  expect(
    (
      await post('{"schemaVersion":1,"executor":"synthetic-bugfix"}', {
        ...json,
        'Content-Type': 'text/plain',
      })
    ).status,
  ).toBe(415);
  expect((await post('x'.repeat(5000))).status).toBe(413);
  expect((await post('{not json')).status).toBe(400);
  expect(
    (
      await post(
        '{"schemaVersion":1,"executor":"synthetic-bugfix","codexHome":"C:/x"}',
      )
    ).json,
  ).toEqual({ error: 'task_invalid' });
  expect((await post('{"schemaVersion":1,"executor":"real"}')).status).toBe(
    400,
  );
  expect(
    (
      await call(
        server,
        'GET',
        '/api/v1/tasks/bugfix-00000000-0000-0000-0000-000000000000',
        { headers: json },
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await call(server, 'GET', '/api/v1/tasks/..%2F..%2Fetc', {
        headers: json,
      })
    ).status,
  ).toBe(404);
  expect(
    (await call(server, 'GET', '/api/v1/executors', { headers: json })).json,
  ).toMatchObject({
    executors: [
      { id: 'synthetic-bugfix', simulated: true },
      { id: 'codex-simulated', simulated: true },
    ],
  });
  expect((await call(server, 'GET', '/index.html')).status).toBe(404);
});

it('creates, runs and reads a task over HTTP and the new process sees it after restart', async () => {
  const dir = data();
  let server = await startApiServer({
    dataDirectory: dir,
    port: 0,
    webRoot: null,
  });
  const token = (
    (await call(server, 'GET', '/api/v1/session')).json as { token: string }
  ).token;
  const headers = {
    'Content-Type': 'application/json',
    'X-BeonForge-Token': token,
  };
  const created = await call(server, 'POST', '/api/v1/tasks', {
    headers,
    body: '{"schemaVersion":1,"executor":"codex-simulated"}',
  });
  expect(created.status).toBe(201);
  const id = (created.json as TaskView).id;
  expect(
    (
      await call(server, 'POST', `/api/v1/tasks/${id}/run`, {
        headers,
        body: '{"schemaVersion":1}',
      })
    ).status,
  ).toBe(202);
  let view: TaskView | null = null;
  for (let i = 0; i < 400 && view?.state !== 'succeeded'; i++) {
    await delay(50);
    view = (await call(server, 'GET', `/api/v1/tasks/${id}`, { headers }))
      .json as TaskView;
  }
  expect(view?.state).toBe('succeeded');
  await server.close();
  server = await startApiServer({ dataDirectory: dir, port: 0, webRoot: null });
  cleanup.push(() => server.close());
  const fresh = (
    (await call(server, 'GET', '/api/v1/session')).json as { token: string }
  ).token;
  expect(fresh).not.toBe(token);
  const list = (
    await call(server, 'GET', '/api/v1/tasks', {
      headers: { 'X-BeonForge-Token': fresh },
    })
  ).json as { tasks: TaskView[] };
  expect(
    list.tasks.map((t) => [t.id, t.state, t.proposal?.matchesKnownPostimage]),
  ).toEqual([[id, 'succeeded', true]]);
  expect(
    (
      await call(server, 'GET', '/api/v1/tasks', {
        headers: { 'X-BeonForge-Token': token },
      })
    ).status,
  ).toBe(401);
}, 120000);
