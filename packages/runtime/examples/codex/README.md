# B04-01c.1 — Local Codex sandbox preflight

## B04-01c.1b correction — both Codex outcomes BLOCKED

P1-1 is confirmed: the original Node descendants used libuv's implicit Jobs.
Their disappearance on normal exit was **not evidence of MXC tree cleanup**.
That attribution is withdrawn. `TREE` now uses detached descendants to avoid
those Jobs. The corrected real diagnostic cannot currently start MXC, so its
normal/forced MXC observations remain unverified, not transferred from the old run.

The bounded Windows helper in `windows/PreflightJob.cs` uses native Win32 APIs
through C#/.NET Framework, compiled locally with the inbox Framework64 csc.
It is a managed PE with a CLR dependency, not a standalone native C++ binary.
No compiler/runtime installation, agent adapter or general supervisor is added.
Only its authored fixture, or Codex's fixed `--version` / `sandbox` diagnostic,
can be launched. See [the evidence and review scope](../../../../docs/execution/reviews/b04-01c1b-evidence.md).

The helper creates Codex suspended, atomically associates (PROC_THREAD_ATTRIBUTE_JOB_LIST) a non-inheritable, unnamed Job with
only KILL_ON_JOB_CLOSE (neither breakaway flag), checks membership, then resumes.
The child never inherits the Job handle. Atomic creation avoids an orphaned suspended process if the launcher dies before a separate assignment call. Codex receives only an explicit stdio
handle list; fixture descendants inherit no handles. Association failure kills the
still-suspended child. No process is assigned retrospectively.
Pinning uses held read handles denying write/delete sharing, SHA-256,
canonical final paths, physical file identity and single-link checks. Codex and
the adjacent code-mode-host are checked before version/sandbox dispatch; both
hashes are fixed in source. This does not authenticate the vendor or protect
against a hostile administrator or concurrent replacement of ancestor directories.

Synthetic direct execution passes normal cleanup by the launcher, five forced
terminations under 500ms, explicit nested Jobs and launcher death. The fixture
uses CreateProcessW, no Job of its own, and a separate 30s safety expiry that
cannot count as success. Original process handles and Job emptiness are checked;
launcher-death observations also include the associated conhost PIDs. Negative
controls without a Job retain child/grandchild, then clean them by owned handles.

**A. Codex lifecycle: BLOCKED.** Baseline and Job-wrapped Codex both report
`native MXC is unavailable on this executor`. Requested backend is distinguished
from observed backend. No successful MXC launch, effective helper chain, nested
MXC/Job compatibility or five successful MXC cancellations is demonstrated.
**B. Whole-host confinement: BLOCKED.** Jobs constrain lifecycle of their members,
not filesystem or network. Services, WMI/COM/brokers and other out-of-tree creation
can escape ordinary process inheritance; none is permitted or tested here. A
Codex helper created through those routes cannot be claimed to belong to our Job.
No external traffic, credentials, setup command or full-access fallback is used.

Explicit diagnostics (canonical absolute binary path for CODEX):

```text
node packages/runtime/examples/codex/windows-job-cli.mjs --allow-local-synthetic-job-probes synthetic
node packages/runtime/examples/codex/windows-job-cli.mjs --allow-local-mxc-probes CODEX
```

Reports/logs and build/source/compiler hashes stay in newly created private
beonforge-c1b-* temp roots, retained for independent review. Exit2 records BLOCKED,
including a successful synthetic-only lifecycle test. Ordinary Vitest gates build
the helper and exercise synthetic processes only; they never execute Codex.

The following describes the original diagnostic. Its normal-exit attribution
has been withdrawn; historical hashes/logs are retained, not promoted to proof.

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

The original local run recorded startup and filesystem/loopback sentinels.
Normal-exit tree cleanup was confounded by libuv Jobs and is withdrawn as MXC
evidence. Forced termination of Codex did **not** remove
the synthetic tree within500ms. The tree disappeared later through self-expiry;
the diagnostic left no observed survivors after settling. This does not establish
forced tree termination or cancellation of a future agent.

The official command sandbox does not by itself prove the boundary of the CLI
host or agent tools; no agent session is authorized to test those here. Thus the
overall report is always BLOCKED/readyForAgent:false at this stage, even when
commandSandbox alone passes. There is no caller-controlled override to PASS.

Windows Job Objects were not implemented in the original c.1; c.1b above adds
a bounded diagnostic. Containing only the CLI is insufficient evidence that workloads
launched through MXC helpers/brokers belong to the same job before execution.
Membership, nested-job compatibility, lifecycle and no-escape race would need real
tests; retroactive PID assignment is not accepted as a guarantee. A Job Object
would not fix filesystem/network/host trust on its own. No speculative native
production launcher or infrastructure is authorized by this diagnostic.

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
