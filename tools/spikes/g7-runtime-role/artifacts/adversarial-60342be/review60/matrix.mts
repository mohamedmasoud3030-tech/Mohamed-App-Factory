export {};
/**
 * Adversarial escape matrix for G-7 @ 60342be. For each vector: create a login that is a member of
 * nile_app plus ONE extra capability; record whether openPostgres() accepts it; if accepted, connect
 * as that login exactly like the app does (startup role nile_app), run SET ROLE NONE, and try the
 * capability. The same attack is also run as the plain baseline login (control: must fail).
 */
import pg from 'pg';
import { existsSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { openPostgres } from '../engines/db/open.ts';

const s = randomBytes(3).toString('hex');
const db = `rv_${s}`;
const owner = `rv_owner_${s}`;
const marker = `/tmp/rv_pwned_${s}`;
const admin = new pg.Client({ host: '127.0.0.1', port: 5433, user: 'postgres', database: 'postgres' });
await admin.connect();
const A = (q: string) => admin.query(q);
const ver = (await A('show server_version')).rows[0].server_version;
await A(`CREATE ROLE ${owner} LOGIN CREATEROLE`);
await A(`CREATE DATABASE ${db} OWNER ${owner}`);
await A(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='nile_app') THEN CREATE ROLE nile_app NOLOGIN; END IF; END $$`);
const url = (u: string) => `postgres://${u}@127.0.0.1:5433/${db}`;
const base = `rv_base_${s}`;
await A(`CREATE ROLE ${base} LOGIN`);
await A(`GRANT nile_app TO ${base}`);
await (await openPostgres({ url: url(base), migrationUrl: url(owner) })).close();
const D = new pg.Client({ host: '127.0.0.1', port: 5433, user: 'postgres', database: db });
await D.connect();
const O = new pg.Client({ host: '127.0.0.1', port: 5433, user: owner, database: db });
await O.connect();
O.on('error', () => undefined); // P4 is expected to kill this session
await D.query(`REVOKE SELECT ON "account" FROM nile_app`); // C2 baseline: nile_app may not read account (restored at the end)
await O.query(`CREATE FUNCTION public.purge_users() RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = public
  AS $f$ WITH d AS (DELETE FROM "user" RETURNING 1) SELECT count(*) FROM d $f$`);
await O.query(`REVOKE EXECUTE ON FUNCTION public.purge_users() FROM PUBLIC`);

type V = { id: string; setup: (L: string) => Promise<unknown>; attack: string };
const vectors: V[] = [
  { id: 'C1 column-level UPDATE grant (drizzle migrations log)', setup: async (L) => { await D.query(`GRANT USAGE ON SCHEMA drizzle TO ${L}`); await D.query(`GRANT UPDATE (hash) ON drizzle.__drizzle_migrations TO ${L}`); }, attack: `UPDATE drizzle.__drizzle_migrations SET hash = 'tampered'` },
  { id: 'C2 column-level SELECT grant (password hashes in "account")', setup: async (L) => { await D.query(`GRANT SELECT (password) ON "account" TO ${L}`); }, attack: `SELECT password FROM "account" LIMIT 1` },
  { id: 'S1 sequence UPDATE grant', setup: async (L) => { await D.query(`GRANT USAGE ON SCHEMA drizzle TO ${L}`); await D.query(`GRANT UPDATE ON SEQUENCE drizzle.__drizzle_migrations_id_seq TO ${L}`); }, attack: `SELECT setval('drizzle.__drizzle_migrations_id_seq', 999999)` },
  { id: 'F1 EXECUTE on a SECURITY DEFINER function (revoked from PUBLIC)', setup: async (L) => { await D.query(`GRANT EXECUTE ON FUNCTION public.purge_users() TO ${L}`); }, attack: `SELECT public.purge_users()` },
  { id: 'F2 login owns a function in public', setup: async (L) => { await D.query(`GRANT CREATE ON SCHEMA public TO ${L}`); const c = new pg.Client({ host: '127.0.0.1', port: 5433, user: L, database: db }); await c.connect(); await c.query(`CREATE FUNCTION public.f() RETURNS int LANGUAGE sql AS 'select 1'`); await c.end(); await D.query(`REVOKE CREATE ON SCHEMA public FROM ${L}`); }, attack: `CREATE OR REPLACE FUNCTION public.f() RETURNS int LANGUAGE sql AS 'select 2'` },
  { id: 'T1 login owns a type in public', setup: async (L) => { await D.query(`GRANT CREATE ON SCHEMA public TO ${L}`); const c = new pg.Client({ host: '127.0.0.1', port: 5433, user: L, database: db }); await c.connect(); await c.query(`CREATE TYPE public.mood AS ENUM ('a')`); await c.end(); await D.query(`REVOKE CREATE ON SCHEMA public FROM ${L}`); }, attack: `ALTER TYPE public.mood ADD VALUE 'b'` },
  { id: 'M1 MAINTAIN grant on audit_log (PG17+): REINDEX', setup: async (L) => { await D.query(`GRANT MAINTAIN ON audit_log TO ${L}`); }, attack: `REINDEX TABLE audit_log` },
  { id: 'M2 member of pg_maintain', setup: async (L) => { await A(`GRANT pg_maintain TO ${L}`); }, attack: `REINDEX TABLE audit_log` },
  { id: 'P1 member of pg_execute_server_program (OS command)', setup: async (L) => { await A(`GRANT pg_execute_server_program TO ${L}`); }, attack: `COPY (SELECT 1) TO PROGRAM 'touch ${marker}'` },
  { id: 'P2 member of pg_write_server_files', setup: async (L) => { await A(`GRANT pg_write_server_files TO ${L}`); }, attack: `COPY (SELECT 'x') TO '${marker}_w'` },
  { id: 'P3 member of pg_read_server_files', setup: async (L) => { await A(`GRANT pg_read_server_files TO ${L}`); }, attack: `CREATE TEMP TABLE t(l text); COPY t FROM '/etc/passwd'` },
  { id: 'P4 member of pg_signal_backend', setup: async (L) => { await A(`GRANT pg_signal_backend TO ${L}`); }, attack: `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = '${owner}' AND pid <> pg_backend_pid()` },
  { id: 'P5 member of pg_read_all_data (bypasses REVOKE, not RLS)', setup: async (L) => { await A(`GRANT pg_read_all_data TO ${L}`); }, attack: `SELECT count(*) FROM drizzle.__drizzle_migrations` },
  { id: 'R1 CREATEROLE attribute', setup: async (L) => { await A(`ALTER ROLE ${L} CREATEROLE`); }, attack: `CREATE ROLE rv_spawn_${s}` },
  { id: 'R2 CREATEDB attribute', setup: async (L) => { await A(`ALTER ROLE ${L} CREATEDB`); }, attack: `SELECT 1` },
  { id: 'R3 REPLICATION attribute', setup: async (L) => { await A(`ALTER ROLE ${L} REPLICATION`); }, attack: `SELECT pg_create_physical_replication_slot('rv_slot_${s}')` },
  { id: 'G1 SET privilege on session_replication_role (PG15+)', setup: async (L) => { await A(`GRANT SET ON PARAMETER session_replication_role TO ${L}`); }, attack: `SET session_replication_role = replica` },
  { id: 'U1 schema USAGE on drizzle only (no table grant)', setup: async (L) => { await D.query(`GRANT USAGE ON SCHEMA drizzle TO ${L}`); }, attack: `SELECT count(*) FROM drizzle.__drizzle_migrations` },
  { id: 'X1 TEMP on database (PUBLIC has it by default)', setup: async () => undefined, attack: `CREATE TEMP TABLE x(i int)` },
];

async function attempt(L: string, attack: string, isCreateDb = false): Promise<string> {
  const c = new pg.Client({ host: '127.0.0.1', port: 5433, user: L, database: db, options: '-c role=nile_app' });
  await c.connect();
  try {
    await c.query('BEGIN');
    await c.query('SET LOCAL ROLE NONE');
    if (isCreateDb) { await c.query('ROLLBACK'); await c.query('SET ROLE NONE'); await c.query(`CREATE DATABASE rv_spawn_db_${s}`); return 'SUCCEEDED (CREATE DATABASE)'; }
    const r = await c.query(attack);
    await c.query('ROLLBACK');
    const last = Array.isArray(r) ? r[r.length - 1] : r;
    return `SUCCEEDED${last?.rows?.[0] ? ' ' + JSON.stringify(last.rows[0]).slice(0, 60) : ''}`;
  } catch (e: any) {
    await c.query('ROLLBACK').catch(() => undefined);
    return `denied (${e.code}: ${String(e.message).slice(0, 55)})`;
  } finally {
    await c.end();
  }
}

console.log(`PostgreSQL ${ver}; G-7 under review @ 60342be (fresh-clone copy)`);
console.log(`control (baseline member login, no extra capability):`);
for (const v of vectors) console.log(`   ${v.id.padEnd(62)} -> ${await attempt(base, v.attack, v.id.startsWith('R2'))}`.replace(/SUCCEEDED/, v.id.startsWith('X1') ? 'SUCCEEDED (expected: PUBLIC default)' : 'SUCCEEDED'));
console.log(`vectors:`);
const logins: string[] = [];
for (const [i, v] of vectors.entries()) {
  if (v.id.startsWith('X1')) continue;
  const L = `rv_l${i}_${s}`;
  logins.push(L);
  await A(`CREATE ROLE ${L} LOGIN`);
  await A(`GRANT nile_app TO ${L}`);
  try { await v.setup(L); } catch (e: any) { console.log(`   ${v.id.padEnd(62)} SETUP FAILED: ${e.message}`); continue; }
  let verdict: string;
  try { await (await openPostgres({ url: url(L) })).close(); verdict = 'ACCEPTED'; } catch (e: any) { verdict = `refused: ${String(e.message).slice(0, 70)}`; }
  const after = verdict === 'ACCEPTED' ? ` | after SET ROLE NONE: ${await attempt(L, v.attack, v.id.startsWith('R2'))}` : '';
  console.log(`   ${v.id.padEnd(62)} startup ${verdict}${after}`);
}
console.log(`P1 marker file created by COPY TO PROGRAM: ${existsSync(marker)}; P2 file written: ${existsSync(marker + '_w')}`);
rmSync(marker, { force: true }); rmSync(marker + '_w', { force: true });

// cleanup
await D.query(`GRANT SELECT ON "account" TO nile_app`);
await O.end().catch(() => undefined); await D.end();
await A(`SELECT pg_drop_replication_slot(slot_name) FROM pg_replication_slots WHERE slot_name LIKE 'rv\\_slot\\_%'`);
await A(`DROP DATABASE IF EXISTS rv_spawn_db_${s}`);
await A(`DROP DATABASE ${db} WITH (FORCE)`);
await A(`DROP ROLE IF EXISTS rv_spawn_${s}`);
for (const L of [...logins, base]) { await A(`DROP OWNED BY ${L}`).catch(() => undefined); await A(`DROP ROLE ${L}`); }
for (const p of ['session_replication_role']) await A(`REVOKE SET ON PARAMETER ${p} FROM PUBLIC`).catch(() => undefined);
await A(`DROP ROLE ${owner}`);
const left = (await A(`SELECT count(*) n FROM pg_roles WHERE rolname LIKE 'rv\\_%'`)).rows[0].n;
console.log(`cleanup: leftover rv_ roles = ${left}`);
await admin.end();
