# ADR-0002 — Durable evidence before model execution

- Date: 2026-10-25
- Status: accepted
- Owners: BeonForge
- Related task: F00-05

## Context

An agent conversation cannot reliably answer which steps succeeded after a process crash. The plan requires a run to fail, preserve evidence and resume without repeating valid blocks. Providers may change later.

## Options considered

1. Implement deterministic block contracts, event/artifact stores, DAG and checkpoints before model adapters.
2. Connect a model first and use conversation history as progress state. This has no durable replay or trustworthy idempotency.
3. Adopt a complete external agent/workflow framework first. That postpones validation of BeonForge's contracts and recovery semantics.

## Decision

Use option 1. Fase 01 must demonstrate create → multi-block execution → failure → evidence → resume → no repeated valid block → verifiable completion. ModelProvider, registry, probes, evals, data classification, routing policy, secret handling, observability, fallback and disable mechanisms gate later model adoption.

## Consequences

The first vertical is deliberately useful without IA. It must version events and artifacts, classify errors, make effects explicit and prove recovery. No empty adapter counts as completion. This order delays model demos but produces a testable baseline.

## Revisit trigger

If the deterministic demo cannot satisfy the recovery contract with the chosen design, amend the contract or storage through an ADR and tests before adding providers.
