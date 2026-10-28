import { performance } from 'node:perf_hooks';
import { parentPort, workerData } from 'node:worker_threads';
import { openDatabase } from './fixture.mjs';

const db = openDatabase(workerData.directory, 'FULL', 2000);
try {
  parentPort.postMessage('waiting-for-writer');
  const start = performance.now();
  db.exec('BEGIN IMMEDIATE;');
  db.prepare('INSERT INTO operations(idem, payload) VALUES (?, ?)').run(
    'worker',
    'worker',
  );
  db.exec('COMMIT;');
  parentPort.postMessage({
    phase: 'committed',
    waitMs: performance.now() - start,
  });
} finally {
  db.close();
}
