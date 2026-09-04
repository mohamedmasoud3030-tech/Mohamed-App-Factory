---
name: verification-before-completion
description: Use before claiming any work is complete, fixed, or passing. Run the verification commands and confirm fresh output before making any success claim; evidence before assertions, always.
---

# Verification Before Completion

**Core principle:** evidence before claims, always. No completion claim without
fresh verification evidence.

## The gate

Before claiming any status:

1. **IDENTIFY** the command that proves the claim.
2. **RUN** the full command now (fresh, complete).
3. **READ** the output; check the exit code and failure counts.
4. **VERIFY** the output confirms the claim. If not, state the actual status.
5. Only then make the claim, citing the output.

## Definition of Done — evidence required

Before claiming a task is complete:

- [ ] **Tests** — command run; 0 failures.
- [ ] **Lint** — command run; 0 errors.
- [ ] **Typecheck** — command run; 0 errors.
- [ ] **Build** — command run; exit 0.
- [ ] **Permission/tenant checks** — where the change touches access control,
      the relevant checks are exercised (see ADR-0002 and ADR-0004).
- [ ] **Requirement-by-requirement** — each requested item verified against
      fresh evidence, or explicitly reported as not done.
- [ ] **Fresh output** — every claim cites output produced in this session,
      not a remembered or earlier run.

## Common failures

| Claim | Requires fresh output of |
|---|---|
| Tests pass | the test command, 0 failures |
| Lint clean | the lint command, 0 errors |
| Build succeeds | the build command, exit 0 |
| Bug fixed | the original symptom reproduced, then passing |
| Requirements met | item-by-item verification |

## Red flags — STOP and run the command

- "should", "probably", "seems to", or expressing success before verifying.
- Trusting a previous run or an agent's success report as evidence.

## References

- `code-review` — review quality first, then apply this gate before claiming
  done.
- `AGENTS.md` — evidence-before-completion rule; this skill is the canonical
  Definition of Done.
- Sources and licensing: `docs/agent-system/REFERENCES.md`.
