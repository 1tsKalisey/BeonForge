import process from 'node:process';
import { Buffer } from 'node:buffer';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { openSqlitePersistence } from '@beonforge/persistence';
const original = childProcess.spawn;
childProcess.spawn = function (...args) {
  const child = original(...args);
  child.once('spawn', () => process.send({ pid: child.pid }));
  return child;
};
syncBuiltinESMExports();
const { runSimulatedProcess, previewSimulatedRequest } =
  await import('../../examples/simulated/supervisor.ts');
const request = {
  mode: 'wait',
  payload: Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      baseCommit: 'a'.repeat(40),
      preimageSha256: 'b'.repeat(64),
    }),
  ),
};
const store = await openSqlitePersistence(process.argv[2]);
try {
  await runSimulatedProcess(store, 'run', request, {
    canRead: true,
    canRun: true,
    runId: 'run',
    requestSha256: previewSimulatedRequest(request),
  });
} finally {
  await store.close();
}
