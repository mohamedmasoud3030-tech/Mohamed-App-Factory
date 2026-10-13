# Architecture Decision Records

This directory holds the project's Architecture Decision Records (ADRs) — the durable record of *why*
the system is shaped the way it is.

## Why these exist

Decisions made in conversation are lost. Decisions recorded here survive, can be reviewed by a new agent
or a new colleague, and can be deliberately superseded later. If a structural choice is not written down,
it will be re-litigated — usually by an AI agent that has no way to know it was already decided.

## Numbering and status

- ADR numbers are assigned **when a decision is accepted**, in order. Numbers are never reused and never
  reordered, even if the proposals that led to them used different numbers.
- A decision found in `docs/architecture/proposals/` is **not** a decision until it appears here.
- Status values: `Proposed` · `Accepted` · `Superseded by ADR-NNNN` · `Deprecated`.

## Format (MADR, abbreviated)

```
# ADR-NNNN — Title

- Status: Accepted
- Date: YYYY-MM-DD
- Deciders: Mohamed (product owner), ChatGPT (technical strategist), Arena (implementation)
- Supersedes: —  /  Superseded by: —

## Context
What situation forced a decision. Facts, not preferences.

## Decision
The decision, in the active voice, stated so it can be checked.

## Consequences
What becomes easier. What becomes harder. What we are now committed to.

## Alternatives considered
What else was on the table, and the specific reason each was rejected.

## Review trigger
The condition under which this decision should be reopened. "Never" is an acceptable answer
if it is deliberate.
```

## Index

| ADR | Title | Status | Date |
| --- | --- | --- | --- |
| [0001](0001-localization-arabic-rtl-first.md) | Arabic and RTL are first-class requirements, English remains the repository language | Accepted | 2026-10-13 |
| 0002 | Build vs. adopt: custom platform on permissively-licensed components | **Pending** — awaiting review of [proposal 0002](../architecture/proposals/0002-open-source-reuse-audit.md) | — |
| 0003 | First application | **Pending** — gated on customer access (§10.2 of proposal 0002) | — |
| 0004 | Tenant isolation strategy | **Pending** — build tenant-aware by default in the meantime | — |

Decisions still open, with their blocking state, are tracked in
[proposal 0001 §13](../architecture/proposals/0001-platform-strategy.md).
