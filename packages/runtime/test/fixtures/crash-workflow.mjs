import process from 'node:process';
import { Buffer } from 'node:buffer';
import { open, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openSqlitePersistence } from '@beonforge/persistence';
import { executeWorkflow } from '../../dist/index.js';

const [root, mode] = process.argv.slice(2);
const store = await openSqlitePersistence(join(root, 'events.sqlite'));
const wait = () => new Promise(() => {});
const notify = async (phase) => {
  await writeFile(join(root, 'barrier'), phase, { flag: 'wx' });
  process.send?.({ phase });
  await wait();
};
// Test-only barriers wrap actual persistence calls, never simulate their success or durability.
let handlerFinishes = 0;
const append = store.append.bind(store);
store.append = async (event, key) => {
  const record = await append(event, key);
  if (
    event.type === 'block.finished' &&
    event.result.blockId === 'a' &&
    mode === 'after-finish'
  )
    await notify(mode);
  return record;
};
const checkpoint = store.createCheckpoint.bind(store);
store.createCheckpoint = async (id) => {
  const result = await checkpoint(id);
  if (
    result.attempts.some(
      (attempt) => attempt.blockId === 'a' && attempt.status === 'succeeded',
    )
  ) {
    handlerFinishes++;
    if (mode === 'after-checkpoint' && handlerFinishes === 1)
      await notify(mode);
  }
  return result;
};
const handler = {
  name: 'fixture.receipt',
  version: 1,
  effects: 'external',
  async execute({ inputs }) {
    const id = inputs.length ? 'b' : 'a';
    // A real exclusive file effect, flushed before notification. An accidental repeat fails EEXIST.
    const file = await open(join(root, `${id}.receipt`), 'wx', 0o600);
    try {
      await file.writeFile(id);
      await file.sync();
    } finally {
      await file.close();
    }
    if (id === 'b' && mode === 'inside-effect') await notify(mode);
    return { status: 'succeeded', outputs: [Buffer.from(id)] };
  },
};
try {
  const workflow = JSON.parse(
    await readFile(join(root, 'workflow.json'), 'utf8'),
  );
  const report = await executeWorkflow(store, 'demo', workflow, [handler], {
    external: ['a', 'b'],
  });
  process.send?.({ report });
} finally {
  await store.close();
}
