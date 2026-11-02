import { it, expect } from 'vitest';
import process from 'node:process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildJobProbe, jobScenario } from '../examples/codex/windows-job.ts';

it.skipIf(process.platform !== 'win32')(
  'unassisted native descendants survive normal and forced parent exit without a job',
  async () => {
    const probe = await buildJobProbe();
    for (const mode of ['baseline-normal', 'baseline-force'] as const) {
      const r = await jobScenario(probe, 'synthetic', mode);
      expect(r, r.stderr + r.stdout).toMatchObject({
        terminated: false,
        cleanup: true,
        exit: 0,
      });
      expect(r.stdout).toContain('SURVIVORS False True True');
    }
  },
  20000,
);

it.skipIf(process.platform !== 'win32')(
  'native job associates before resume and kills an unassisted synthetic tree',
  async () => {
    const probe = await buildJobProbe();
    for (const mode of [
      'normal',
      'force',
      'force',
      'force',
      'force',
      'force',
      'crash',
      'nested',
    ] as const) {
      const r = await jobScenario(probe, 'synthetic', mode);
      expect(r, r.stderr + r.stdout).toMatchObject({
        associatedBeforeResume: true,
        members: true,
        terminated: true,
        cleanup: true,
        closed: true,
        overflow: false,
      });
      expect(r.terminationMs).toBeLessThanOrEqual(500);
      if (mode !== 'crash') expect(r.jobEmpty).toBe(true);
    }
  },
  30000,
);

it.skipIf(process.platform !== 'win32')(
  'changed launcher is rejected before child creation',
  async () => {
    const probe = await buildJobProbe();
    const r = await jobScenario(
      { ...probe, hash: '0'.repeat(64) },
      'synthetic',
      'force',
    );
    expect(r.exit).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('executable_hash_mismatch');
    for (const role of ['root', 'child', 'grand'])
      expect(await readFile(join(r.root, 'out', `${role}.txt`), 'utf8')).toBe(
        '',
      );
  },
  20000,
);

it.skipIf(process.platform !== 'win32')(
  'altered Codex component is rejected without executing it',
  async () => {
    const probe = await buildJobProbe();
    const altered = join(probe.build, 'codex.exe');
    await writeFile(altered, 'synthetic-invalid-executable', { flag: 'wx' });
    const r = await jobScenario(probe, altered, 'force');
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain('executable_hash_mismatch');
    expect(r.stdout).toBe('');
  },
  20000,
);
