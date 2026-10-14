# Supabase feasibility evidence (2026-10-14)

Evaluation probes and raw outputs for
[`docs/reviews/2026-10-14-supabase-feasibility.md`](../../../docs/reviews/2026-10-14-supabase-feasibility.md). Status: evidence only (tier 5).
Not part of the test suite: `tsconfig.json` and `vitest.config.ts` only include `engines/` and `apps/`.

| Path | Contents |
| --- | --- |
| `probes/run-version.sh` | Per-version runner: throwaway cluster → emulation probe → G-7 and merged suites on real PostgreSQL → adversarial matrix → stop and delete the cluster |
| `probes/supa-emul.mts` | Supabase-condition emulation (E0–E12): non-superuser CREATEROLE owner, legacy vs. new default grants to `anon`/`authenticated`, pooler-mode `ALTER ROLE … SET role`. Ran from the merged tree's `.probe/` (imports `../engines/db/open.ts`) |
| `probes/matrix.mts` | The adversarial matrix from `tools/spikes/g7-runtime-role/artifacts/adversarial-60342be/review60b/matrix.mts` with only the port parameterised (`PGPORT_TEST`) |
| `probes/summ.py`, `probes/linkcheck.py` | Summarise vitest JSON; check relative Markdown links at a commit |
| `artifacts/pg15`, `pg17`, `pg18` | Per version: `initdb.log`, `server.log`, `supa-emul.txt`, `vitest-g7-pg.*`, `vitest-merged-pg.*`, `matrix.txt` (PG 15 also has the incomplete run 1 and the rerun log) |
| `artifacts/pg17-run1-nile_app-preexisting` | First PG 17 run, preserved unedited: it failed because `nile_app` already existed (finding E0) |
| `artifacts/tsc-*.log`, `vitest-*-default.log` | Type check and no-database suites, G-7 and merged trees |
| `artifacts/MANIFEST.original.sha256` | The local evidence manifest as written (49 entries). It also lists the Supavisor source copies, which are **not** published here |
| `MANIFEST.sha256` | Checksums of every file published in `artifacts/` and `probes/` (paths relative to this folder) |
| `supavisor-source-provenance.md` | Pinned URLs, blob SHAs and line references for the Supavisor source (finding S1) |

Excluded on purpose: the copied Supavisor source files and the GitHub `tree.json` listing (third-party code; retrieve
them at the pinned commit). Nothing else was removed. No credentials appear in these files: the clusters used
`--auth=trust` on 127.0.0.1 and were deleted after each run.

Reproduce (needs `@embedded-postgres/linux-x64` binaries for 15, 17 and 18, and two trees: a clone detached at
`60342be` with `matrix.mts` in `.probe/`, and a clone at `60342be` with `git merge --no-commit --no-ff 784e50c` staged
and `supa-emul.mts` in `.probe/`). See the header of `run-version.sh`; paths inside it are those of the original machine.
