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

Run from repo root:

```bash
npm install
npm run typecheck
npm test
```

Extraction provenance for every file: `docs/REUSE.md`.
