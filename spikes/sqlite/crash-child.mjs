import process from 'node:process';
import { setInterval } from 'node:timers';
import { openDatabase } from './fixture.mjs';

const [directory, mode] = process.argv.slice(2);
const db = openDatabase(directory, mode);
db.exec('PRAGMA cache_size=8; BEGIN IMMEDIATE;');
db.prepare('INSERT INTO operations(id, idem, payload) VALUES (1, ?, ?)').run(
  'committed',
  'committed',
);
db.exec(
  "INSERT INTO projection VALUES (1, 'committed'); COMMIT; BEGIN IMMEDIATE;",
);
// More than the cache size: exercise uncommitted page spilling, not just memory.
const insert = db.prepare(
  'INSERT INTO operations(idem, payload) VALUES (?, ?)',
);
for (let i = 0; i < 16; i++) insert.run(`pending-${i}`, 'x'.repeat(64 * 1024));
db.exec("INSERT INTO projection VALUES (2, 'pending');");
process.send({
  phase: 'transaction-open',
  rowsVisibleInChild: db.prepare('SELECT count(*) AS n FROM operations').get()
    .n,
});
// Parent kills this process without a COMMIT/ROLLBACK, close, or shutdown handler.
setInterval(() => {}, 1000);
