# G-7 runtime-role adversarial evidence (2026-10-14)

Raw evidence for the adversarial review of the G-7 candidate `60342be628151ffebe23919ea69409e4b63eda99`
(branch `investigation/g7-runtime-role-boundary-incomplete`). **The candidate is not a security fix** (decision
REVISE). Analysis: [`docs/reviews/2026-10-14-g7-redesign-design-review.md`](../../../docs/reviews/2026-10-14-g7-redesign-design-review.md) (PROPOSED).

`artifacts/adversarial-60342be/` is copied byte-for-byte from the agent's local evidence folder and still verifies
against its own `MANIFEST.sha256` (18 entries). Its `README.txt` says "Do not commit"; that note predates the owner's
2026-10-14 authorisation to publish the evidence on a non-`main` branch.

| Path | Contents |
| --- | --- |
| `review60b/` | Fresh clone at `60342be`, PostgreSQL 18.4: `matrix.mts` + `out-matrix.txt` (17 vectors accepted, P5 refused), `role-and-deploy.mts` + `out-role-deploy.txt` (V17: `nile_app` itself in `pg_execute_server_program` is accepted; `ALTER ROLE … SET role` behaviour), `out-c3-with-pr4.txt` (C3 column UPDATE and M3 MAINTAIN on `audit_log` after PR #4), tsc and vitest outputs |
| `review60/` | Original probe copies |
| `review60m/c3.mts` | C3/M3 probe on a throwaway merge `60342be` + PR #4 |
| `design-catalog-facts/` | Catalog-coverage (`pg_shdepend`) and impact probes for the redesign |

The same matrix was rerun on PostgreSQL 15.18 and 17.10 in
[`tools/spikes/supabase-feasibility/artifacts/`](../supabase-feasibility/README.md) (`*/matrix.txt`).
