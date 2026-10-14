# AGENTS.md — Mohamed App Factory

You are an engineering agent working in this repository. This file is the
authoritative entry point for how work is performed here. It is **not** the
sole normative source: accepted Architecture Decision Records (ADRs) outrank
it for architectural decisions (see precedence below).

## First actions

1. Read this file completely.
2. Read `docs/DECISIONS.md`, then every ADR under `docs/adr/` that touches
   your task.
3. Discover skills (see "Skills") and load every one whose trigger matches
   your task.

## Instruction precedence

When sources disagree, the higher-precedence source wins.

1. **Mechanical enforcement** — CI, lint, type checking, Nx dependency
   boundaries, database constraints, RLS, tests. Never overridable by prose.
2. **Accepted ADRs** — `docs/DECISIONS.md` + `docs/adr/*`.
3. **This file** (AGENTS.md).
4. **Activated skills** — `.agents/skills/*`.
5. **Other repository documentation.**
6. **External references** — inspiration only, never normative.

Material or consequential conflicts or ambiguities between sources must be
surfaced, never silently resolved. Trivial implementation ambiguity may be
resolved locally (see "Working rules").

An explicit user request directs the work, but if it conflicts with an
accepted ADR or an architectural invariant, surface the conflict instead of
silently breaking the architecture.

## Architectural truth

- Architectural decisions live in `docs/DECISIONS.md` (index) and
  `docs/adr/*` (records). These are the source of truth for accepted
  decisions.
- An accepted ADR is immutable: never silently contradict it, and never edit
  an accepted ADR to change its meaning — including not editing it to add a
  status marker. A consequential change requires a new, superseding ADR that
  links to the one it replaces.
- Unresolved consequential choices must be surfaced for a decision — never
  silently selected.
- Apply these rules using the `decision-governance` skill.

## Skills

Skills are procedural guidance in `.agents/skills/`, authored in the open
Agent Skills format. Load a skill's full instructions when its trigger matches
your task.

- If your harness auto-discovers `SKILL.md` files, use that.
- Otherwise, read `.agents/skills/README.md` (the manifest) and load each
  matching skill.

See `.agents/skills/README.md` for the complete current skill manifest and
triggers.

## Mandatory lifecycle

understand → plan → implement → test → review → verify

| Stage | Skill | Exit |
|---|---|---|
| Understand | `decision-governance` | Relevant ADRs read; conflicts surfaced |
| Plan | `implementation-planning` | Small, reversible, testable steps |
| Implement | `test-driven-development` | Code written against a failing test |
| Test | `test-driven-development` | Fresh test evidence for the change |
| Review | `code-review` | Findings recorded and resolved |
| Verify | `verification-before-completion` | Definition-of-Done evidence produced |

## Dependency and boundary rules

ADR-0001 is authoritative for dependency and architectural boundaries. Do not
restate or strengthen those rules here; if a task touches them, read ADR-0001
directly.

- Operational pointer: these rules become mechanical enforcement when the
  scaffold exists; until then, `code-review` checks conformance.

## Working rules

- Small, reversible changes. YAGNI. Reuse before building (check existing
  modules and mature libraries first).
- Keep documentation in sync with code, in the same change.
- No completion claim without fresh, applicable verification evidence — apply
  `verification-before-completion`.
- Material or consequential conflicts or ambiguities must be surfaced with
  the conflict, the specific rule, and the options. Trivial implementation
  ambiguity may be resolved locally when the choice is reversible and does
  not affect architecture, product behavior, security, data integrity, or an
  accepted decision (examples: local variable naming, non-semantic
  formatting, ordering of equivalent internal steps). Requiring escalation:
  architecture, security/authorization, tenancy, data model, external
  contracts, irreversible migrations, accepted ADR conflicts, and
  consequential product behavior.

## Portable process, repository-specific policy

- General engineering technique lives in skills (portable).
- Project architecture and accepted decisions live in ADRs and this file
  (repository-specific).
- Skills teach how to apply policy; they must not duplicate it.
- Rules that can be enforced deterministically migrate to tooling/CI when the
  scaffold exists. Prose is for judgment, never for what tooling can check.

## Supplemental autonomous execution protocol

Read [AUTONOMOUS EXECUTION PROTOCOL — FULL POWER MODE 2026](docs/agent-system/AUTONOMOUS_EXECUTION_PROTOCOL.md) as supplemental execution guidance.

- This protocol does not replace this repository's existing instruction precedence, accepted architecture/product decisions, skills, or verification gates. Surface consequential conflicts rather than silently overriding them.
- It grants no additional tools, credentials, permissions, budget, or authorization. Platform/tool safety requirements and the owner's current task-specific restrictions remain binding.
- Scope capability discovery to the task; reuse verified findings. Prefer targeted remote file reads for cross-repository assessment. Do not bulk-clone repositories, install dependencies, or provision resources merely to inventory capabilities. Obtain task-appropriate authorization first.
- Keep discovery read-only by default. Preserve secrets; detect credential availability without printing values. Use bounded, evidence-based retries and report genuine blockers.
- Creating this guidance does not approve moving Nile into Platform, combining their runtimes, changing either stack, or merging branches. Such choices require separate evidence and owner approval.
