// B06-01 end-to-end: real browser -> Angular -> loopback API -> M04.1/c.2 stores.
// Uses an installed local browser (Edge by default, or BEONFORGE_E2E_CHANNEL /
// BEONFORGE_E2E_BROWSER); never downloads browsers. Synthetic data only (D-043).
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  existsSync,
  writeFileSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { setTimeout, clearTimeout } from 'node:timers';
import { chromium } from 'playwright-core';

const exec = promisify(execFile);
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const cli = join(repo, 'packages/runtime/examples/api/cli.mjs');
const web = join(repo, 'apps/web/dist/web/browser');
if (!existsSync(join(web, 'index.html'))) throw new Error('build_web_first');
// Synthetic fixture repositories stay OUTSIDE the checkout: the API rejects a
// data directory inside BeonForge (D-043). Only evidence is kept in the project,
// under the git-ignored artifacts/evidence/.
const data = mkdtempSync(
  join(realpathSync.native(tmpdir()), 'beonforge-e2e-data-'),
);
const evidenceRoot = join(repo, 'artifacts', 'evidence');
mkdirSync(evidenceRoot, { recursive: true });
const evidence = mkdtempSync(join(evidenceRoot, 'b06-01-e2e-'));
const logs = { backend: [], verifier: '' };
const steps = [];
const step = (name, detail = {}) => {
  steps.push({ name, at: new Date().toISOString(), ...detail });
  console.log(`ok - ${name}`);
};

function startBackend() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        cli,
        '--allow-synthetic-tasks',
        '--data',
        data,
        '--port',
        '0',
        '--web',
        web,
      ],
      {
        cwd: join(repo, 'packages/runtime'),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    let out = '';
    let err = '';
    const log = { stdout: '', stderr: '' };
    logs.backend.push(log);
    const timer = setTimeout(
      () => reject(new Error('backend_start_timeout')),
      20000,
    );
    child.stderr.on('data', (b) => {
      err += b;
      log.stderr += b;
    });
    child.stdout.on('data', (b) => {
      out += b;
      log.stdout += b;
      const line = out.split('\n').find((l) => l.startsWith('{'));
      if (line) {
        clearTimeout(timer);
        resolve({ child, url: JSON.parse(line).url });
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`backend_exited_${code}: ${err.slice(0, 500)}`));
    });
  });
}
async function stopBackend(backend) {
  const exited = new Promise((r) => backend.child.once('exit', r));
  backend.child.kill();
  await exited;
}

const launch = process.env.BEONFORGE_E2E_BROWSER
  ? { executablePath: process.env.BEONFORGE_E2E_BROWSER }
  : { channel: process.env.BEONFORGE_E2E_CHANNEL ?? 'msedge' };
let browser;
let backend;
let failed = null;
try {
  backend = await startBackend();
  step('backend started on loopback', { url: backend.url });
  browser = await chromium.launch({ headless: true, ...launch });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on(
    'console',
    (m) => m.type() === 'error' && consoleErrors.push(m.text()),
  );
  // Recorded, not thrown: a listener exception would not fail the run.
  const external = [];
  const apiCalls = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.hostname !== '127.0.0.1') external.push(u.host);
  });
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/api/v1/'))
      apiCalls.push({
        method: r.request().method(),
        path: u.pathname,
        status: r.status(),
      });
  });
  await page.goto(backend.url);
  await page.getByTestId('simulated-badge').waitFor();
  const options = await page
    .locator('[data-testid=executor] option')
    .evaluateAll((o) => o.map((x) => x.value));
  if (
    JSON.stringify(options) !==
    JSON.stringify(['synthetic-bugfix', 'codex-simulated'])
  )
    throw new Error(`unexpected_executors ${options}`);
  step('UI loaded with only simulated executors', { options });

  // 1. Synthetic bugfix (M04.1): create -> confirm fixed patch -> run.
  await page.getByTestId('executor').selectOption('synthetic-bugfix');
  await page.getByTestId('create').click();
  await page
    .locator('[data-testid=state][data-state=prepared]')
    .waitFor({ timeout: 60000 });
  const bugfixId = (await page.getByTestId('task-id').textContent()).trim();
  step('bugfix task created and prepared', { id: bugfixId });
  await page.getByTestId('no-tests').waitFor();
  await page.getByTestId('no-diff').waitFor();
  await page.getByTestId('run').click();
  await page
    .locator('[data-testid=state][data-state=succeeded]')
    .waitFor({ timeout: 120000 });
  const tests = await page.locator('[data-testid=tests] tr').allTextContents();
  if (
    tests.length !== 2 ||
    !/Rojo.*exit 1/.test(tests[0]) ||
    !/Verde.*exit 0/.test(tests[1])
  )
    throw new Error(`unexpected_tests ${JSON.stringify(tests)}`);
  const diff = await page.getByTestId('diff').textContent();
  if (!diff.includes('-  return a - b;') || !diff.includes('+  return a + b;'))
    throw new Error('unexpected_diff');
  await page.getByTestId('no-proposal').waitFor();
  if (
    (await page.getByTestId('review').textContent()).trim() !==
    'Pendiente de decisión explícita'
  )
    throw new Error('review_not_pending');
  await page.screenshot({
    path: join(evidence, '1-bugfix-succeeded.png'),
    fullPage: true,
  });
  step('bugfix ran: red/green tests and diff from its own evidence', { tests });

  // 2. Backend restart (process killed): the browser reads persisted state again.
  await stopBackend(backend);
  backend = await startBackend();
  await page.goto(backend.url);
  await page.getByTestId(`task-${bugfixId}`).click();
  await page
    .locator('[data-testid=state][data-state=succeeded]')
    .waitFor({ timeout: 30000 });
  const diffAfter = await page.getByTestId('diff').textContent();
  const testsAfter = await page
    .locator('[data-testid=tests] tr')
    .allTextContents();
  if (
    diffAfter !== diff ||
    JSON.stringify(testsAfter) !== JSON.stringify(tests)
  )
    throw new Error('evidence_changed_after_restart');
  step('state and evidence identical after backend restart', {
    url: backend.url,
  });

  // 3. Explicit review from the UI.
  await page.getByTestId('approve').click();
  await page
    .getByTestId('review')
    .filter({ hasText: 'Aprobada (confirmada)' })
    .waitFor({ timeout: 60000 });
  if (await page.getByTestId('approve').count())
    throw new Error('review_still_offered');
  await page.screenshot({
    path: join(evidence, '2-bugfix-approved.png'),
    fullPage: true,
  });
  step('explicit approval recorded and confirmed; no integration');

  // 4. Codex simulated (c.2): proposal only, never tests/diff/review.
  await page.getByTestId('executor').selectOption('codex-simulated');
  await page.getByTestId('create').click();
  await page
    .locator('[data-testid=state][data-state=prepared]')
    .waitFor({ timeout: 60000 });
  const codexId = (await page.getByTestId('task-id').textContent()).trim();
  if (codexId === bugfixId || !codexId.startsWith('codexsim-'))
    throw new Error('codex_task_not_selected');
  await page.getByTestId('run').click();
  await page
    .locator('[data-testid=state][data-state=succeeded]')
    .waitFor({ timeout: 60000 });
  if ((await page.getByTestId('proposal-match').textContent()).trim() !== 'Sí')
    throw new Error('proposal_mismatch');
  const proposalText = await page.getByTestId('proposal').textContent();
  await page.getByTestId('no-tests').waitFor();
  await page.getByTestId('no-diff').waitFor();
  if (await page.getByTestId('approve').count())
    throw new Error('codex_review_offered');
  await page.screenshot({
    path: join(evidence, '3-codex-simulated.png'),
    fullPage: true,
  });
  step('codex-simulated ran: proposal only, no tests/diff/review', {
    id: codexId,
  });

  if (consoleErrors.length)
    throw new Error(`console_errors ${JSON.stringify(consoleErrors)}`);
  if (external.length)
    throw new Error(`external_requests ${JSON.stringify(external)}`);
  step('no browser console errors and no non-loopback requests');

  // 5. The UI really drove the API: mutations reached the backend over HTTP.
  const count = (method, pattern, status) =>
    apiCalls.filter(
      (c) => c.method === method && pattern.test(c.path) && c.status === status,
    ).length;
  const expected = [
    ['POST', /^\/api\/v1\/tasks$/, 201, 2],
    ['POST', /^\/api\/v1\/tasks\/[^/]+\/run$/, 202, 2],
    ['POST', /^\/api\/v1\/tasks\/[^/]+\/review$/, 202, 1],
  ];
  for (const [method, pattern, status, n] of expected)
    if (count(method, pattern, status) !== n)
      throw new Error(
        `api_calls ${method} ${pattern} ${JSON.stringify(apiCalls)}`,
      );
  step('browser issued the real API mutations', {
    posts: apiCalls.filter((c) => c.method === 'POST'),
    totalApiCalls: apiCalls.length,
  });

  // 6. Independent persistence check: stop the backend, reopen the stores from
  // disk in a separate process and compare with what the browser displayed.
  await stopBackend(backend);
  backend = null;
  const { stdout } = await exec(
    process.execPath,
    [join(repo, 'apps/web/e2e/verify-store.mjs'), data, bugfixId, codexId],
    { timeout: 60000, windowsHide: true },
  );
  logs.verifier = stdout;
  const stored = JSON.parse(stdout);
  const b = stored.bugfix;
  const [red, green] = b.tests;
  if (
    b.diff !== diff ||
    b.review?.decision !== 'approve' ||
    b.review?.status !== 'confirmed' ||
    b.attempts.some((a) => a.status !== 'succeeded') ||
    red.exitCode !== 1 ||
    green.exitCode !== 0 ||
    !tests[0].includes(red.sha256.slice(0, 12)) ||
    !tests[1].includes(green.sha256.slice(0, 12))
  )
    throw new Error(`bugfix_store_mismatch ${stdout}`);
  const c = stored.codex;
  if (
    c.status !== 'succeeded' ||
    c.proposal.contentSha256 !== b.afterSha256 ||
    !proposalText.includes(c.proposal.contentSha256.slice(0, 12))
  )
    throw new Error(`codex_store_mismatch ${stdout}`);
  step('persisted SQLite/CAS evidence reopened independently matches the UI', {
    bugfixEvidenceSha256: b.evidenceSha256,
    redSha256: red.sha256,
    greenSha256: green.sha256,
    events: b.events,
    codexProposalSha256: c.proposalSha256,
  });
} catch (error) {
  failed = String(error?.stack ?? error);
  console.error(failed);
} finally {
  await browser?.close();
  if (backend) await stopBackend(backend).catch(() => {});
  logs.backend.forEach((log, i) => {
    writeFileSync(join(evidence, `backend-${i + 1}.stdout.log`), log.stdout, {
      flag: 'wx',
    });
    writeFileSync(join(evidence, `backend-${i + 1}.stderr.log`), log.stderr, {
      flag: 'wx',
    });
  });
  if (logs.verifier)
    writeFileSync(join(evidence, 'verify-store.json'), logs.verifier, {
      flag: 'wx',
    });
  writeFileSync(
    join(evidence, 'report.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        kind: 'b06-01-e2e',
        passed: failed === null,
        failed,
        // Only the name of the synthetic data directory; no private absolute path.
        dataDirectory: basename(data),
        steps,
      },
      null,
      2,
    ),
    { flag: 'wx' },
  );
  const sha256 = Object.fromEntries(
    readdirSync(evidence)
      .sort()
      .map((name) => [
        name,
        createHash('sha256')
          .update(readFileSync(join(evidence, name)))
          .digest('hex'),
      ]),
  );
  writeFileSync(
    join(evidence, 'sha256.json'),
    JSON.stringify(sha256, null, 2),
    { flag: 'wx' },
  );
  const relativeEvidence = join('artifacts', 'evidence', basename(evidence));
  console.log(
    JSON.stringify({ passed: failed === null, evidence: relativeEvidence }),
  );
  process.exitCode = failed === null ? 0 : 1;
}
