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
| [docs/architecture/proposals/0002-open-source-reuse-audit.md](docs/architecture/proposals/0002-open-source-reuse-audit.md) | Adopt vs. integrate vs. build: licence analysis, candidate evaluation, first-application recommendation |
| [docs/architecture/proposals/0003-option-c-spike.md](docs/architecture/proposals/0003-option-c-spike.md) | The adopted-ledger option: architecture, boundary rules, a 3-day spike with pass/fail measurements and kill criteria |
| [docs/architecture/proposals/0004-option-c-results.md](docs/architecture/proposals/0004-option-c-results.md) | Measured spike results against a live Odoo Community instance — evidence, costs, and what remains unmeasured |
| [docs/reviews/0001-nile-engines-db-auth-review.md](docs/reviews/0001-nile-engines-db-auth-review.md) | Review of `main`'s Nile engines: DB integration, authentication, tenant isolation — 13 findings with executable evidence |
| [tools/spikes/option-c/](tools/spikes/option-c/) · [tools/spikes/nile-review/](tools/spikes/nile-review/) | Reproducible probe scripts behind those measurements (throwaway evidence, not application code) |

> **Two document worlds exist.** `main` carries ADRs 0001–0006 and the architecture assessment; this
> branch carries proposals 0001–0004. They were authored in parallel and are not yet reconciled — the ADR
> numbering collides. See [docs/adr/README.md](docs/adr/README.md) and review 0001 §4.
| [docs/adr/](docs/adr/) | Architecture Decision Records — the durable record of decisions actually made |

**Decided so far:** Arabic and RTL are first-class product requirements while English remains the
repository language ([ADR-0001](docs/adr/0001-localization-arabic-rtl-first.md)); the factory is a product
business, with Mohamed's own companies as customer zero.

**Open, and blocking implementation:** whether an adopted ledger (Option C) or a fully custom stack
(Option D) is the end state — decided by the spike in proposal 0003; the pilot domain and first
application, which needs Mohamed's input on which of his own businesses has the sharpest recurring pain;
tenant isolation.

The canonical documents (`AGENTS.md`, `ARCHITECTURE.md`, `PRODUCT.md`, `MODULES.md`, `CONTRIBUTING.md`)
and the first implementation milestone will be created once those decisions are settled.

## Working language

All repository content — code, identifiers, comments, documentation, commit messages, pull requests,
and issues — is written in **English**.
