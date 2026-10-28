import process from 'node:process';
import { setInterval } from 'node:timers';
import { openSqliteEventStore } from '../../dist/index.js';

const store = await openSqliteEventStore(process.argv[2]);
await store.append(
  {
    schemaVersion: 1,
    type: 'block.started',
    eventId: 'start-1',
    occurredAt: 0,
    runId: 'run-1',
    attemptId: 'attempt-1',
    manifest: {
      schemaVersion: 1,
      blockId: 'block-1',
      handler: 'fixture.copy',
      handlerVersion: 1,
      inputs: [],
      effects: 'external',
    },
  },
  'start-key',
);
process.send({ phase: 'confirmed-start' });
process.once('message', () => {
  const pending = store.append(
    {
      schemaVersion: 1,
      type: 'block.finished',
      eventId: 'finish-1',
      occurredAt: 1,
      result: {
        schemaVersion: 1,
        runId: 'run-1',
        blockId: 'block-1',
        attemptId: 'attempt-1',
        status: 'succeeded',
        evidence: [],
      },
    },
    'finish-key',
  );
  process.send({ phase: 'submitted-finish' });
  void pending.catch(() => {});
});
setInterval(() => {}, 1000);
