# B04-01c.1 — Local Codex sandbox preflight

This diagnostic invokes only pinned Codex 0.166.0 `--version` and `sandbox`
commands with authored synthetic programs. No `exec`, model, auth command,
subscription credential or external service is used. Default quality gates never
invoke real Codex. This is not an agent adapter, generic sandbox or dispatch grant.

The caller supplies an explicitly authorized, empty, canonical directory under
the real system temp root named beonforge-c1-authorized-*, a canonical binary path
and an explicit true local-probe authorization. The fixed binary SHA-256 is
9d563ee4e0441ff9d59d612013e0460ddf8e5709735c2d9f6b98b7ef8ca4eb42.
Paths/ancestors must be physical and regular; aliases/junctions and binary
hardlinks are rejected. Hash is rechecked before every invocation. No executable,
commands, profile or environment are selected by a repository or model.

`runCodexPreflight(parent, binary, allowLocalSandbox, store)` creates only a new
probe-* child. The trusted caller supplies an existing private ArtifactStore.
The CLI creates a fresh private SQLite store automatically, never overwrites or
opens operator data, and prints the report/root/store/ref. Reopen that store and
read the ref to verify the persisted diagnostic. Report CAS is integrity, not
authenticity or authorization; no report enables a future agent automatically.

## Fixed profile and observations

Only MXC is requested, explicitly; no legacy/full-access fallback or OS setup.
Private CODEX_HOME/LOCALAPPDATA/TEMP/TMP and a minimal environment exclude user
config, credential variables and proxies. Private analytics are disabled. Managed
requirements are included. Generated config hash is recorded, not claimed to be
a complete dump of merged effective permissions. No global settings/accounts,
firewall or installation are changed by the diagnostic commands.

The profile denies filesystem root, allows minimal runtime and workspace reads,
one precreated out/allowed.txt write and disables network. Sentinels contain only
authored public strings: positive read/write controls, denied outside read/write,
and denied new workspace write. Parent-owned ephemeral loopback TCP server is
positively reachable by the controller before sandbox testing. No DNS, port11434,
private IP, Internet or provider endpoint is tested. A timeout/connection failure
other than permission denial is inconclusive. External egress is not demonstrated
by a loopback test. Native Node eval avoids main-file realpath startup failure
under root-deny without widening read permissions; the eval code is fixed here.

The tree fixture creates an actual root/child/grandchild inside MXC. All three
must be visible from the host before termination evidence counts. Normal root
exit occurs after300ms; forced cancellation terminates the owned Codex process.
Tree absence is observed at1000ms/500ms, respectively, and must occur before
the independent4s self-expiry. The receipt carries the earliest expiry computed before descendant spawn; the controller also requires observation before that deadline. Delayed observations are inconclusive. No external
PID is killed: process.kill(pid,0) only observes synthetic receipts. A reused PID
or permission error can conservatively block, never authorize a dispatch.

The4s timer is diagnostic cleanup, **not proof of confinement**. After4500ms
additional settling the report separately records cleanup confirmation. Programs
do not write outside their sentinels or create infinite background processes.
The launcher has10s/64KiB per stream limits, then1s to observe its own close;
missing close/overflow never becomes a successful observation. No raw stderr,
private paths or probe contents go into CAS: only sanitized facts/hashes and exit
metadata. The CLI's operator-facing output contains private diagnostic locations.

## BLOCKED is a valid diagnostic result

The real local run demonstrated MXC startup, all filesystem sentinels, loopback
denial and normal-exit tree cleanup. Forced termination of Codex did **not** remove
the synthetic tree within500ms. The tree disappeared later through self-expiry;
the diagnostic left no observed survivors after settling. This does not establish
forced tree termination or cancellation of a future agent.

The official command sandbox does not by itself prove the boundary of the CLI
host or agent tools; no agent session is authorized to test those here. Thus the
overall report is always BLOCKED/readyForAgent:false at this stage, even when
commandSandbox alone passes. There is no caller-controlled override to PASS.

Windows Job Objects are evaluated as a possible next narrowly scoped control,
not implemented: containing only the CLI is insufficient evidence that workloads
launched through MXC helpers/brokers belong to the same job before execution.
Membership, nested-job compatibility, lifecycle and no-escape race would need real
tests; retroactive PID assignment is not accepted as a guarantee. A Job Object
would not fix filesystem/network/host trust on its own. No speculative native
launcher or infrastructure is added while these independent blocks remain.

## Opt-in operation

After explicit owner authorization of local probes, with actual canonical paths:

```text
node packages/runtime/examples/codex/preflight-cli.mjs --parent AUTHORIZED_EMPTY_TEMP_PARENT --binary PINNED_NATIVE_CODEX --allow-local-sandbox-probes
```

Exit2 means BLOCKED evidence was successfully produced; exit1 is invalid or
unconfirmed diagnostic execution, not permission to retry. Probe roots/evidence
are retained for review, no destructive cleanup of operator artifacts. Tests
clean only their own verified temporary directories.

No target software repository or bugfix is needed for a process diagnostic; no
existing project is inspected or used. A future agent task still requires a NEW
synthetic Git repository/worktree/context under D-043. Host/caller/private temp
ACLs/runtime are trusted (R-067); no hostile-owner atomic filesystem guarantee,
CPU/RSS/network sandbox of the controller, power loss, exactly-once or global
leader is claimed. R-057/061/065/066/067 remain open. c.2/c.3 are not implemented.
