// SANITIZED COPY (2026-10-14): the two throwaway passwords of the original local scratch file were removed.
// Set SCRATCH_OWNER_PASSWORD and SCRATCH_LOGIN_PASSWORD yourself; run only against a disposable local cluster.
// PR #4 on real PostgreSQL 18 — scratch, never committed. Local throwaway roles only.
import pg from 'pg';
import { sql } from 'drizzle-orm';
import { openPostgres } from '../engines/db/open.js';
export {};
const su = new pg.Client({ host: '127.0.0.1', port: 5433, user: 'postgres', database: 'postgres' });
await su.connect();
await su.query(`CREATE ROLE nile_owner LOGIN CREATEROLE PASSWORD '${process.env.SCRATCH_OWNER_PASSWORD ?? ''}'`);
await su.query(`CREATE DATABASE nile OWNER nile_owner`);
await su.query(`CREATE ROLE nile_login LOGIN PASSWORD '${process.env.SCRATCH_LOGIN_PASSWORD ?? ''}'`);
await su.query(`CREATE ROLE nile_app NOLOGIN NOSUPERUSER NOBYPASSRLS`);
await su.query(`GRANT nile_app TO nile_login`);
await su.end();
const owner = `postgres://nile_owner:${encodeURIComponent(process.env.SCRATCH_OWNER_PASSWORD ?? '')}@127.0.0.1:5433/nile`;
const login = `postgres://nile_login:${encodeURIComponent(process.env.SCRATCH_LOGIN_PASSWORD ?? '')}@127.0.0.1:5433/nile`;
const out: Record<string, unknown> = {};
const code = async (p: Promise<unknown>) => { try { await p; return 'ok'; } catch (e: any) { return (e.cause ?? e).code ?? String(e); } };

let opened = await openPostgres({ url: login, migrationUrl: owner });
const db: any = opened.db;
out.currentUser = (await db.execute(sql`select current_user as u`)).rows[0].u;
const own = new pg.Client({ connectionString: owner }); await own.connect();
out.migrationsApplied = (await own.query(`select count(*)::int n from drizzle.__drizzle_migrations`)).rows[0].n;
const T = ['audit_log', 'sales_transactions', 'transaction_lines', 'stock_movements', 'cash_movements'];
for (const t of T) {
  const p = (await own.query(`select has_table_privilege('nile_app',$1,'SELECT') s, has_table_privilege('nile_app',$1,'INSERT') i, has_table_privilege('nile_app',$1,'UPDATE') u, has_table_privilege('nile_app',$1,'DELETE') d`, [t])).rows[0];
  out[`priv ${t}`] = `S${+p.s} I${+p.i} U${+p.u} D${+p.d}`;
  out[`UPDATE ${t}`] = await code(db.execute(sql.raw(`UPDATE ${t} SET tenant_id = tenant_id`)));
  out[`DELETE ${t}`] = await code(db.execute(sql.raw(`DELETE FROM ${t}`)));
}
// Row locks on append-only tables need UPDATE privilege (PG docs): verify empirically.
out['FOR UPDATE sales_transactions'] = await code(db.transaction((tx: any) => tx.execute(sql`select id from sales_transactions for update`)));
out['FOR SHARE cash_movements'] = await code(db.transaction((tx: any) => tx.execute(sql`select id from cash_movements for share`)));
out['FOR UPDATE catalog_variants (control)'] = await code(db.transaction((tx: any) => tx.execute(sql`select id from catalog_variants for update`)));
// The payment design's alternative: transaction-scoped advisory locks need no table privilege.
const c1 = new pg.Client({ connectionString: login }); const c2 = new pg.Client({ connectionString: login });
await c1.connect(); await c2.connect(); await c1.query('SET ROLE nile_app'); await c2.query('SET ROLE nile_app');
await c1.query('BEGIN'); out['advisory lock c1'] = (await c1.query(`select pg_try_advisory_xact_lock(hashtextextended('t1:sale-1',0)) l`)).rows[0].l;
await c2.query('BEGIN'); out['advisory lock c2 while c1 holds'] = (await c2.query(`select pg_try_advisory_xact_lock(hashtextextended('t1:sale-1',0)) l`)).rows[0].l;
await c1.query('COMMIT'); out['advisory lock c2 after c1 commit'] = (await c2.query(`select pg_try_advisory_xact_lock(hashtextextended('t1:sale-1',0)) l`)).rows[0].l;
await c2.query('COMMIT'); await c1.end(); await c2.end();
// Default privileges: a future table created by the owner gets UPDATE/DELETE for nile_app unless revoked.
await own.query(`create table future_payments_probe (id int)`);
const f = (await own.query(`select has_table_privilege('nile_app','future_payments_probe','UPDATE') u, has_table_privilege('nile_app','future_payments_probe','DELETE') d`)).rows[0];
out['future table default U/D'] = `U${+f.u} D${+f.d}`;
await own.query(`drop table future_payments_probe`);
await opened.close();
// Idempotent re-run of migrations.
opened = await openPostgres({ url: login, migrationUrl: owner });
out.migrationsAfterRerun = (await own.query(`select count(*)::int n from drizzle.__drizzle_migrations`)).rows[0].n;
await opened.close(); await own.end();
console.log(JSON.stringify(out, null, 1));
