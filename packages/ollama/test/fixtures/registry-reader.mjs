// Second-process recovery proof: CAS reads only, no network/provider operations.
import process from 'node:process';
import { openSqlitePersistence } from '@beonforge/persistence';
import { readLocalCandidates } from '../../dist/index.js';
const [database, artifacts, refJson, policyJson] = process.argv.slice(2);
const store = await openSqlitePersistence(database, artifacts);
try {
  const candidates = await readLocalCandidates(
    JSON.parse(refJson),
    JSON.parse(policyJson),
    store,
  );
  process.stdout.write(`${JSON.stringify(candidates)}\n`);
} finally {
  await store.close();
}
