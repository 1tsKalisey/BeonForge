import { expect, it } from 'vitest';
import { Api, ApiError, type Task } from './api';
import {
  canReview,
  canRun,
  isActive,
  panels,
  reviewBody,
  reviewLabel,
  runBody,
} from './view';

const hash = (c: string) => c.repeat(64);
function task(overrides: Partial<Task> = {}): Task {
  return {
    schemaVersion: 1,
    id: 'bugfix-00000000-0000-0000-0000-000000000000',
    executor: 'synthetic-bugfix',
    simulated: true,
    createdAt: '2026-11-03T00:00:00.000Z',
    state: 'prepared',
    preview: {
      baseCommit: hash('a').slice(0, 40),
      path: 'src/add.ts',
      beforeSha256: hash('b'),
      afterSha256: hash('c'),
      patchSha256: hash('d'),
    },
    steps: [],
    tests: [],
    diff: null,
    proposal: null,
    review: { status: 'not_available' },
    integration: 'not_performed',
    lastError: null,
    ...overrides,
  };
}

it('shows evidence panels only when the server returned evidence for this task', () => {
  expect(panels(task())).toEqual({
    tests: false,
    diff: false,
    proposal: false,
  });
  expect(
    panels(task({ diff: { text: '', evidenceSha256: hash('e') } })).diff,
  ).toBe(false);
  expect(
    panels(
      task({
        state: 'succeeded',
        tests: [
          {
            phase: 'red',
            assertion: 'a',
            exitCode: 1,
            command: 'x',
            evidenceSha256: hash('1'),
          },
        ],
        diff: { text: 'diff --git', evidenceSha256: hash('e') },
      }),
    ),
  ).toEqual({ tests: true, diff: true, proposal: false });
});

it('confirms exactly the previewed fixed patch and sends no executable or path fields', () => {
  expect(runBody(task())).toEqual({
    schemaVersion: 1,
    confirmPatchSha256: hash('d'),
  });
  expect(runBody(task({ executor: 'codex-simulated' }))).toEqual({
    schemaVersion: 1,
  });
  expect(() => runBody(task({ state: 'succeeded' }))).toThrow(
    'task_not_runnable',
  );
  expect(() => runBody(task({ preview: null }))).toThrow('task_not_runnable');
  expect(canRun(task({ state: 'blocked' }))).toBe(false);
});

it('offers review only for a succeeded bugfix with pending review and its own evidence hash', () => {
  const done = task({
    state: 'succeeded',
    review: { status: 'pending' },
    diff: { text: 'diff', evidenceSha256: hash('e') },
  });
  expect(canReview(done)).toBe(true);
  expect(reviewBody(done, 'discard')).toEqual({
    schemaVersion: 1,
    decision: 'discard',
    evidenceSha256: hash('e'),
  });
  expect(canReview({ ...done, executor: 'codex-simulated' })).toBe(false);
  expect(
    canReview({
      ...done,
      review: { status: 'confirmed', decision: 'approve' },
    }),
  ).toBe(false);
  expect(canReview({ ...done, diff: null })).toBe(false);
  expect(() => reviewBody(task(), 'approve')).toThrow('task_not_reviewable');
  expect(
    reviewLabel({
      ...done,
      review: { status: 'uncertain', decision: 'approve' },
    }),
  ).toContain('bloqueada');
});

it('polls only while the server reports activity', () => {
  expect(isActive([task()], null)).toBe(false);
  expect(isActive([task({ state: 'running' })], null)).toBe(true);
  expect(isActive([], 'new')).toBe(true);
});

it('client fetches a session token, sends it, and surfaces API errors', async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fake: typeof fetch = (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    calls.push({ url, init });
    const reply = (status: number, body: unknown) =>
      Promise.resolve(new Response(JSON.stringify(body), { status }));
    if (url === '/api/v1/session') return reply(200, { token: 't0k' });
    if (url === '/api/v1/tasks' && init?.method === 'POST')
      return reply(400, { error: 'task_invalid' });
    return reply(200, { busy: null, tasks: [] });
  };
  const api = new Api(fake);
  expect(await api.tasks()).toEqual({ busy: null, tasks: [] });
  const error = await api.create('synthetic-bugfix').catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(400);
  expect(calls.filter((c) => c.url === '/api/v1/session')).toHaveLength(1);
  const post = calls.find((c) => c.init?.method === 'POST');
  const sent = post?.init?.body;
  expect(typeof sent).toBe('string');
  expect(JSON.parse(sent as string)).toEqual({
    schemaVersion: 1,
    executor: 'synthetic-bugfix',
  });
  expect(
    (post?.init?.headers as Record<string, string>)['X-BeonForge-Token'],
  ).toBe('t0k');
});
