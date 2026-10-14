# Supavisor source provenance (evidence for finding S1)

The analysis read these files from `supabase/supavisor` at commit `5df5caf10694bb68ddd3eca14ac005832de40427` (`main`, 2026-10-08).
The copies are **not** included in this repository (third-party code; `AGENTS.md` requires a `docs/REUSE.md`
entry for copied code). Retrieve them from the pinned URLs below; the git blob SHA lets you confirm that you
are reading the same bytes the analysis read.

| File | Blob SHA in GitHub tree API | Blob SHA of analysed copy | Same? | SHA-256 of analysed copy |
| --- | --- | --- | --- | --- |
| `lib/supavisor/protocol/startup_options.ex` | `97b0a492b83d8673a1bb3983ea4e1db165554098` | `97b0a492b83d8673a1bb3983ea4e1db165554098` | match | `646490f202f9c6e207408d83240382a3252315b2e150a7a7b4b79f71f066906b` |
| `lib/supavisor/client_handler/protocol_helpers.ex` | `bc9ea8da1d83186d58ac917d6008364b855103ad` | `bc9ea8da1d83186d58ac917d6008364b855103ad` | match | `3ac9a6ea4fdb65048b555efa8693b391d51e9900c80a603877410148e0c19dd7` |
| `lib/supavisor/db_handler.ex` | `e33d121ab4664947d422e387552c6c6c56d36fef` | `e33d121ab4664947d422e387552c6c6c56d36fef` | match | `e85445ebb014fa4586e80e74aeba6fb101aec83701fce0c55524e8724c338490` |
| `lib/supavisor/client_handler.ex` | `4307568f51d707aa77647abf84aad2746ff6fd0e` | `4307568f51d707aa77647abf84aad2746ff6fd0e` | match | `73ad6c633c7bd3f6edd1ca3f1bb1c41f693b65e99cd72d17fd7d8da3889cf35d` |
| `lib/supavisor/protocol/server.ex` | `3e136e82e6a7a595e7100f40ba90b66f65dd2a38` | `3e136e82e6a7a595e7100f40ba90b66f65dd2a38` | match | `82aa0be2b345af05e82823d71ebc41e5c47e53ee04319a9d06bde2cd5ff41217` |
| `lib/supavisor/helpers.ex` | `56a104d842d2b8a9dce44a06138cd405ca378afa` | `56a104d842d2b8a9dce44a06138cd405ca378afa` | match | `3b8044273c5daa8981dee8bda6b85d7013fdbb5a0a1a2ecda9ea4d705946af10` |

Pinned URL pattern: `https://github.com/supabase/supavisor/blob/5df5caf10694bb68ddd3eca14ac005832de40427/<file>`

## Lines the finding rests on (read them at the pinned commit)

| File | Lines | What they show |
| --- | --- | --- |
| `lib/supavisor/protocol/startup_options.ex` | `validate` | Unknown startup options such as `role` are kept, not rejected, so the client sees no error |
| `lib/supavisor/client_handler/protocol_helpers.ex` | 56–84 | Only `search_path`, `jit`, `client_tls`, `client_ip` and `log_level` are extracted from client options |
| `lib/supavisor/db_handler.ex` | 316–323 | The upstream options map holds only `search_path` (plus `client_tls`, `jit`, `client_ip` when proxying) |
| `lib/supavisor/db_handler.ex` | 865–885 | `send_startup` encodes only that map in the upstream StartupMessage |
| `lib/supavisor/client_handler.ex` | 276 | The pool id is keyed by tenant, user, mode, db, `search_path` and `upstream_tls`, not by `role` |

Conclusion (VERIFIED from source; the version deployed by Supabase is NOT VERIFIED): a client's
`options=-c role=nile_app` is accepted but never reaches PostgreSQL through Supavisor, in session or
transaction mode.
