# B02b-01 — Durable events and attempt projection

The scope below records B02b-01. B02b-02 adds the artifact/checkpoint/backup protocols documented in [RECOVERY.md](RECOVERY.md), including schema v2 migration and unchanged legacy EventStore API.

Objective: implement only versioned migration, append-only events, atomic event/projection writes, idempotency and replay after reopening. Depends on accepted M01.1 and spike B02a-01. Files: this package, root Node/types configuration and lockfile, execution/security evidence. Excludes blobs, checkpoints, backup/restore, executor/runtime/DAG, policy approvals, providers and UI. Rollback: revert this task's commits; preserve database files and obtain authorization before any destructive migration. Fresh databases use schema v1; no downgrade is performed.

## Boundary

`EventStore`, `StoredEvent`, `AttemptIdentity`, `AttemptProjection` and `PersistenceError` are defined without SQLite imports. Import the implemented adapter with `openSqliteEventStore(absoluteDatabasePath)` from `@beonforge/persistence`. It returns the replaceable asynchronous `EventStore` port:

```ts
const store = await openSqliteEventStore(authorizedAbsolutePath);
try {
  const record = await store.append(validatedEvent, 'stable-idempotency-key');
  const events = await store.readEvents();
  const attempt = await store.getAttempt({ runId, blockId, attemptId });
  await store.rebuildProjection();
} finally {
  await store.close();
}
```

The database path is trusted application configuration, not a tool/user-supplied relative path. The parent directory must already exist; existing file symlinks are rejected. Canonical-path registration prevents duplicate handles in one process. This is not a cross-process leader election or filesystem sandbox. Only one application owns the writer; other processes must not open competing adapter instances. SQLite still serializes transactions across processes and returns typed `busy` rather than silently retrying.

## Runtime and durability

The root engine is pinned to **Node 24.19.0**. The adapter verifies that exact version and queries the real SQLite library in memory, requiring **3.53.3 before opening the target database**. The worker sets and verifies WAL/FULL; foreign keys are enabled, extension loading disabled and busy timeout is 100 ms (not a hard deadline). Unrecognized branded/schema versions or nonempty unrelated databases fail closed before journal changes. Migration 0→1 creates tables, triggers, application_id and user_version in one transaction. No accepted domain contract changes.

One owned worker performs every SQL call, including initialization, reads, replay and close; the main event loop only exchanges DTOs. Requests are serialized by the worker, acknowledged after COMMIT, and have a 10-second watchdog. The watchdog closes the handle and terminates the worker; it is not a hard interruption guarantee for a synchronous native call. Worker failure, watchdog expiry or an unconfirmed rollback reports `outcome_unknown` for unacknowledged appends and fails the handle closed. There is no worker restart/retry. Reopen and inspect the log; retrying the same **log append** with the same key is safe, but reexecuting an external effect is not implied.

## Invariants

- `sequence` is global commit order, starts at 1 and is contiguous; `occurredAt` is data, not ordering authority. Event IDs and idempotency keys are globally unique within one database. Keys use the same 1–128 ASCII identifier shape as contract identifiers.
- Input events are parsed with the accepted v1 parser. Fixed parser output order makes JSON canonical for this schema. Same key + same canonical event returns the original record, even after restart; changed payload or reuse of eventId with another key is `idempotency_conflict`, with no write/key/sequence consumed.
- Event insert, key reservation and projection update share BEGIN IMMEDIATE/COMMIT. Any known failure rolls back all three. SQL triggers reject UPDATE/DELETE of events; no arbitrary SQL API is exposed. Privileged database-file tampering is not prevented or cryptographically authenticated.
- A start creates a confirmed `pending` attempt with no result. A finish must match a pending `(runId, blockId, attemptId)` and can occur once. Manifest remains identical across retries within a run/block. Only a previously failed block may receive a new attempt ID; pending, uncertain, succeeded and cancelled block attempts cannot silently restart.
- `pending` means there is a start but no confirmed finish; effects may already have happened. `uncertain` is an explicit reported unknown outcome. Neither is converted into failed/succeeded during recovery, and neither authorizes reexecution. A succeeded attempt still does not approve task/merge. Reconciliation/approval needs its own future policy facts; no resolution override is introduced here.
- Opening/rebuild validates the ordered event log, then replaces only the derived projection in one transaction. Replay never invokes handlers or tools. Invalid stored versions, inconsistent identities or gaps are rejected. Rebuild failure rolls back the previous projection. Startup full replay and readEvents currently materialize the entire log in the worker: initial local scale only, no pagination, queue-capacity or checkpoint guarantee yet.

Diagnostics are fixed typed codes without raw SQL, paths or event content. Stored event messages/evidence references are not redacted by the store: authorized producers must supply safe summaries, and directory permissions must protect the database. No plaintext logs or credentials are emitted. FULL crash guarantees remain subject to filesystem/hardware behavior; this task does not prove power-loss safety or implement backups/checkpoints (B02b-02).

## Verification

Tests import compiled exports; source and consumer declarations are typechecked without paths aliases. Real temporary SQLite files test reopen/replay, canonical idempotency/conflicts, ordering/concurrent calls, SQL-trigger fault injection and rollback, unsupported schema/event versions, immutable history, BUSY with a responsive main timer, worker termination/lost acknowledgement, and child-process kill with a confirmed pending attempt. No database durability mocks or production fault-injection switches.

Run frozen install, peers and root `pnpm.cmd check` under the evaluated Node binary. `@types/node` is a pinned development-only dependency required for strict TypeScript native APIs; there is no new runtime dependency except the accepted workspace contracts. The root gate also runs the existing contracts and SQLite spike tests. Next node: **B02b-02**, not implemented here; M01.2 remains open until its gates/review are satisfied.
