# B02b-03 — Deterministic serial workflows

Objective: execute a bounded DAG, persist evidence and demonstrate safe process-interruption recovery using the accepted DurableStore. Dependencies: M01.1/M01.2. Scope: this package, workspace link in lockfile, tests/CLI and execution/security evidence. Excludes agents/models, routing, worktrees, general tools, distributed scheduling, automatic reconciliation and new SQLite/domain schemas. No external dependencies.

Acceptance/gates: reject invalid DAGs/cycles before effects; serial order, explicit external-effect permission, finite timeout/cancellation; bind a run to immutable workflow bytes; recover confirmed state from checkpoint plus log tail; skip succeeded attempts, block pending/uncertain and require explicit retry for known failures. Real temporary SQLite/CAS tests and child-process kill before/after workflow checkpoint. Frozen install, peers, format, typed lint, source/compiled-consumer typecheck, build, all tests, diff/secret scan. Rollback: revert these code/record commits preserving data; existing v1 events and schema v2 remain readable. Next: prepare independent M01.3 review and stop, no Fase 02 before acceptance.

## Boundaries and recovery

Workflow JSON v1 contains 1–64 nodes, each with an accepted BlockManifest and dependsOn IDs. Nodes/dependencies are canonicalized with code-point order; graph input order does not affect the definition. A reserved kernel.plan attempt stores the workflow CAS reference before any handler. This is metadata using existing contracts, not a new handler/agent framework. Nodes cannot use that reserved ID. Changing a run's workflow fails closed.

Execution is serial. Trusted, explicitly registered handler versions must match declared effects. Inputs comprise manifest inputs followed by succeeded direct-dependency evidence in dependency order; the actual inputs are recorded in each started manifest. Handlers receive bytes and AbortSignal, never a store or tool credentials. The external allowlist and failed retry IDs are caller policy, copied before execution; declarations grant no permission. Handler code is trusted: this API is not a sandbox. The CLI provides only small pure fixtures, without shell/network/provider tools.

Starts commit before dispatch; outputs publish to CAS before finish; then a workflow checkpoint is committed. A crash between finish and checkpoint is recovered through the confirmed log tail. Checkpoints are selected by deterministic IDs derived from confirmed finish sequence. They are workflow snapshots, not WAL checkpoints. Pending/uncertain attempts never authorize automatic execution. Failed attempts require a fresh explicit retry selection on each invocation; cancelled attempts remain terminal. No reconciliation API or claim of exactly-once external effects is provided.

Unexpected handler errors, timeout/cancellation after dispatch or malformed outcomes are uncertain. Cancellation before dispatch is known and does not execute the handler. Late outputs are ignored; the same store's runtime remains locked until an uncooperative handler settles, and persisted uncertainty blocks future resume. SQL/filesystem failures propagate without retry or guessing effects. A single runtime owns a DurableStore handle; raw concurrent store mutation or multiple control planes are unsupported, as in M01.2. Callers must not close/reuse the store while a handler is still active.

Definitions/graphs and results remain in memory at this bounded scale; persistence volume/ACL/power-loss limitations from M01.2 remain. Handler output/error summaries must already be safe to store; raw thrown errors are never logged or persisted. Human merge approval, general tool authorization and isolated executors belong to later phases.

## CLI and reproducible interruption demo

Use the evaluated Node 24.19.0 from execution/status; build the workspace first. A new empty directory is the only database destination needed:

```powershell
$demoRoot = Join-Path ([IO.Path]::GetTempPath()) ('beonforge-cli-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $demoRoot
$demoWorkflow = (Resolve-Path packages/runtime/examples/seed-copy.json).Path
node packages/runtime/dist/cli.js run --db "$demoRoot/events.sqlite" --run demo --workflow $demoWorkflow
node packages/runtime/dist/cli.js inspect --db "$demoRoot/events.sqlite" --run demo
node packages/runtime/dist/cli.js run --db "$demoRoot/events.sqlite" --run demo --workflow $demoWorkflow
```

The second run reuses confirmed results; inspect reports stored event metadata without blob contents. Run exits 0 for success, 1 for known failure/invalid input, 2 for a blocked uncertain/pending attempt, 130 for cancellation. Optional --retry-failed selects known failed nodes for one new attempt each; --external is an explicit block allowlist, not a tool/sandbox grant. The built-in CLI handlers are fixture.seed, fixture.concat, fixture.fail and cooperative fixture.wait, all declared none. No external handler can be loaded through workflow JSON or CLI module paths. SIGINT/SIGTERM request cancellation; a forced process kill instead leaves a confirmed pending start if one was written.

After build, `pnpm.cmd --filter @beonforge/runtime demo` executes the real child-process demonstration from fresh private temporaries. A child runs the same public runtime and SQLite/CAS. Test-only barriers delegate real append/checkpoint calls or wait after a real exclusive, fsynced receipt write; they do not mock persistence or add production failpoints. Parent sends SIGKILL and reopens:

- After confirmed finish/before checkpoint: recover the older snapshot plus two tail events; finish the remaining node without repeating the confirmed receipt.
- After checkpoint: recover that snapshot; finish the remaining node, with one receipt per node.
- Inside the second external receipt effect: preserve pending and block resume, even with retry-failed; no receipt is repeated and no successor executes.

The harness prints cut/recovery/receipt counters and verifies SQLite/CAS data, then removes only its validated temporary tree. These are process crashes, not power-loss or exactly-once proofs. The remaining CLI tests run/inspect/reopen, known failures/retry, malformed arguments/JSON/handlers and timeout followed by blocked resume.

## Local verification record

Node 24.19.0 / SQLite 3.53.3, no new external dependencies. Root lockfile changes only add workspace links for this package. 42 new tests (35 boundary/runtime + 7 process/CLI), total 226 with the unchanged 184 accepted tests. Frozen install, peers, formatting, typed lint, source/compiled-consumer typecheck, build and full tests verified. The first lint found eight require-await cases in instant fixture handlers; corrected with Promise.resolve or actual asynchronous receipt writes, no rule exceptions. The first parser test's readonly fixture setup was made mutable before consumer typecheck; no accepted contract changes. M01.3 awaits independent review, not self-acceptance.
