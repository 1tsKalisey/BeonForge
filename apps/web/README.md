# @beonforge/web — B06-01 minimal Angular UI

Angular 22 standalone, zoneless app served by the loopback synthetic task API
(`packages/runtime/examples/api`, same origin). It lists, creates, runs and reviews
**synthetic** tasks only (D-048). It has no executable, path, command, provider
or "real mode" control; executors come from the server's fixed registry.

Tests, diff and proposal panels render only from evidence the API returned for
that task. Review buttons appear only for a succeeded `synthetic-bugfix` task with
pending review and send that task's own evidence hash.

## Commands (from `apps/web`)

```text
pnpm.cmd build      # ng build -> dist/web/browser
pnpm.cmd typecheck  # app + unit-test tsconfigs
pnpm.cmd test       # vitest: view rules and API client
pnpm.cmd e2e        # real browser flow (needs build and the built workspace)
```

The e2e drives an installed local browser (Edge by default; override with
`BEONFORGE_E2E_CHANNEL` or `BEONFORGE_E2E_BROWSER`) through `playwright-core`; it never
downloads browsers. It starts the real API, runs both executors from the UI,
kills and restarts the backend, approves the bugfix and then reopens the SQLite/CAS
stores from a separate process (`e2e/verify-store.mjs`) to compare them with what
the UI displayed. Evidence (screenshots, logs, report, SHA-256 index) is written to
the git-ignored `artifacts/evidence/b06-01-e2e-*/`. Synthetic fixture repositories
stay in a new `%TEMP%/beonforge-e2e-data-*` directory, because the API rejects a
data directory inside the checkout (D-043).
