# Nile — current state, handoff and task tracker

**Status:** canonical (tier 4 in `AGENTS.md`). This is the **only** live status and handoff document.
Update it in the same PR as any change that alters what is below. Do not create per-agent status files.

- **Last verified:** 2026-10-14, by the coordinating engineering agent, using `git ls-remote` and the
  GitHub API against `mohamedmasoud3030-tech/Mohamed-App-Factory`.
- **Re-verify before acting:** run `git ls-remote origin` and check open PRs. If the remote differs from
  this file, the remote is right; fix this file.

## 1. Repository state

| Item | Value | Verified how |
| --- | --- | --- |
| `main` | `ebcfe722ebeaba1ed4eebef1c42eae9a7cb399a8` (merge of PR #3) | `git ls-remote` |
| CI | **None.** There is no `.github/` workflow, so PRs show no checks | repository tree; GitHub API: 0 check runs on PR #4 |
| Tests on `main` | typecheck exit 0; `npm test` 9 files, 91/91 | run locally 2026-10-14 |
| Schema drift on `main` | `drizzle-kit check`: fine; `generate`: no changes | run locally 2026-10-14 |

## 2. Pull requests and branches

| Ref | Head | State | Notes |
| --- | --- | --- | --- |
| PR #4 `fix/nile-gate-ledger-append-only-demo-lock` | `784e50c` (base `ebcfe72`) | **OPEN, not merged** | Fixes G-1, G-2. Review: [APPROVE, by the PR author; independent review not available](reviews/2026-10-14-pr4-review.md). **Merge needs the owner's authorisation** |
| `docs/source-of-truth-cleanup` | see its PR | Documentation cleanup (this file, `AGENTS.md`, ADR-0010, evidence consolidation) | Based on `ebcfe72`. Contains the three Odoo-evidence consolidation commits `d81cf97`, `bf23dad`, `ce6f328` |
| `arena/bfcb5ed1-mohamed-app-factory` | `e61cd06` | Odoo evaluation branch; **HISTORICAL evidence, never merge wholesale** | Forked at `bb0cb4f`, 16 commits behind `main`. Its relevant files are imported (with provenance) by the cleanup branch. Keep the branch |
| `arena/01a06b01-…`, `feat/nile-engines-v1`, `feat/nile-engines-wave2-db`, `feat/nile-e2e-auth-sale` | `e74167b`, `3916924`, `949228f`, `b602a57` | **MERGED IN `main`** (each is an ancestor of `ebcfe72`) | Proposed for deletion; needs owner approval (see the cleanup inventory) |

## 3. Decisions

- **ACCEPTED:** ADR-0001…0007, ADR-0009, ADR-0010. ADR-0010 records the owner's D1: engines continue
  while the ledger provider is open.
- **PROPOSED:** ADR-0008 (build vs. adopt; Odoo conditionally recommended, **not adopted**); proposals
  0002–0007.
- **OPEN (owner):** D2 (ERPNext measurement), D3 (ETA credential ownership and a pilot), D4 (ledger budget
  and licence). See [proposal 0006](architecture/proposals/0006-ledger-decision-memo.md) §9.
- **ADR-vs-code gaps** (ADR-0001 Nx/pnpm/CI, ADR-0002 per-vertical apps, ADR-0003 Milestone 1 scope):
  [`ARCHITECTURE.md`](ARCHITECTURE.md) §3.

## 4. Implementation status (from code at `ebcfe72`)

- **Implemented on `main` and tested:** tenancy with fail-closed RLS; Better Auth organizations and 14
  demo roles; the sale path (login → permission → tenant → persisted sale with lines, stock movements and
  an audit row; idempotent; atomic); catalog listing; generated migrations and runtime-role hardening.
- **Domain code only (no service, no API):** booking, people.
- **Not implemented:** payments (G-3), refunds, cash shifts, daily demo reset, any product UI, CI.

## 5. Next work, in order

| # | Task | Status | Gate |
| --- | --- | --- | --- |
| 1 | Owner reviews and authorises: PR #4 merge; the cleanup PR; the deletion proposals | WAITING ON OWNER | — |
| 2 | **G-7:** await `SET ROLE` in `engines/db/open.ts`; fail explicitly unless `current_user = 'nile_app'`; tests for a wrong login | **NEXT AUTHORISED ENGINE TASK** (no migration, independent of PR #4) | Reviewable PR; real-PostgreSQL test for the wrong-login case |
| 3 | Payment engine per [proposal 0007](architecture/proposals/0007-payment-engine.md) (tests first; real-PG concurrency tests) | BLOCKED BY PR #4 merge | New branch from the then-current `main` |
| 4 | G-4 CHECK constraints; G-10 booking `EXCLUDE` constraint | BLOCKED BY PR #4 merge | Migration numbering: PR #4 owns `0002`; generate new migrations only after it merges |
| 5 | Add the 3 untested locked paths to `e2e-sale.test.ts` §6b (PR #4 review, risk 1) | BLOCKED BY PR #4 merge | — |
| 6 | CI workflow (typecheck, tests, drizzle check); closes part of the ADR-0001/0003 gap | PROPOSED | Pushing workflows needs owner action |
| 7 | Translate `prototypes/*` Arabic documents to English | PROPOSED | Low priority |
| 8 | Cashier UI | BLOCKED BY #3 merged and tested, plus the UI blockers in §6 | — |

## 6. Open findings register

IDs: **G-n** = [post-merge security gate](reviews/2026-10-14-post-merge-security-gate.md); **H-n** =
[review 0001](reviews/0001-nile-engines-db-auth-review.md) (disposition in
[`architecture/README.md`](architecture/README.md) §5); **P4-n** = [PR #4 review](reviews/2026-10-14-pr4-review.md) §3.

| ID | Severity | Summary | Status |
| --- | --- | --- | --- |
| G-1 (= H4) | High | Runtime role could rewrite or delete ledger and audit rows | FIXED ON PR #4 `784e50c`; OPEN on `main` |
| G-2 | High | One visitor could lock out or deface shared demo logins | FIXED ON PR #4 `784e50c`; OPEN on `main` |
| G-3 | Medium | A sale stores no payment | OPEN: payment engine (task 3). **Cashier-UI blocker** |
| G-4 (= H7) | Medium | No CHECK constraints on money, quantity and enum columns | OPEN (task 4). Required before public exposure |
| G-5 | Medium | Dev mode trusts any origin; per-boot secret; insecure cookies; no rate limit | OPEN: deployment configuration. Required before public exposure |
| G-6 | Low | Origin/CSRF checks are skipped under `NODE_ENV=test` | OPEN |
| G-7 | Low | Unawaited `SET ROLE`; the role assertion accepts any non-bypass role | OPEN (task 2) |
| G-8 | Low | A failed `set-active` clears the caller's own active org | OPEN (fail-closed) |
| G-9 | Low | Idempotency keys are per tenant, not per user | OPEN (document) |
| G-10 (= H9) | Low | Booking overlap not enforced by the database | OPEN (task 4); before any booking API |
| G-11 | Low | OpenAPI document is public | OPEN (decide) |
| G-12…G-15 | Low/Info | `drizzle-kit push` false drift; no `db:migrate` script; dev-only audit warnings; non-uniform 400 body | OPEN |
| H12, H13 | Low | Deep cross-engine imports; modelling gaps | OPEN |
| P4-1…P4-6 | — | Test gap; no row locks on append-only tables; append-only status transitions; new tables need a REVOKE; `list-sessions` token exposure; reset must run as owner | OPEN: handled by tasks 3 and 5 and the rules in `AGENTS.md` |
| E-receipt | — | Egyptian B2C e-receipts (the cashier tax regime) never measured for any provider | OPEN (evaluation) |

## 7. Approvals required from the owner

1. Merge PR #4, ideally after a second, independent reviewer.
2. Merge the documentation cleanup PR.
3. Delete the four merged branches listed in §2, if wanted (optional; GitHub keeps PR refs).
4. Decide D2–D4 when ready. None of them blocks tasks 2–5.
