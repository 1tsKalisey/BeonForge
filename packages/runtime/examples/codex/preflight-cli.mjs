// Opt-in local sandbox diagnostic only. No exec/model/auth command exists here.
import process from 'node:process';
import { mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSqlitePersistence } from '@beonforge/persistence';
import { runCodexPreflight } from './preflight.ts';
const args = process.argv.slice(2);
if (
  args.length !== 5 ||
  args[0] !== '--parent' ||
  args[2] !== '--binary' ||
  args[4] !== '--allow-local-sandbox-probes'
) {
  process.stderr.write('preflight_invalid\n');
  process.exitCode = 1;
} else {
  const directory = await mkdtemp(
    join(await realpath(tmpdir()), 'beonforge-c1-evidence-'),
  );
  const database = join(directory, 'report.sqlite');
  const store = await openSqlitePersistence(database);
  try {
    const result = await runCodexPreflight(args[1], args[3], true, store);
    process.stdout.write(JSON.stringify({ ...result, database }) + '\n');
    process.exitCode = result.report.status === 'BLOCKED' ? 2 : 0;
  } catch {
    process.stderr.write('preflight_invalid\n');
    process.exitCode = 1;
  } finally {
    await store.close();
  }
}
