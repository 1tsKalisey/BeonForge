// Independent check for the e2e: reopens the persisted SQLite/CAS stores of the
// given tasks in a separate process (no API, no browser) and prints their evidence.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { TextDecoder } from 'node:util';

const [data, bugfixId, codexId] = process.argv.slice(2);
if (!data || !bugfixId || !codexId)
  throw new Error('usage: data bugfixId codexId');
const runtime = fileURLToPath(
  new URL('../../../packages/runtime/', import.meta.url),
);
const load = (path) => import(pathToFileURL(join(runtime, path)).href);
const { inspectBugfixDemo } = await load('examples/bugfix/demo.ts');
const { inspectSimulatedCodexRun } = await load('examples/codex/adapter.ts');
// Resolved through the runtime package's own workspace dependency.
const { openSqlitePersistence } = await load(
  'node_modules/@beonforge/persistence/dist/index.js',
);
const decode = (bytes) =>
  JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));

const fixture = join(data, 'tasks', bugfixId, 'fixture');
const [name] = readdirSync(fixture).filter((n) =>
  n.startsWith('beonforge-bugfix-'),
);
const root = join(fixture, name);
const view = await inspectBugfixDemo(root, { root, canRead: true });
const store = await openSqlitePersistence(
  join(root, 'storage', 'events.sqlite'),
);
const tests = [];
for (const blockId of ['red', 'green']) {
  const attempt = await store.getAttempt({
    runId: 'synthetic-bugfix',
    blockId,
    attemptId: '1',
  });
  const ref = attempt.result.evidence[0];
  tests.push({
    blockId,
    status: attempt.status,
    sha256: ref.sha256,
    ...decode(await store.readArtifact(ref)),
  });
}
const events = (await store.readEvents()).length;
await store.close();

const codexStore = await openSqlitePersistence(
  join(data, 'tasks', codexId, 'codex', 'events.sqlite'),
);
const started = (await codexStore.readEvents()).find(
  (e) => e.event.type === 'block.started',
);
const run = await inspectSimulatedCodexRun(codexStore, started.event.runId);
const proposal = decode(await codexStore.readArtifact(run.proposalRef));
await codexStore.close();

console.log(
  JSON.stringify({
    bugfix: {
      attempts: view.attempts,
      diff: view.artifact.diff,
      evidenceSha256: view.evidence.sha256,
      review: view.review,
      tests,
      events,
      afterSha256: view.preview.afterSha256,
    },
    codex: {
      status: run.status,
      proposalSha256: run.proposalRef.sha256,
      proposal,
    },
  }),
);
