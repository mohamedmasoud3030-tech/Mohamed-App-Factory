// Impact checks for G1 and C3 on the throwaway cluster (port 5434). Generic schema mirroring Nile's patterns.
import pg from 'pg';
const C = (user, database, options) => new pg.Client({ host: '127.0.0.1', port: 5434, user, database, options });
const sup = C('postgres', 'app'); await sup.connect(); const S = (q) => sup.query(q);
await S(`CREATE ROLE imp_g1 LOGIN; GRANT nile_app TO imp_g1; GRANT SET ON PARAMETER session_replication_role TO imp_g1`);
await S(`CREATE ROLE imp_c3 LOGIN; GRANT nile_app TO imp_c3; CREATE ROLE imp_base LOGIN; GRANT nile_app TO imp_base`);
await S(`CREATE TABLE public.org(id text PRIMARY KEY); CREATE TABLE public.ledger(id serial PRIMARY KEY, tenant_id text NOT NULL REFERENCES public.org(id), action text NOT NULL)`);
await S(`ALTER TABLE public.ledger ENABLE ROW LEVEL SECURITY; ALTER TABLE public.ledger FORCE ROW LEVEL SECURITY`);
await S(`CREATE POLICY tenant_isolation ON public.ledger TO public USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true))`);
await S(`GRANT USAGE ON SCHEMA public TO nile_app; GRANT SELECT, INSERT ON public.ledger, public.org TO nile_app; GRANT USAGE ON SEQUENCE public.ledger_id_seq TO nile_app`);
await S(`INSERT INTO public.org VALUES ('t1'); INSERT INTO public.ledger(tenant_id, action) VALUES ('t1','sale'),('t1','refund')`);
await S(`GRANT UPDATE (action) ON public.ledger TO imp_c3`);

async function run(user, label, sqls) {
  const c = C(user, 'app', '-c role=nile_app'); await c.connect();
  try { await c.query('BEGIN'); for (const q of sqls.slice(0, -1)) await c.query(q); const r = await c.query(sqls.at(-1));
    console.log(`  ${label.padEnd(58)} -> SUCCEEDED (${r.command} ${r.rowCount})`); }
  catch (e) { console.log(`  ${label.padEnd(58)} -> denied/failed (${e.code}: ${e.message.slice(0, 60)})`); }
  finally { await c.query('ROLLBACK').catch(() => {}); await c.end(); }
}
console.log('G1: insert a ledger row for a tenant that does not exist (FK violation)');
await run('imp_base', 'control: nile_app, FK enforced', [`SELECT set_config('app.tenant_id','ghost',true)`, `INSERT INTO public.ledger(tenant_id, action) VALUES ('ghost','x')`]);
await run('imp_base', 'control: base login, SET ROLE NONE, set replica', [`SET LOCAL ROLE NONE`, `SET LOCAL session_replication_role = replica`]);
await run('imp_g1', 'G1 login: SET ROLE NONE, replica, SET ROLE nile_app, insert', [`SET LOCAL ROLE NONE`, `SET LOCAL session_replication_role = replica`, `SET LOCAL ROLE nile_app`, `SELECT set_config('app.tenant_id','ghost',true)`, `INSERT INTO public.ledger(tenant_id, action) VALUES ('ghost','x')`]);
console.log('C3: rewrite an existing ledger row (nile_app has no UPDATE, like PR #4)');
await run('imp_base', 'control: nile_app UPDATE with tenant set', [`SELECT set_config('app.tenant_id','t1',true)`, `UPDATE public.ledger SET action = 'tampered'`]);
await run('imp_base', 'control: base login, SET ROLE NONE, tenant set', [`SET LOCAL ROLE NONE`, `SELECT set_config('app.tenant_id','t1',true)`, `UPDATE public.ledger SET action = 'tampered'`]);
await run('imp_c3', 'C3 login: SET ROLE NONE, no tenant set', [`SET LOCAL ROLE NONE`, `UPDATE public.ledger SET action = 'tampered'`]);
await run('imp_c3', 'C3 login: SET ROLE NONE, tenant t1 set', [`SET LOCAL ROLE NONE`, `SELECT set_config('app.tenant_id','t1',true)`, `UPDATE public.ledger SET action = 'tampered'`]);
await sup.end();
