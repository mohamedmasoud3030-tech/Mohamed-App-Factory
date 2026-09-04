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

When sources disagree, the higher-precedence source wins. On any conflict or
ambiguity between sources, STOP and surface it — do not silently choose.

1. **Mechanical enforcement** — CI, lint, type checking, Nx dependency
   boundaries, database constraints, RLS, tests. Never overridable by prose.
2. **Accepted ADRs** — `docs/DECISIONS.md` + `docs/adr/*`.
3. **This file** (AGENTS.md).
4. **Activated skills** — `.agents/skills/*`.
5. **Other repository documentation.**
6. **External references** — inspiration only, never normative.

An explicit user request directs the work, but if it conflicts with an
accepted ADR or an architectural invariant, surface the conflict instead of
silently breaking the architecture.

## Architectural truth

- Architectural decisions live in `docs/DECISIONS.md` (index) and
  `docs/adr/*` (records). These are the source of truth for accepted
  decisions.
- An accepted ADR is immutable: never silently contradict it, and never edit
  an accepted ADR to change its meaning. A consequential change requires a
  new, superseding ADR that links to the one it replaces.
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

Current skills: `decision-governance`, `implementation-planning`,
`test-driven-development`, `systematic-debugging`, `code-review`,
`verification-before-completion`. See the manifest for triggers.

## Mandatory lifecycle

understand → plan → implement → test → review → verify

| Stage | Skill | Exit |
|---|---|---|
| Understand | `decision-governance` | Relevant ADRs read; conflicts surfaced |
| Plan | `implementation-planning` | Small, reversible, testable steps |
| Implement | `test-driven-development` | Code written against a failing test |
| Test | `test-driven-development` | Tests, lint, typecheck pass locally |
| Review | `code-review` | Findings recorded and resolved |
| Verify | `verification-before-completion` | Definition-of-Done evidence produced |

## Dependency and boundary rules (accepted in ADR-0001)

- Dependencies flow `apps → modules → platform → shared` only. No reverse
  dependencies.
- Business/domain logic belongs in backend modules, never in UI pages.
- Cross-module access only through each module's public API.
- No distributed infrastructure, message brokers, or premature abstractions.
- These become mechanical enforcement when the scaffold exists; until then
  they are review gates.

## Working rules

- Small, reversible changes. YAGNI. Reuse before building (check existing
  modules and mature libraries first).
- Keep documentation in sync with code, in the same change.
- No completion claim without fresh verification evidence — apply
  `verification-before-completion`.
- When repository instructions conflict or are ambiguous, surface the issue
  with the conflict, the specific rule, and the options — never guess.

## Portable process, repository-specific policy

- General engineering technique lives in skills (portable).
- Project architecture and accepted decisions live in ADRs and this file
  (repository-specific).
- Skills teach how to apply policy; they must not duplicate it.
- Rules that can be enforced deterministically migrate to tooling/CI when the
  scaffold exists. Prose is for judgment, never for what tooling can check.
