# Mohamed App Factory

A reusable application factory for business applications (sales management, property & rental
management, and future applications).

The repository is the project's persistent technical memory: architecture, decisions, module
contracts, and procedures live here — not in chat conversations.

## Current status

**Pre-implementation — architecture and planning. No application code is written until the open decisions
are resolved.**

| Document | Purpose |
| --- | --- |
| [docs/architecture/proposals/0001-platform-strategy.md](docs/architecture/proposals/0001-platform-strategy.md) | Platform strategy: repository architecture, module strategy, stack, first milestone, open decisions |
| [docs/architecture/proposals/0002-open-source-reuse-audit.md](docs/architecture/proposals/0002-open-source-reuse-audit.md) | Adopt vs. integrate vs. build: licence analysis, candidate evaluation, and the recommendation for the first application |
| [docs/adr/](docs/adr/) | Architecture Decision Records — the durable record of decisions actually made |

**Decided so far:** Arabic and RTL are first-class product requirements; English remains the repository
language ([ADR-0001](docs/adr/0001-localization-arabic-rtl-first.md)).

**Open, and blocking implementation:** whether the factory is a product for external customers or internal
automation (proposal 0002 §10.3), the first application, tenant isolation, and the stack.

The canonical documents (`AGENTS.md`, `ARCHITECTURE.md`, `PRODUCT.md`, `MODULES.md`, `CONTRIBUTING.md`)
and the first implementation milestone will be created once those decisions are settled.

## Working language

All repository content — code, identifiers, comments, documentation, commit messages, pull requests,
and issues — is written in **English**.
