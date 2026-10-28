# BeonForge repository instructions

These instructions apply to the repository. The user's current request takes precedence.

## Source and scope

- Read `docs/execution/status.md` before work, then the active task in `docs/execution/phases/` and `docs/product/software-factory-objective.md`. The supplementary specification is the 23 documents under `knowledge/AI/18 BeonForge Agentic OS` when available; record its absence and consult linked vault notes only as needed.
- Never modify files under `knowledge/`. Preserve `.claude/` and other user files. Both directories are intentionally ignored by this Git repository.
- Work on one bounded task at a time. Record objective, files, exclusions, acceptance, gates, rollback and next node. Update status, coverage, decisions and risks after acceptance.
- Codex is the only writer in initial phases. Do not invoke Claude Code or other agents. The user supplies independent reviews.

## Architecture

- Keep the control plane a modular monolith in strict TypeScript. Domain contracts must not import provider SDKs. Use versioned schemas at boundaries, explicit effects, evidence and recoverable state.
- Limit the kernel to orchestration, persistence, states, recovery, permissions and coordination. Reuse supported OpenCode and Codex interfaces for coding-agent capabilities.
- Complete the deterministic durable kernel before model adapters, automatic routing, OmniRoute, subagents or the Angular dashboard. Do not add distributed orchestration, a graph/vector database or a monorepo framework without measured need and an ADR.
- No empty package or interface counts as an implemented capability. Mark coverage only with functional code, contracts, tests, documentation, security, observability, demo/evidence and recovery appropriate to that capability.

## Git and gates

- Confirm `git rev-parse --show-toplevel` resolves to the current BeonForge checkout before Git mutations. If Git reports dubious ownership, use `git -c safe.directory=<verified-absolute-root>` per command; never reuse another computer's path, change the user's global Git settings or touch the parent Desktop repository.
- Keep commits cohesive. Inspect staged paths and diff. Never use destructive Git operations to resolve a problem.
- On Windows use `pnpm.cmd`. Current local gates: `pnpm.cmd install --frozen-lockfile`, `pnpm.cmd peers check`, `pnpm.cmd check`, and `git diff --check`. Record any gate that cannot run and its risk.
- Scan changed files for secrets and out-of-scope edits. Do not persist secret values, sensitive prompts or private reasoning in logs or artifacts.

## Approvals and review

- Ask the user before material data deletion or overwrite, external publication, deployment, billing, credential use, major architecture changes, feature removal or deliberate incompatibility.
- At an important milestone, prepare `docs/execution/reviews/current-review-packet.md`, then wait for the review supplied by the user. Reproduce and classify each finding before changing code; confirmed fixes get a separate commit and rerun all gates.
