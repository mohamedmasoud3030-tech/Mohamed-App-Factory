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
 *   `RESET ROLE` returns to it rather than to the login. The login itself is
 *   also checked: it must not be able to become a superuser, a BYPASSRLS role
 *   or the owner of any table (otherwise `SET ROLE <login>` would escape RLS).
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

interface RoleRow {
  role: string;
  role_privileged: boolean;
  role_owner: boolean;
  login: string;
  login_privileged: boolean;
  login_owner: boolean;
}

/**
 * Fail closed: the runtime connection must run as exactly `nile_app`, and
 * neither it nor (with `checkLogin`) the session login may be able to become a
 * role that bypasses RLS: a superuser, a BYPASSRLS role, or the owner of any
 * relation (owners are exempt from non-forced RLS and keep UPDATE/DELETE on
 * append-only tables). `pg_has_role(.., 'MEMBER')` covers the role itself and
 * every role it can reach by membership, i.e. everything `SET ROLE` can reach.
 */
export async function assertRuntimeRole(db: NileDb, opts: { checkLogin?: boolean } = {}): Promise<string> {
  const res = (await db.execute(sql`
    WITH owners AS (
      SELECT DISTINCT c.relowner AS oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname <> 'information_schema' AND n.nspname NOT LIKE 'pg\_%'
    )
    SELECT current_user AS role,
      EXISTS (SELECT 1 FROM pg_roles x WHERE (x.rolsuper OR x.rolbypassrls)
              AND pg_has_role(current_user, x.oid, 'MEMBER')) AS role_privileged,
      EXISTS (SELECT 1 FROM owners o WHERE pg_has_role(current_user, o.oid, 'MEMBER')) AS role_owner,
      session_user AS login,
      EXISTS (SELECT 1 FROM pg_roles x WHERE (x.rolsuper OR x.rolbypassrls)
              AND pg_has_role(session_user, x.oid, 'MEMBER')) AS login_privileged,
      EXISTS (SELECT 1 FROM owners o WHERE pg_has_role(session_user, o.oid, 'MEMBER')) AS login_owner`)) as unknown as {
    rows: RoleRow[];
  };
  const row = res.rows[0];
  if (!row) throw new UnsafeRuntimeRoleError('cannot determine runtime role');
  if (row.role !== RUNTIME_ROLE) {
    throw new UnsafeRuntimeRoleError(
      `runtime role is "${row.role}", expected "${RUNTIME_ROLE}"; refusing to start (ADR-0005 §7, G-7)`,
    );
  }
  if (row.role_privileged || row.role_owner) {
    throw new UnsafeRuntimeRoleError(
      `runtime role "${row.role}" can become a superuser or BYPASSRLS role or owns tables; refusing to start (ADR-0005 §7)`,
    );
  }
  if (opts.checkLogin) {
    if (row.login_privileged) {
      throw new UnsafeRuntimeRoleError(
        `runtime login "${row.login}" is (or can become) a superuser or BYPASSRLS role; use a dedicated non-privileged login (G-7)`,
      );
    }
    if (row.login_owner) {
      throw new UnsafeRuntimeRoleError(
        `runtime login "${row.login}" owns tables (or can become their owner): use the migration owner only in MIGRATION_DATABASE_URL (G-7)`,
      );
    }
  }
  return row.role;
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
