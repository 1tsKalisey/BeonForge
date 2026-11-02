// Explicit local diagnostic; never called by the quality gates.
import { buildJobProbe, jobScenario, sha256 } from './windows-job.ts';
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import process from 'node:process';
import console from 'node:console';

const synthetic = process.argv[2] === '--allow-local-synthetic-job-probes';
if (
  process.argv.length !== 4 ||
  (!synthetic && process.argv[2] !== '--allow-local-mxc-probes') ||
  (synthetic && process.argv[3] !== 'synthetic')
)
  throw new Error('explicit_local_probe_authorization_required');
const codex = process.argv[3];
const probe = await buildJobProbe();
const results = [];
for (const mode of [
  'baseline-normal',
  'baseline-force',
  'normal',
  'force',
  'force',
  'force',
  'force',
  'force',
  'crash',
]) {
  const result = await jobScenario(probe, codex, mode);
  results.push(result);
  console.log(JSON.stringify(result));
  // At most one attempt with the Job after an unavailable baseline. No fallback.
  if (!result.cleanup && !mode.startsWith('baseline-')) break;
}
const report = {
  schemaVersion: 1,
  kind: 'codex-windows-job-diagnostic',
  lifecycle: 'BLOCKED',
  hostConfinement: 'BLOCKED',
  readyForAgent: false,
  syntheticLifecycle:
    synthetic &&
    results.every(
      (r) =>
        r.cleanup &&
        (r.mode.startsWith('baseline-')
          ? !r.terminated
          : r.associatedBeforeResume &&
            r.members &&
            r.terminated &&
            r.terminationMs <= 500),
    )
      ? 'PASS'
      : 'not_proven',
  // Observations require independent interpretation; no automatic dispatch grant.
  binary: codex,
  codexSha256: synthetic ? null : sha256(await readFile(codex)),
  codeHostSha256: synthetic
    ? null
    : sha256(await readFile(join(dirname(codex), 'codex-code-mode-host.exe'))),
  probe,
  results,
};
const reportPath = join(probe.build, 'report.json');
await writeFile(reportPath, JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(
  JSON.stringify({
    reportPath,
    reportSha256: sha256(await readFile(reportPath)),
  }),
);
process.exitCode = 2;
