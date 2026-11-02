# B04-01b — Fixed simulated process supervisor

This example uses the compiled runtime and SQLite/CAS contracts. Native Node
24.19.0 executes the TypeScript example; runtime test typecheck includes it.
No new package, dependency, public runtime export, domain schema or scheduler.
It is not a Codex adapter and never executes a model, provider or user command.

## Operations and authority

`previewSimulatedRequest(request)` validates the synthetic payload and returns a
SHA-256 binding mode, exact payload bytes, limits and both trusted script hashes.
`runSimulatedProcess(store, runId, request, grant, signal?)` requires current own
data properties canRead/canRun, runId and requestSha256. Accessors, inherited
grants and proxies do not grant authority. The trusted caller supplies an existing
private DurableStore; no database path discovery/catalog/initialization API.

Only the existing fake-agent.mjs and the private lifeline preload are allowed,
with fixed hashes, canonical paths and regular single-link files. The binary is
the current approved process.execPath. No arbitrary executable, argv, shell,
environment, cwd or output destination is accepted. The fixture directory is
readable; the child's environment contains only SystemRoot plus Node's internal
IPC setup. Scripts/host/runtime/private ancestors are trusted; privileged-owner
replacement during syscalls is outside this boundary (R-067).

The kernel records a durable block start before spawn. A single workflow node
uses existing effects/external authorization, events, projections and checkpoints.
Request metadata, not raw stdin, binds the immutable plan. Results contain only a
versioned synthetic summary, exit code/signal, byte/chunk counts, reason, closed
observation and the fixed public proposal on success. No raw stderr, reasoning,
credentials or arbitrary process output is persisted. Unexpected output is data,
never a command. A proposal is not permission to apply it.

`inspectSimulatedProcess(store, runId, grant)` needs own canRead/runId, rechecked
around CAS reads, and returns historical attempt/evidence bytes. The store checks
CAS integrity. Returned bytes remain data, not authenticated operator assertions
or live-worktree authorization. No patch/worktree operation is performed by b.
No default retryFailed, resume or repair is offered. Pending/uncertain attempts
block subsequent calls; confirmed results are recovered without another process.
Read-only grants cannot dispatch. After loss of SQL finish the start remains
pending even when the process actually returned successfully.

## Limits and protocol

- Input: 1..65536 bytes, fatal UTF-8, exact schema/hex fields and canonical JSON
  body with optional trailing ASCII whitespace. BOM and duplicate keys rejected
  before writes. The payload contains only synthetic identifiers, not a prompt.
- Modes: success, fragmented, invalid-json, fail, wait; no arbitrary commands.
- stdout/stderr: configurable 1..65536 bytes **per stream**. Overflow stops the
  child. No accumulation of raw streams: stdout is incrementally compared against
  the exact canonical two-line synthetic protocol. This rejects malformed JSON,
  duplicate/extra fields, BOM, excess lines, incomplete output and unapproved
  content. It is deliberately not a generic JSONL parser. stderr is counted only.
- Duration: 50..5000ms after spawn plus at most1000ms confirmation wait after
  termination request. A separate kernel15s deadline is cooperative, not a promise
  about database queue waits. Cancellation/revocation are observed before dispatch
  and during execution (revocation polling20ms); no instantaneous or retroactive
  guarantee for already started effects. First observed stop reason wins.
- Concurrency: one process invocation per supervisor module/process, not a global
  SQLite/multiprocess leader. Trusted caller serializes access across processes.
- Child Node uses --permission, filesystem reads only in the trusted fixture
  directory, no child-process/worker grants, and V8 old-space32MiB. **This is not
  a total RSS/CPU quota, OS sandbox or network sandbox.** No CPU/job/memory or
  egress guarantees are asserted. Those missing controls block broader/untrusted
  code or real-agent execution; they are not supplied by a worktree or Node flags.

The supported process cannot create descendants through Node child_process;
an integration probe verifies that denial. No generic Windows descendant killer
or Job Object is implemented. A fixed IPC preload exits the direct child when its
parent channel disconnects, including supervisor SIGKILL tested on this host. It
does not promise protection from a hostile process disabling that mechanism.
Normal runs wait for close before confirming any result. If close is not observed
within the termination wait, record uncertain and keep this module blocked until
actual close; no automatic retry/cleanup. Observation of close proves only this
direct child ended, not remote computation or arbitrary descendants.
For pre-dispatch denial/cancellation, closed:true denotes that no child exists;
it does not claim that a process ran or emitted close. Its exit code remains null.

## Evidence and restrictions

Tests use private temporary SQLite stores and only maintained synthetic process
fixtures; no software target repository is needed in this block. BeonForge is
maintained as product, never used as an agent bugfix target. New target repositories
under D-043 are required for the later bugfix demonstration. No external services,
credentials, Ollama, real agents, git mutation or provider calls occur here.

Tests exercise actual subprocesses, byte-exact limits/fragmentation, malformed
input, BOM/duplicate policy, grant inheritance/getters/revocation, single active
invocation, confirmed reopen/second reader process, lost finish after a real
process effect and actual supervisor SIGKILL with direct-child disappearance.
They do not prove general sandboxing, power-loss durability or exactly-once.
The accepted fake fixture is unchanged. No human approval or integration is made.

To enable a real Codex task later: explicit owner authorization compatible with
D-043 for provider/model/payload/credentials, official CLI/version/profile
compatibility, verified host/tool/filesystem/network confinement and cancellation,
then a new synthetic Git/worktree/context and generated-code validation/tests/diff.
The local API/Angular vertical follows D-046; neither is implemented by this block.

## Request snapshot hardening

Request fields mode/payload/timeoutMs/maxOutputBytes must be own data properties
when present. Required mode/payload cannot be inherited. Accessors and proxies
are rejected without invoking getters. Validation, grant binding and argv use
only captured values; input bytes are copied before asynchronous work. Grants
remain live and revocable, not snapshotted. Known cancellation before dispatch
is persisted as cancelled with evidence and no child, never failed/uncertain
merely because it was cancelled. Delayed/lost close confirmation still produces
uncertain; no implicit retry. The focused tests delay close notification of a
real terminated child, then verify durable uncertainty and no redispatch.

Residual audit followups: no SIGKILL escalation is implemented (SIGTERM on POSIX,
TerminateProcess on Windows per audit). IPC lifeline messages are not byte-bounded
by maxOutputBytes. Both limits remain open and acceptable only for this trusted
fixture; broader/untrusted processes or real Codex require a separately verified
termination and IPC boundary. No new Job Object, signal escalation or generic IPC
is implemented by this correction. Network/CPU/RSS/descendant limits remain.
