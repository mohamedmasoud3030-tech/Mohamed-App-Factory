# Reuse & Provenance Log — Nile engines extraction (2026-10-13)

Every file under `engines/` is either (a) extracted from one of Mohamed's own
repositories (originals untouched, clean `origin` URLs, token never persisted),
or (b) newly written generic code whose patterns are credited below.
Excluded by design: `teste` (third-party MIT template by JCodesMore — a tool,
not a company asset) and `Test` (457-line experiment with tracked ZIPs).

## Extracted verbatim (provenance header inside each file)

| Nile file | Source repo / path |
|---|---|
| `engines/transactions/src/{decimal,cash,costing,units,line,regrade}.ts` | `bug-free-garbanzo` (kayyal) `src/domain/` |
| `engines/transactions/test/golden.test.ts` | `bug-free-garbanzo` `tests/domain/golden.test.ts` — golden financial results; **may never change without an ADR** |
| `engines/transactions/src/money-minor.ts` | `Terranex` `src/shared/money/index.ts` — canonical storage/API money: integer minor units |
| `engines/transactions/src/money-by-currency.ts` | `Terranex` `src/shared/money/by-currency.ts` (import path adapted) |
| `engines/platform/src/locale/{arabic,dates,phone}.ts` | `starting` (Hospitality Ops) `src/lib/` |

## Adapted (concept kept, app coupling removed)

| Nile file | Source | Adaptation |
|---|---|---|
| `engines/platform/src/idempotency.ts` | `Terranex` `src/shared/idempotency` | App `ActionState` type replaced by minimal `CommandState` |
| `engines/people/src/attendance.ts` | `larabeauty-` `src/domain/attendance.ts` | `AttendanceStatus` inlined; late/overtime helpers added |
| `engines/catalog/src/catalog.ts` (validation) | `starting` `features/catalog/catalogForm.ts` | Money moved to integer minor units; Arabic messages kept |

## New generic code (patterns credited)

| Nile file | Pattern sources |
|---|---|
| `engines/booking/src/booking.ts` | Appointment lifecycle = `larabeauty-` entities (server-enforced stages); day grouping = `starting` calendarModel, re-timezoned to Africa/Cairo |
| `engines/transactions/src/money-bridge.ts` | Resolves the inventory's "3 competing money implementations" warning: minor-units for storage/API, Decimal for arithmetic, conversion only here |
| `engines/platform/src/tenant.ts` | ADR-0002/0005 invariants (transaction-local `app.tenant_id`, fail-closed RLS) |
| `engines/platform/src/branding.ts` | Nile benchmark feature "try it with your name" (visitor-local only) |
| `engines/people/src/payroll.ts`, `engines/catalog/src/catalog.ts` (rest) | Domain rules from the Nile benchmark brief (HR tasks, variant stock states, installment calculators, lead pipeline) |

## Not yet extracted (next phases, in order)

1. DB layer per engine: Drizzle schemas + RLS migrations — adapting
   `bug-free-garbanzo/db/migrations/0002-0005` and `starting` migration 0079
   (delegated permissions), executed as the runtime (non-owner) DB role.
2. Auth: Better Auth + Organization plugin per ADR-0005, seeded demo accounts
   (`demo1234`) + daily demo-data reset job.
3. API contracts: REST/OpenAPI via NestJS (ADR-0006); `platform` repo's
   `lib/api-zod` + `tools/verify-*` + `pnpm-workspace.yaml` supply-chain
   hardening when the workspace moves to Nx + pnpm (ADR-0001).
4. UI shells per system (POS first) on top of these engines — screens last.
