# B06-01 — Local synthetic task API

Loopback-only HTTP API over the accepted synthetic executors (D-048). It is the
backend of the first API + Angular vertical. **Every execution is simulated or a
fixed synthetic fixture.** There is no real Codex, provider, credential, inference,
network target, arbitrary path, command or executable selection.

## Start

Build first (`pnpm.cmd build`, and `pnpm.cmd --filter @beonforge/web build` for the
UI). From `packages/runtime`:

```text
node examples/api/cli.mjs --allow-synthetic-tasks --data AUTHORIZED_DATA_DIR [--port 4317] [--web DIST_DIR]
```

`AUTHORIZED_DATA_DIR` must be an existing, absolute, canonical directory **outside
the BeonForge checkout**, dedicated to synthetic test data (D-043). Each task gets a
new `tasks/<id>/` directory with a disposable Git fixture created by M04.1. Nothing
is deleted automatically. The server serves the Angular build from
`apps/web/dist/web/browser` when present. Stop with Ctrl+C (cooperative cancel).

## Executors (fixed registry, `simulated: true`)

| id                 | Reuses                                         | Evidence                                           |
| ------------------ | ---------------------------------------------- | -------------------------------------------------- |
| `synthetic-bugfix` | M04.1 `prepare/run/inspect/reviewBugfixDemo`   | red/green test summaries, diff, explicit review    |
| `codex-simulated`  | c.2 `prepare/execute/inspectSimulatedCodexRun` | sanitized proposal hash only; no tests/diff/review |

Each view is derived from that task's own SQLite/CAS store. Evidence from different
runs is never combined; `codex-simulated` never shows tests or a diff.

## Routes (`/api/v1`)

| Method | Path                                 | Body                                                                                                     |
| ------ | ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| GET    | `/session`                           | — returns a per-process token                                                                            |
| GET    | `/executors`, `/tasks`, `/tasks/:id` | —                                                                                                        |
| POST   | `/tasks`                             | `{"schemaVersion":1,"executor":"synthetic-bugfix"}`                                                      |
| POST   | `/tasks/:id/run`                     | bugfix: `{"schemaVersion":1,"confirmPatchSha256":"<preview.patchSha256>"}`; codex: `{"schemaVersion":1}` |
| POST   | `/tasks/:id/review`                  | `{"schemaVersion":1,"decision":"approve"\|"discard","evidenceSha256":"<diff.evidenceSha256>"}`           |

All routes except `/session` require `X-BeonForge-Token`. POST requires
`Content-Type: application/json` and a body ≤ 4 KiB with exactly the listed keys.

## Security and limits

- Bound to `127.0.0.1` only. `Host` must be our own loopback authority (DNS
  rebinding), `Origin`/`Sec-Fetch-Site` must be same-origin, no CORS headers, CSP
  `default-src 'self'`.
- The token prevents cross-site requests; it is **not user authentication**. Any
  local process of the same OS user is trusted as the operator (as in M04.1).
- One mutation at a time, claimed before validation. A task runs only if no block
  has started; pending/uncertain after a restart is shown as `blocked` and is never
  retried. `lastError` is in-memory only; persisted state comes from SQLite/CAS.
- Review records an explicit caller decision through M04.1. No merge, commit, push,
  publication or integration exists (`integration: not_performed`).
- Not an OS or network sandbox; all M04.1 and c.2 limits apply unchanged. c.1 global
  and c.3 remain BLOCKED.
