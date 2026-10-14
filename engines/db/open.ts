/**
 * ONE deterministic migration + connection path (ADR-0004), shared by the
 * API, the tests, and (later) the offline desktop builds.
 *
 *   migrate as OWNER  →  run as runtime role `nile_app`  →  assert the
 *   effective role IS `nile_app` and cannot bypass RLS (refuse to start
 *   otherwise; ADR-0005 §7, gate finding G-7).
 *
 * - PostgreSQL (production): DATABASE_URL = runtime login (member of
 *   nile_app); MIGRATION_DATABASE_URL = owner login. The role is a connection
 *   STARTUP setting (`-c role=nile_app`): the server applies it before the
 *   first query, refuses the connection if the login may not assume it, and
 *   `RESET ROLE` returns to it rather than to the login. `SET ROLE NONE` still
 *   returns to the login, so the login is checked too: it must gain nothing
 *   that `nile_app` lacks (see assertRuntimeRole).
 *   Deployment note: a `options=` parameter in DATABASE_URL overrides ours, and
 *   a pooler that drops startup options leaves sessions as the login; in both
 *   cases the startup assertion refuses to start (fail closed).
 * - PGlite (tests, dev, offline desktop): a real PostgreSQL engine in-process;
 *   single connection, so we migrate first and then `SET ROLE nile_app`. Its
 *   built-in login is a superuser by design, so only the effective role is
 *   checked there.
 */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import * as schema from './schema.js';

export { schema };
export const RUNTIME_ROLE = 'nile_app';
export const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url));

/**
 * One handle type for both drivers. Both are Drizzle `PgDatabase`s over the
 * same schema and expose `{ rows }` from execute(); we type them as the
 * node-postgres flavour so call sites are not a union of overloads.
 */
export type NileDb = NodePgDatabase<typeof schema>;

export interface OpenedDatabase {
  db: NileDb;
  driver: 'pglite' | 'postgres';
  close: () => Promise<void>;
}

export class UnsafeRuntimeRoleError extends Error {}

interface RoleCheckRow {
  who: 'role' | 'login';
  name: string;
  /** a reachable role that is a superuser or BYPASSRLS */
  privileged: string | null;
  /** an object owned by a reachable role: the database, a schema or a relation */
  owns: string | null;
  /** a privilege held by a reachable role but not by the runtime role */
  extra: string | null;
}

/**
 * Fail closed. The runtime connection must run as exactly `nile_app`, and the
 * runtime role and (with `checkLogin`) the session login must not be able to
 * gain more power than `nile_app`. "Reachable" means every role the subject can
 * `SET ROLE` to, i.e. itself and all roles it is a member of, directly or
 * through other roles (`pg_has_role(.., 'MEMBER')`, which also covers NOINHERIT
 * memberships). No reachable role may:
 * - be a superuser or BYPASSRLS;
 * - own the database, a non-system schema or a relation (owners can disable or
 *   drop RLS policies, drop tables, and are exempt from non-forced RLS);
 * - hold a table, schema-CREATE or database-CREATE privilege that `nile_app`
 *   does not hold (this covers direct grants and predefined roles such as
 *   pg_write_all_data, and keeps append-only REVOKEs meaningful).
 * Not covered: column-level grants, sequences, functions, and the PostgreSQL
 * 17 MAINTAIN privilege.
 */
export async function assertRuntimeRole(db: NileDb, opts: { checkLogin?: boolean } = {}): Promise<string> {
  const res = (await db.execute(sql`
    WITH subjects(who, name) AS (VALUES ('role', current_user::text), ('login', session_user::text)),
    reach AS (
      SELECT s.who, x.oid, x.rolname, x.rolsuper, x.rolbypassrls
      FROM subjects s JOIN pg_roles x ON pg_has_role(s.name, x.oid, 'MEMBER')
    ),
    schemas AS (
      SELECT n.oid, n.nspname, n.nspowner FROM pg_namespace n
      WHERE n.nspname <> 'information_schema' AND n.nspname NOT LIKE 'pg\\_%'
    ),
    rels AS (
      SELECT c.oid, c.relkind, c.relowner, format('%s.%s', sc.nspname, c.relname) AS name
      FROM pg_class c JOIN schemas sc ON sc.oid = c.relnamespace
    ),
    privs(p) AS (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'))
    SELECT s.who, s.name,
      (SELECT min(r.rolname) FROM reach r WHERE r.who = s.who AND (r.rolsuper OR r.rolbypassrls)) AS privileged,
      (SELECT min(o.what) FROM (
        SELECT 'database ' || d.datname AS what FROM pg_database d JOIN reach r ON r.oid = d.datdba AND r.who = s.who
          WHERE d.datname = current_database()
        UNION ALL
        SELECT 'schema ' || sc.nspname FROM schemas sc JOIN reach r ON r.oid = sc.nspowner AND r.who = s.who
        UNION ALL
        SELECT 'relation ' || rl.name FROM rels rl JOIN reach r ON r.oid = rl.relowner AND r.who = s.who
      ) o) AS owns,
      (SELECT min(e.what) FROM (
        SELECT pv.p || ' on ' || rl.name AS what FROM reach r CROSS JOIN rels rl CROSS JOIN privs pv
          WHERE r.who = s.who AND rl.relkind IN ('r', 'p', 'v', 'm', 'f')
            AND has_table_privilege(r.oid, rl.oid, pv.p) AND NOT has_table_privilege(current_user, rl.oid, pv.p)
        UNION ALL
        SELECT 'CREATE on schema ' || sc.nspname FROM reach r CROSS JOIN schemas sc
          WHERE r.who = s.who
            AND has_schema_privilege(r.oid, sc.oid, 'CREATE') AND NOT has_schema_privilege(current_user, sc.oid, 'CREATE')
        UNION ALL
        SELECT 'CREATE on database ' || current_database() FROM reach r
          WHERE r.who = s.who
            AND has_database_privilege(r.oid, current_database(), 'CREATE')
            AND NOT has_database_privilege(current_user, current_database(), 'CREATE')
      ) e) AS extra
    FROM subjects s`)) as unknown as { rows: RoleCheckRow[] };
  const role = res.rows.find((x) => x.who === 'role');
  const login = res.rows.find((x) => x.who === 'login');
  if (!role || !login) throw new UnsafeRuntimeRoleError('cannot determine runtime role');
  if (role.name !== RUNTIME_ROLE) {
    throw new UnsafeRuntimeRoleError(
      `runtime role is "${role.name}", expected "${RUNTIME_ROLE}"; refusing to start (ADR-0005 §7, G-7)`,
    );
  }
  const subjects = opts.checkLogin ? [role, login] : [role];
  for (const x of subjects) {
    const what = x.who === 'role' ? `runtime role "${x.name}"` : `runtime login "${x.name}"`;
    if (x.privileged) {
      throw new UnsafeRuntimeRoleError(
        `${what} is or can become a superuser or BYPASSRLS role ("${x.privileged}"); refusing to start (ADR-0005 §7, G-7)`,
      );
    }
    if (x.owns) {
      throw new UnsafeRuntimeRoleError(
        `${what} owns, or can become the owner of, ${x.owns}; the migration owner belongs only in MIGRATION_DATABASE_URL (G-7)`,
      );
    }
    if (x.extra) {
      throw new UnsafeRuntimeRoleError(
        `${what} holds, or can gain, a privilege that "${RUNTIME_ROLE}" lacks (${x.extra}); use a dedicated login (G-7)`,
      );
    }
  }
  return role.name;
}

/**
 * Re-wrap a startup failure WITHOUT the original error object: node-postgres
 * errors carry the client, including the connection password, and must not
 * reach logs. Only the SQLSTATE code and the server message are kept.
 */
function startupError(err: unknown): Error {
  if (err instanceof UnsafeRuntimeRoleError) return err;
  const e = err as { code?: unknown; message?: unknown; cause?: { code?: unknown; message?: unknown } };
  const code = typeof e?.code === 'string' ? e.code : typeof e?.cause?.code === 'string' ? e.cause.code : undefined;
  const message = typeof e?.cause?.message === 'string' ? e.cause.message : String(e?.message ?? err);
  if (code === '42501') {
    return new UnsafeRuntimeRoleError(
      `runtime login cannot assume the runtime role "${RUNTIME_ROLE}" (${code}: ${message}); grant it with GRANT ${RUNTIME_ROLE} TO <login> (G-7)`,
    );
  }
  return new Error(`cannot open the runtime database connection${code ? ` (${code})` : ''}: ${message}`);
}

export async function openPglite(opts: { dataDir?: string } = {}): Promise<OpenedDatabase> {
  if (opts.dataDir) mkdirSync(opts.dataDir, { recursive: true }); // first boot
  const client = opts.dataDir ? new PGlite(opts.dataDir) : new PGlite();
  const db = drizzlePglite(client, { schema }) as unknown as NileDb;
  await migratePglite(db as never, { migrationsFolder }); // as owner (PGlite default superuser)
  await client.exec(`SET ROLE ${RUNTIME_ROLE}`);
  await assertRuntimeRole(db);
  return { db, driver: 'pglite', close: () => client.close() };
}

export async function openPostgres(opts: { url: string; migrationUrl?: string }): Promise<OpenedDatabase> {
  if (opts.migrationUrl) {
    const owner = new pg.Pool({ connectionString: opts.migrationUrl, max: 1 });
    try {
      await migratePg(drizzlePg(owner, { schema }), { migrationsFolder });
    } finally {
      await owner.end();
    }
  }
  // Every pooled connection starts as the runtime role (startup option, see header).
  const pool = new pg.Pool({ connectionString: opts.url, options: `-c role=${RUNTIME_ROLE}` });
  const db = drizzlePg(pool, { schema });
  try {
    await assertRuntimeRole(db, { checkLogin: true });
  } catch (err) {
    await pool.end().catch(() => undefined);
    throw startupError(err);
  }
  return { db, driver: 'postgres', close: () => pool.end() };
}

export async function openDatabase(env: NodeJS.ProcessEnv = process.env): Promise<OpenedDatabase> {
  if (env.DATABASE_URL) return openPostgres({ url: env.DATABASE_URL, migrationUrl: env.MIGRATION_DATABASE_URL });
  return openPglite({ dataDir: env.NILE_PGLITE_DIR });
}
