import process from 'node:process';
import { Buffer } from 'node:buffer';
import { openSqlitePersistence } from '@beonforge/persistence';
import { inspectSimulatedProcess } from '../../examples/simulated/supervisor.ts';
const store = await openSqlitePersistence(process.argv[2]);
try {
  const result = await inspectSimulatedProcess(store, 'run', {
    runId: 'run',
    canRead: true,
  });
  const summary = JSON.parse(Buffer.from(result.evidence[0].bytes).toString());
  process.stdout.write(
    JSON.stringify({
      status: result.attempt.status,
      reason: summary.reason,
      closed: summary.closed,
    }),
  );
} finally {
  await store.close();
}
