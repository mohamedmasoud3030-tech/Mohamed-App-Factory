export {};
import pg from 'pg';
import { existsSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { openPostgres } from '../engines/db/open.ts';
const s = randomBytes(3).toString('hex'), db = `rv2_${s}`, owner = `rv2_owner_${s}`, L = `rv2_login_${s}`, marker = `/tmp/rv2_pwned_${s}`;
const a = new pg.Client({ host: '127.0.0.1', port: 5433, user: 'postgres', database: 'postgres' }); await a.connect();
const A = (q: string) => a.query(q);
await A(`CREATE ROLE ${owner} LOGIN CREATEROLE`); await A(`CREATE DATABASE ${db} OWNER ${owner}`); await A(`CREATE ROLE ${L} LOGIN`); await A(`GRANT nile_app TO ${L}`);
const url = (u: string) => `postgres://${u}@127.0.0.1:5433/${db}`;
await (await openPostgres({ url: url(L), migrationUrl: url(owner) })).close();

// 1) nile_app itself holds a dangerous predefined role (cluster-wide change on this disposable server; reverted below)
await A(`GRANT pg_execute_server_program TO nile_app`);
try {
  let verdict = 'ACCEPTED';
  try { const o = await openPostgres({ url: url(L) }); await o.db.execute(`COPY (SELECT 1) TO PROGRAM 'touch ${marker}'` as never); await o.close(); }
  catch (e: any) { verdict = `refused/failed: ${String(e.message).slice(0, 80)}`; }
  console.log(`V17 nile_app is a member of pg_execute_server_program -> startup ${verdict}; OS command ran AS nile_app (no SET ROLE needed): ${existsSync(marker)}`);
} finally { await A(`REVOKE pg_execute_server_program FROM nile_app`); rmSync(marker, { force: true }); }

// 2) pooler-friendly alternative: per-login default role, no startup option
await A(`ALTER ROLE ${L} IN DATABASE ${db} SET role = 'nile_app'`);
const c = new pg.Client({ host: '127.0.0.1', port: 5433, user: L, database: db }); await c.connect();
const q1 = (await c.query('select current_user u, session_user s')).rows[0];
await c.query('RESET ROLE'); const q2 = (await c.query('select current_user u')).rows[0];
await c.query('DISCARD ALL'); const q3 = (await c.query('select current_user u')).rows[0];   // what PgBouncer's server_reset_query runs
await c.query('SET ROLE NONE'); const q4 = (await c.query('select current_user u')).rows[0];
await c.end();
console.log(`ALTER ROLE ${L} IN DATABASE .. SET role = nile_app, NO startup option: current_user=${q1.u} session_user=${q1.s}; after RESET ROLE=${q2.u}; after DISCARD ALL=${q3.u}; after SET ROLE NONE=${q4.u}`);

await A(`DROP DATABASE ${db} WITH (FORCE)`); await A(`ALTER ROLE ${L} RESET ALL`).catch(() => undefined);
for (const r of [L, owner]) { await A(`DROP OWNED BY ${r}`).catch(() => undefined); await A(`DROP ROLE ${r}`); }
console.log('cleanup ok'); await a.end();
