export {};
/**
 * Supabase-condition EMULATION on vanilla PostgreSQL (throwaway cluster only). NOT Supabase.
 * Tree: 60342be (G-7) + PR #4 784e50c merged in the working tree (no commit).
 * Emulated, from Supabase docs (attributes of Supabase's `postgres` role are an ASSUMPTION):
 *  - migration owner `supa_pg`: LOGIN, NOT superuser, CREATEROLE, CREATEDB, BYPASSRLS, owns the database
 *  - roles anon / authenticated / service_role (NOLOGIN)
 *  - "legacy" projects: default privileges FOR ROLE supa_pg IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role
 *  - a pooler that drops the startup `options` (Supavisor source 5df5caf forwards only search_path)
 */
import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { openPostgres, assertRuntimeRole } from '../engines/db/open.ts';

const PORT = Number(process.env.PGPORT_TEST);
const s = randomBytes(3).toString('hex');
const results: Array<[string, string, string]> = [];
const rec = (id: string, verdict: 'PASS' | 'FAIL' | 'INFO', detail: string) => { results.push([id, verdict, detail]); console.log(`${verdict.padEnd(4)} ${id.padEnd(5)} ${detail}`); };
const cli = (user: string, database: string, options?: string) => new pg.Client({ host: '127.0.0.1', port: PORT, user, database, options });
const url = (user: string, db: string) => `postgres://${user}@127.0.0.1:${PORT}/${db}`;
const short = (e: any) => `${e?.code ?? e?.cause?.code ?? ''} ${String(e?.message ?? e).split('\n')[0].slice(0, 110)}`;

const su = cli('postgres', 'postgres'); await su.connect(); const S = (q: string) => su.query(q);
const ver = (await S('show server_version')).rows[0].server_version; const major = Number(ver.split('.')[0]);
console.log(`PostgreSQL ${ver} (throwaway cluster, port ${PORT})`);
{ const pre = (await S(`SELECT count(*)::int n FROM pg_roles WHERE rolname='nile_app'`)).rows[0].n;
  if (pre) { console.log('nile_app already exists in this cluster; this run requires a fresh cluster'); process.exit(2); }
  await S(`CREATE ROLE nile_app NOLOGIN`); await S(`CREATE ROLE e0_owner_${s} LOGIN CREATEROLE`); await S(`CREATE ROLE e0_login_${s} LOGIN`);
  const c = cli(`e0_owner_${s}`, 'postgres'); await c.connect();
  try { await c.query(`GRANT nile_app TO e0_login_${s}`); rec('E0', 'INFO', `nile_app created by ANOTHER role: non-superuser CREATEROLE owner CAN grant it on ${major}`); }
  catch (e) { rec('E0', 'INFO', `nile_app created by ANOTHER role: non-superuser CREATEROLE owner CANNOT grant it on ${major} (${short(e).slice(0, 60)}) => on Supabase, nile_app must be created by the postgres role itself`); }
  await c.end(); await S(`DROP ROLE e0_login_${s}`); await S(`DROP ROLE e0_owner_${s}`); await S(`DROP ROLE nile_app`); }

async function scenario(name: 'legacy' | 'newdefault') {
  const db = `supa_${name}_${s}`, owner = `supa_pg_${name}_${s}`, login = `nile_login_${name}_${s}`;
  console.log(`\n== scenario ${name}: database ${db}`);
  await S(`CREATE ROLE ${owner} LOGIN NOSUPERUSER CREATEROLE CREATEDB BYPASSRLS`);
  await S(`CREATE DATABASE ${db} OWNER ${owner}`);
  for (const r of ['anon', 'authenticated', 'service_role']) await S(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${r}') THEN CREATE ROLE ${r} NOLOGIN; END IF; END $$`);
  const D = cli('postgres', db); await D.connect();
  if (name === 'legacy') await D.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role`);
  // everything below runs as the NON-superuser owner, as it would on Supabase
  const O = cli(owner, db); await O.connect();
  try {
    await O.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='nile_app') THEN CREATE ROLE nile_app NOLOGIN; END IF; END $$`);
    await O.query(`CREATE ROLE ${login} LOGIN`);
    await O.query(`GRANT nile_app TO ${login}`);
    rec('E1', 'PASS', 'non-superuser CREATEROLE owner created nile_app (or found it), the runtime login, and granted the membership');
  } catch (e) { rec('E1', 'FAIL', `role setup as non-superuser owner: ${short(e)}`); }
  // migrations as the non-superuser owner + startup through the production path
  try { const o = await openPostgres({ url: url(login, db), migrationUrl: url(owner, db) }); await o.close();
    const n = (await D.query(`SELECT count(*)::int n FROM drizzle.__drizzle_migrations`)).rows[0].n;
    rec('E2', 'PASS', `migrations 0000-0002 applied by non-superuser owner; G-7 startup accepted the login (${n} migrations recorded)`);
  } catch (e) { rec('E2', 'FAIL', `migrate/start: ${short(e)}`); }
  try { const o = await openPostgres({ url: url(login, db), migrationUrl: url(owner, db) }); await o.close();
    const n = (await D.query(`SELECT count(*)::int n FROM drizzle.__drizzle_migrations`)).rows[0].n;
    rec('E3', n === 3 ? 'PASS' : 'FAIL', `migration rerun is a no-op (recorded migrations still ${n})`);
  } catch (e) { rec('E3', 'FAIL', `rerun: ${short(e)}`); }
  try { const o = await openPostgres({ url: url(owner, db) }); await o.close(); rec('E4', 'FAIL', 'owner/BYPASSRLS login ACCEPTED as runtime login'); }
  catch (e) { rec('E4', 'PASS', `owner (BYPASSRLS, DB owner) refused as runtime login: ${short(e).slice(0, 80)}`); }
  // ledger append-only (PR #4) on real PostgreSQL, through the runtime pool
  try { const o = await openPostgres({ url: url(login, db) });
    const out: string[] = [];
    for (const t of ['audit_log', 'sales_transactions', 'transaction_lines', 'stock_movements', 'cash_movements']) {
      for (const q of [`UPDATE "${t}" SET tenant_id = tenant_id`, `DELETE FROM "${t}"`]) {
        try { await o.db.execute(sql.raw(q)); out.push(`${t}:${q.split(' ')[0]}=ALLOWED`); } catch (e: any) { out.push(`${t}:${q.split(' ')[0]}=${e?.cause?.code ?? e?.code}`); }
      }
    }
    const ins = (await D.query(`SELECT bool_and(has_table_privilege('nile_app', t, 'INSERT')) i FROM unnest(array['audit_log','sales_transactions','transaction_lines','stock_movements','cash_movements']) t`)).rows[0].i;
    await o.close();
    const allDenied = out.every((x) => x.endsWith('=42501'));
    rec('E5', allDenied && ins ? 'PASS' : 'FAIL', `ledger append-only for nile_app: 10/10 UPDATE/DELETE ${allDenied ? 'denied 42501' : 'NOT all denied: ' + out.join(' ')}; INSERT kept=${ins}`);
  } catch (e) { rec('E5', 'FAIL', `ledger check: ${short(e)}`); }
  // Data API exposure (emulated): what anon/authenticated could reach
  const exp = (await D.query(`SELECT count(*) FILTER (WHERE has_table_privilege('anon', c.oid, 'SELECT'))::int anon_sel,
      count(*) FILTER (WHERE has_table_privilege('authenticated', c.oid, 'UPDATE'))::int auth_upd, count(*)::int total,
      bool_or(c.relname = 'account' AND has_table_privilege('anon', c.oid, 'SELECT')) anon_account
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'`)).rows[0];
  let anonRead = 'denied';
  try { await D.query(`INSERT INTO "user"(name, email) VALUES ('probe', 'probe-${s}@example.invalid')`);
    await D.query('BEGIN'); await D.query('SET LOCAL ROLE anon'); const r = await D.query(`SELECT count(*)::int n FROM "user"`); anonRead = `READ ${r.rows[0].n} row(s) of "user" (no RLS on Better Auth tables)`; }
  catch (e: any) { anonRead = `denied (${e.code})`; } finally { await D.query('ROLLBACK').catch(() => undefined); }
  if (name === 'legacy') rec('E6', exp.anon_sel > 0 ? 'FAIL' : 'PASS', `LEGACY default grants: anon SELECT on ${exp.anon_sel}/${exp.total} Nile tables (account=${exp.anon_account}), authenticated UPDATE on ${exp.auth_upd}; SET ROLE anon: ${anonRead}`);
  else rec('E6', exp.anon_sel === 0 && exp.auth_upd === 0 ? 'PASS' : 'FAIL', `NEW default (no grants): anon SELECT on ${exp.anon_sel}/${exp.total}, authenticated UPDATE on ${exp.auth_upd}; SET ROLE anon: ${anonRead}`);
  // pooler that drops options: connect WITHOUT the startup role
  const noOpt = new pg.Pool({ connectionString: url(login, db), max: 1 }); noOpt.on('error', () => undefined);
  try { await assertRuntimeRole(drizzle(noOpt) as never, { checkLogin: true }); rec('E7', 'FAIL', 'session without startup role ACCEPTED'); }
  catch (e) { rec('E7', 'PASS', `dropped startup role fails closed: ${short(e).slice(0, 90)}`); }
  await noOpt.end();
  // per-login default role set by the NON-superuser owner (pooler mode)
  try { await O.query(`ALTER ROLE ${login} IN DATABASE ${db} SET role = 'nile_app'`);
    const p = new pg.Pool({ connectionString: url(login, db), max: 1 }); p.on('error', () => undefined);
    const who = (await p.query('select current_user u, session_user s')).rows[0];
    try { await assertRuntimeRole(drizzle(p) as never, { checkLogin: true }); rec('E8', who.u === 'nile_app' ? 'PASS' : 'FAIL', `ALTER ROLE..IN DATABASE..SET role by non-superuser owner works; no startup option: current_user=${who.u}; G-7 check accepted`); }
    catch (e) { rec('E8', 'FAIL', `pooler mode rejected: ${short(e)}`); }
    await p.end();
    await O.query(`REVOKE nile_app FROM ${login}`);
    const c = cli(login, db); const notices: string[] = []; c.on('notice', (n: any) => notices.push(n.message)); await c.connect();
    const u2 = (await c.query('select current_user u')).rows[0].u; await c.end();
    const p2 = new pg.Pool({ connectionString: url(login, db), max: 1 }); p2.on('error', () => undefined);
    let v = 'ACCEPTED'; try { await assertRuntimeRole(drizzle(p2) as never, { checkLogin: true }); } catch (e) { v = `refused: ${short(e).slice(0, 60)}`; } await p2.end();
    rec('E9', u2 !== 'nile_app' && v.startsWith('refused') ? 'PASS' : 'FAIL', `membership revoked in pooler mode: server connects as ${u2} with notice "${notices[0] ?? '-'}" (fail-open at server); G-7 assertion ${v}`);
    await O.query(`GRANT nile_app TO ${login}`);
  } catch (e) { rec('E8', 'FAIL', `pooler mode setup: ${short(e)}`); }
  if (major >= 16) { const m = (await D.query(`SELECT member::regrole::text m, admin_option a, inherit_option i, set_option s FROM pg_auth_members WHERE roleid = 'nile_app'::regrole ORDER BY 1`)).rows;
    rec('E12', 'INFO', `nile_app memberships after setup: ${JSON.stringify(m)}`); }
  // PG16+ membership options syntax used by the redesign
  try { await O.query(`GRANT nile_app TO ${login} WITH ADMIN FALSE, SET TRUE`); rec('E10', 'INFO', `GRANT .. WITH ADMIN FALSE, SET TRUE: supported on ${major}`); }
  catch (e) { rec('E10', 'INFO', `GRANT .. WITH ADMIN FALSE, SET TRUE: NOT supported on ${major} (${short(e).slice(0, 60)})`); }
  // can a non-superuser CREATEROLE owner hand out dangerous predefined roles? (vanilla semantics)
  try { await O.query(`GRANT pg_read_server_files TO ${login}`); rec('E11', 'INFO', `non-superuser CREATEROLE owner CAN grant pg_read_server_files on ${major}`); await S(`REVOKE pg_read_server_files FROM ${login}`); }
  catch (e) { rec('E11', 'INFO', `non-superuser CREATEROLE owner cannot grant pg_read_server_files on ${major} (${short(e).slice(0, 70)})`); }
  await O.end(); await D.end();
  await S(`DROP DATABASE ${db} WITH (FORCE)`);
  for (const r of [login, owner]) { await S(`DROP OWNED BY ${r}`).catch(() => undefined); await S(`DROP ROLE ${r}`); }
  await S(`DROP ROLE IF EXISTS nile_app`);
}
await scenario('legacy');
await scenario('newdefault');
const left = (await S(`SELECT count(*)::int n FROM pg_roles WHERE rolname ~ '_${s}$'`)).rows[0].n;
console.log(`\ncleanup: leftover probe roles = ${left}`);
await su.end();
