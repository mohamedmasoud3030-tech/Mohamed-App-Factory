# Review scratch probes (2026-10-14), sanitized copies

Throwaway probes written while reviewing PR #4 (`pr4-review/`) and the post-merge gate on `main` (`verify/`).
They were never part of the suite and are kept for their test logic only. Status: evidence (tier 5).

- Original locations (agent machine, never committed, now git-ignored): `pr4/.scratch-review/`, `pr4/.list.mts`
  (published as `pr4-review/list-auth-endpoints.mts`) and `verify/.scratch/`.
- **Sanitized:** `pr4-review/pg-real.mts`. The original held two passwords for throwaway roles on a local cluster.
  They were replaced by `SCRATCH_OWNER_PASSWORD` / `SCRATCH_LOGIN_PASSWORD` environment variables; nothing else changed.
- All other files are verbatim. They contain only the public demo password `demo1234`, obvious dummy auth secrets
  (`'x'.repeat(48)`) and passwordless loopback URLs (`postgres://nile_login@127.0.0.1:5433/nile`).
- To run one, copy it back into a worktree root's `.scratch/` (imports are relative, e.g. `../engines/db/open.ts`) and
  point it at a disposable local cluster only.
