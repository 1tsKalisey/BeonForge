# M04.1 — Synthetic deterministic bugfix

This example connects the existing compiled kernel, SQLite/CAS worker, workspace
and context APIs. Its TypeScript orchestration is executed by approved Node
24.19.0 and typechecked with runtime tests. It is not a coding agent or a generic
command/patch runner. No Ollama, external provider, network, package installation,
remote repository, real credential or other project is used.

`prepareBugfixDemo(parent)` requires an explicitly authorized **empty private
canonical directory**. It creates a new disposable Git repository dedicated to
BeonForge. It never accepts an existing repository as target. Templates in
fixture.ts are synthetic: add(2,2) incorrectly subtracts, with one known assertion.
The fixed correction changes only `return a - b` to `return a + b`.

Structure: a new beonforge-bugfix-* child contains project, worktrees, storage,
evidence and process directories. No automatic repository discovery or transition
to real projects. Caller-owned private ACLs/ancestors are required; POSIX checks
the parent owner/mode, Windows relies on operator ACLs. Canonical spelling is
required (including Windows long paths); comma/glob/control characters in the
parent are rejected to avoid ambiguous Node permission flags.

## Separate operations, no default human approval

1. `prepareBugfixDemo(parent)` creates/registers the synthetic project, commits its
   known bytes on the fixture branch, creates a detached worktree from that exact
   commit, and builds ContextPackage/Envelope from four explicitly selected files.
   Returns private root/destination/references and exact patch preview/hash.
2. `runBugfixDemo(root, policy, signal?)` requires own `canRead`, `canRun`,
   `canPatch`, matching root and preview `patchSha256`. It runs red → fixed patch →
   green → diff/evidence through executeWorkflow. Red is accepted only for the
   known assertion with exactly one failed test; unrelated process failures never
   count as reproduction. Green requires the same unchanged test to pass.
3. `inspectBugfixDemo(root, policy)` requires own canRead/root and reopens the real
   store. Returns historical verified context/map, worktree history/current state,
   evidence and review status. Context references do not authorize live operations.
4. `reviewBugfixDemo(root, decision, evidenceSha256, policy, signal?)` requires own canReview
   and the exact confirmed evidence hash. `discard` additionally needs canDiscard,
   the unchanged postimage and all workspace permissions/identities. Approval only
   records a caller-supplied decision; **no integration, merge, commit or push**.
   Discard restores the original bytes, checks the original red assertion and an
   empty tracked diff. The immutable green evidence remains historical.

The demo stops at **review: pending** after run. Automated tests of the decision
branches supply synthetic caller decisions; they are not human approval of this
milestone or authenticated identities. A successful workflow never supplies a
decision on behalf of the owner. No authority comes from a CAS reference.

## CLI (one operation per invocation)

Build BeonForge with its official gates first. From packages/runtime, the fixed
CLI is `node examples/bugfix/cli.mjs`. Supply actual authorized canonical paths and
hashes from the previous output; placeholders below are documentation, not grants:

```text
prepare --parent AUTHORIZED_EMPTY_PARENT --allow-create-synthetic
run --root ROOT --allow-fixture-read --allow-fixture-execution --allow-fixed-patch --patch-sha256 PREVIEW_HASH
inspect --root ROOT --allow-fixture-read
review --root ROOT --allow-fixture-read --allow-fixture-review --decision approve --evidence-sha256 EVIDENCE_HASH
review --root ROOT --allow-fixture-read --allow-fixture-review --allow-discard --decision discard --evidence-sha256 EVIDENCE_HASH
```

Do not run either review example without the corresponding explicit decision.
Exit codes: success/inspection 0, typed diagnostic 1, blocked unknown
2, applicable cancellation 130. SIGINT/SIGTERM request cooperative cancellation;
forced termination can leave pending/uncertain effects. No automatic retries.
Exit 1 is not proof that no external effect occurred: storage errors can follow
an applied patch with a lost finish. Inspect/reopen the same root; never infer
permission to retry from an exit code. Only prepare may initialize storage:
run/inspect/review reject a missing, empty or unsafe database without recreating it.

## Safety and recovery limits

- Only exact fixture files and contents are executable. Tracked/untracked/ignored
  additions, changed test bytes, links/hardlinks, replaced pinned directories,
  drift or invalid worktrees fail closed. Existing Git config parser/attribute/OID
  and permission checks are reused. The original fixture branch/index/config and
  files remain intact during run/review; preparation changes only its authorized
  shared administrative metadata to create the worktree.
- Before every sensitive step revalidate paths, directory identities, original
  commit, worktree state, bytes and live own-property grants. Rewrite uses a
  verified file handle, exact pre/postimage, flush/fsync and a single allowed path.
  All mutation handlers declare external effects. Durable block starts precede
  effects, with a separate exclusive fsynced patch dispatch preventing duplicate
  writes even if the result is lost. Intent/dispatch is not proof of completion.
- Commands use fixed argv without shell, a minimal isolated environment, private
  HOME/TEMP, no inherited Node/Git injection, empty hooks/templates, bounded output
  (64 KiB per stdout/stderr stream) and a 10 s process timeout. The test Node process uses `--permission`
  with only worktree filesystem reads, no filesystem-write/child/worker grants and
  test isolation none. Only safe summaries are stored, never raw stderr/stack paths.
- **This is not an OS sandbox or a network sandbox.** Node filesystem permission
  checks are defense in depth, not protection from a hostile owner changing
  ancestors during syscalls or arbitrary untrusted code. The fixture/test/handler
  are known trusted synthetic code, with no network operations. Git/PATH/runtime
  and private roots must be trusted and exclusively used by the operator. Do not
  generalize this permission to agents or unknown projects; those require later
  process/egress/tool controls and explicit owner decisions under D-043.
- Kernel timeouts remain cooperative, 60 s per block. Pending handler work is
  awaited before closing SQLite; cleanup settlement can delay the return. A cut
  after dispatch or partial write blocks recovery; no retry, overwrite, rollback,
  unlock or directory cleanup occurs automatically. The review intent is exclusive
  and fsynced; a missing SQL finish remains pending/uncertain, never confirmed by
  the marker alone. Confirmed decisions are checked against SQLite/CAS receipts;
  malformed, truncated or contradictory markers fail closed.
- SQLite, filesystem bytes, CAS and markers do not form a distributed transaction.
  SIGKILL tests demonstrate process crash recovery, not power-loss durability,
  exactly-once across all effects, caller authentication or a multiprocess leader.
  The patch receipt prevents repeated writes; callers must still serialize runs.
  Orphans/incomplete preparations are retained; removal requires a separate safe
  decision. Product code has no delete/prune or automatic transition to real use.

Tests create only new private synthetic directories, compare original inventories
and outside synthetic sentinels, exercise permissions, red/green/diff, explicit
review/discard, revocation, links/configuration/injection, lost SQL confirmation,
review interruption and real SIGKILL with recovery from another process.
