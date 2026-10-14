export {};
import pg from 'pg'; import { randomBytes } from 'node:crypto'; import { openPostgres } from '../engines/db/open.ts';
const s = randomBytes(3).toString('hex'), db = `rv3_${s}`, owner = `rv3_owner_${s}`, base = `rv3_base_${s}`, L = `rv3_col_${s}`, M = `rv3_maint_${s}`;
const a = new pg.Client({ host: '127.0.0.1', port: 5433, user: 'postgres', database: 'postgres' }); await a.connect(); const A = (q: string) => a.query(q);
await A(`CREATE ROLE ${owner} LOGIN CREATEROLE`); await A(`CREATE DATABASE ${db} OWNER ${owner}`);
for (const r of [base, L, M]) { await A(`CREATE ROLE ${r} LOGIN`); await A(`GRANT nile_app TO ${r}`); }
const url = (u: string) => `postgres://${u}@127.0.0.1:5433/${db}`;
await (await openPostgres({ url: url(base), migrationUrl: url(owner) })).close();
const D = new pg.Client({ host: '127.0.0.1', port: 5433, user: 'postgres', database: db }); await D.connect();
const priv = (await D.query(`select has_table_privilege('nile_app','audit_log','UPDATE') u, has_table_privilege('nile_app','audit_log','DELETE') d`)).rows[0];
console.log(`after PR #4 migration: nile_app UPDATE on audit_log=${priv.u}, DELETE=${priv.d}`);
await D.query(`GRANT UPDATE (action) ON audit_log TO ${L}`); await D.query(`GRANT MAINTAIN ON audit_log TO ${M}`);
async function attempt(u: string, q: string) { const c = new pg.Client({ host: '127.0.0.1', port: 5433, user: u, database: db, options: '-c role=nile_app' }); await c.connect();
  try { await c.query('BEGIN'); await c.query('SET LOCAL ROLE NONE'); const r = await c.query(q); await c.query('ROLLBACK'); return `privilege check PASSED (${r.command} ${r.rowCount ?? ''})`; } catch (e: any) { await c.query('ROLLBACK').catch(() => {}); return `denied (${e.code}: ${e.message.slice(0, 50)})`; } finally { await c.end(); } }
for (const [label, u, q] of [['control base: UPDATE audit_log SET action', base, `UPDATE audit_log SET action = action`], ['C3 column UPDATE(action) on audit_log', L, `UPDATE audit_log SET action = action`], ['control base: LOCK audit_log ACCESS EXCLUSIVE', base, `LOCK TABLE audit_log IN ACCESS EXCLUSIVE MODE`], ['M3 MAINTAIN on audit_log: LOCK ACCESS EXCLUSIVE', M, `LOCK TABLE audit_log IN ACCESS EXCLUSIVE MODE`]] as const) {
  let verdict = 'n/a'; if (u !== base) { try { await (await openPostgres({ url: url(u) })).close(); verdict = 'startup ACCEPTED'; } catch (e: any) { verdict = `startup refused: ${e.message.slice(0, 60)}`; } }
  console.log(`${label.padEnd(50)} ${verdict.padEnd(18)} after SET ROLE NONE: ${await attempt(u, q)}`); }
await D.end(); await A(`DROP DATABASE ${db} WITH (FORCE)`); for (const r of [L, M, base, owner]) { await A(`DROP OWNED BY ${r}`).catch(() => {}); await A(`DROP ROLE ${r}`); }
console.log('cleanup ok'); await a.end();
