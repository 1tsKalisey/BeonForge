import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { BEFORE, AFTER } from '../examples/bugfix/fixture.ts';

const script = realpathSync(
  fileURLToPath(new URL('./fixtures/fake-agent.mjs', import.meta.url)),
);
const input = {
  schemaVersion: 1,
  baseCommit: 'a'.repeat(40),
  preimageSha256: createHash('sha256').update(BEFORE).digest('hex'),
};
// Test driver only: no exported supervisor, configurable executable or shell.
function run(
  mode: string,
  bytes: string | Buffer = JSON.stringify(input),
  timeout = 5000,
) {
  return new Promise<{
    stdout: string;
    stderr: string;
    code: number | string | null;
    killed: boolean;
    closed: boolean;
  }>((resolve) => {
    let closed = false;
    const child = execFile(
      process.execPath,
      ['--permission', `--allow-fs-read=${dirname(script)}`, script, mode],
      {
        cwd: dirname(script),
        shell: false,
        timeout,
        maxBuffer: 65536,
        env: { SystemRoot: process.env.SystemRoot },
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        resolve({
          stdout,
          stderr,
          code: error ? (error.code ?? error.signal ?? 'process_error') : 0,
          killed: child.killed,
          closed,
        });
      },
    );
    // execFile callback runs from close; this listener precedes its callback.
    child.prependOnceListener('close', () => {
      closed = true;
    });
    child.stdin?.on('error', () => {
      /* Child may close input on invalid argv. */
    });
    child.stdin?.end(bytes);
  });
}

it('fixed fake emits exact deterministic public proposal, not a generated correction', async () => {
  const first = await run('success');
  expect(first).toMatchObject({ code: 0, stderr: '', closed: true });
  expect(await run('success')).toEqual(first);
  const expected =
    JSON.stringify({ schemaVersion: 1, type: 'started' }) +
    '\n' +
    JSON.stringify({
      schemaVersion: 1,
      type: 'proposal',
      baseCommit: input.baseCommit,
      path: 'src/add.ts',
      preimageSha256: input.preimageSha256,
      content: AFTER,
      label: 'corrección sintética',
    }) +
    '\n';
  expect(first.stdout).toBe(expected);
  expect(Buffer.byteLength(first.stdout)).toBeLessThan(65536);
  expect((await run('fragmented')).stdout).toBe(expected);
}, 20000);

it.each([
  ['null', 'null'],
  ['extra field', JSON.stringify({ ...input, command: 'never-execute' })],
  ['bad version', JSON.stringify({ ...input, schemaVersion: 2 })],
  ['bad commit', JSON.stringify({ ...input, baseCommit: '../outside' })],
  ['bad hash', JSON.stringify({ ...input, preimageSha256: 'bad' })],
  ['invalid JSON', '{private-marker'],
  ['invalid UTF8', Buffer.from([255])],
  ['oversize', 'x'.repeat(65537)],
])('rejects %s without echoing input', async (_label, bytes) => {
  expect(await run('success', bytes)).toMatchObject({
    code: 2,
    stdout: '',
    stderr: 'fixture_invalid\n',
    closed: true,
  });
});

it('unknown mode cannot select a command or leak input', async () => {
  expect(await run('not-allowed')).toMatchObject({
    code: 2,
    stdout: '',
    stderr: 'fixture_invalid\n',
    closed: true,
  });
});
it('negative protocol and process scenarios remain distinct', async () => {
  expect(await run('invalid-json')).toMatchObject({
    code: 0,
    stdout: '{invalid\n',
    stderr: '',
    closed: true,
  });
  expect(await run('fail')).toMatchObject({
    code: 3,
    stdout: '',
    stderr: 'fixture_failure\n',
    closed: true,
  });
});
it('waiting fixture is killed and closed within a bounded test deadline', async () => {
  const result = await run('wait', undefined, 500);
  expect(result.killed).toBe(true);
  expect(result.closed).toBe(true);
  expect(result.stdout).toBe('');
  expect(result.code).not.toBe(0);
}, 5000);
