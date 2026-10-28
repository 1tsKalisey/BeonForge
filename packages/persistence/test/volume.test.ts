import { fork } from 'node:child_process';
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { once } from 'node:events';
import { expect, it } from 'vitest';

it('opens and backs up 800 events/40 checkpoints with bounded verification and replay', async () => {
  const temporary = realpathSync(tmpdir());
  const root = mkdtempSync(join(temporary, 'beonforge-volume-'));
  const copies = join(root, 'copies');
  mkdirSync(copies, { mode: 0o700 });
  const child = fork(
    new URL('./fixtures/recovery-volume.mjs', import.meta.url),
    [join(root, 'events.sqlite'), copies],
    { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
  );
  const metrics: {
    operation: string;
    ms: number;
    reads: number;
    applies: number;
    error?: string;
  }[] = [];
  child.on('message', (value: unknown) => {
    if (typeof value === 'object' && value !== null && 'operation' in value) {
      metrics.push(value as (typeof metrics)[number]);
      console.info('volume', JSON.stringify(value));
    }
  });
  let stderr = '';
  child.stderr?.on('data', (chunk: Uint8Array) => {
    stderr += Buffer.from(chunk).toString();
  });
  try {
    const exit: unknown = await once(child, 'exit', {
      signal: AbortSignal.timeout(240000),
    });
    const code: unknown = Array.isArray(exit) ? exit[0] : undefined;
    expect(code, stderr).toBe(0);
    expect(metrics.map((m) => m.operation)).toEqual([
      'populate',
      'open-direct',
      'backup-direct',
      'open-worker',
      'backup-worker',
      'restore-worker',
    ]);
    for (const metric of metrics) expect(metric.error).toBeUndefined();
    const opening = metrics.find((m) => m.operation === 'open-direct');
    expect(opening?.reads).toBeLessThanOrEqual(41);
    expect(opening?.applies).toBe(800);
    const backup = metrics.find((m) => m.operation === 'backup-direct');
    expect(backup?.reads).toBeLessThanOrEqual(82);
    expect(backup?.applies).toBe(800);
  } finally {
    child.kill('SIGKILL');
    if (child.exitCode === null && child.signalCode === null)
      await once(child, 'exit');
    expect(dirname(realpathSync(root))).toBe(temporary);
    rmSync(root, { recursive: true, force: true });
  }
}, 250000);
