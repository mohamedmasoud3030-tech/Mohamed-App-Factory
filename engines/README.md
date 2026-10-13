# Nile Engines

Framework-agnostic domain cores for the Nile demo platform. Pure TypeScript —
no DB, no HTTP, no UI. Persistence (Drizzle + PostgreSQL RLS, ADR-0004/0005),
API (NestJS/Fastify REST + OpenAPI, ADR-0001/0006) and apps plug in behind
these contracts. **Rule: no product screen is built before its engine exists
and is tested.**

| Engine | What it owns | Main sources |
|---|---|---|
| `platform/` | Tenant context (fail-closed, ADR-0002/0005), command idempotency, visitor branding, Arabic/date/phone locale utils | Terranex, starting, ADR-0005 |
| `transactions/` | Exact money (integer minor units = canonical storage; Decimal = in-domain arithmetic, bridged in `money-bridge.ts`), invoice lines, weighted-average costing, cash drawer/shifts, regrade allocation | bug-free-garbanzo (kayyal), Terranex |
| `booking/` | Resources, availability slots, double-booking prevention, booking lifecycle state machine, booking codes, day grouping (Africa/Cairo) | larabeauty-, starting |
| `catalog/` | Items/variants/stock states, discounts, installment calculators, storefront validation, lead pipeline (all sites → one admin inbox) | starting, Nile benchmark |
| `people/` | Attendance/lateness/overtime, leave balances, loan schedules, payslips | larabeauty- |

## Wave 2 — persistence & contracts (done)

- `engines/*/src/db/schema.ts` — module-owned Drizzle schemas (ADR-0004).
- `engines/db/migrations/0001_nile_engines.sql` — tables, per-tenant composite
  uniques, and fail-closed RLS (`FORCE ROW LEVEL SECURITY`) for all 15 tables.
- `engines/platform/src/db/with-tenant.ts` — the only tenant-scoped SQL path
  (transaction-local `app.tenant_id`, ADR-0005 §5).
- `engines/*/src/contracts.ts` — Zod request contracts for the REST/OpenAPI
  edge (ADR-0006). `engines/platform/src/demo-seed.ts` — demo tenant + the 14
  demo role accounts (`demo1234`, hashed by the auth layer at seed time).
- `engines/db/test/rls.test.ts` — real-PostgreSQL (PGlite) proof of the
  ADR-0005 invariants, executed as a non-superuser runtime role.

Run from repo root:

```bash
npm install
npm run typecheck
npm test
```

Extraction provenance for every file: `docs/REUSE.md`.
