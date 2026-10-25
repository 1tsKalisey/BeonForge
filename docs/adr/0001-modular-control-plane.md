# ADR-0001 — Modular TypeScript control plane

- Date: 2026-10-25
- Status: accepted
- Owners: BeonForge
- Related task: F00-05

## Context

The plan requires durable blocks, workflow state, policy, tools and multiple future providers while keeping the domain independent of their SDKs. The first deployment is local and has one writer. Cross-process coordination has not been measured as necessary.

## Options considered

1. Modular monolith in Node.js and strict TypeScript, with domain, application, infrastructure and interface boundaries.
2. Distributed services or an external workflow engine from the start. This adds network, deployment and transaction costs before a deterministic kernel exists.
3. A provider or agent framework as the application core. This would couple domain semantics to a vendor or harness.

## Decision

Use option 1. Contracts and ports define stable boundaries; adapters implement storage, Git, tools and future model providers. Initial persistence is SQLite WAL and content-addressed filesystem blobs. The kernel and CLI precede providers and UI.

## Consequences

One local process can coordinate transactions and recovery. We must test module boundaries, schema versions, idempotency, backup/restore and failure resume. OpenTelemetry begins when runs become observable. The modular structure makes later extraction possible, but does not promise effortless distribution.

## Revisit trigger

Measure sustained multi-host coordination, volume or uptime needs that cannot be met by the monolith and SQLite. Evaluate Postgres/Temporal or service extraction only with those measurements and a migration/rollback plan.
