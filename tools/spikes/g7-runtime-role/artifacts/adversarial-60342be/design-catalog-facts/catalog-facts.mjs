// Catalog-coverage facts for the G-7 redesign. Runs ONLY against a throwaway cluster on port 5434.
import pg from 'pg';
const PORT = 5434;
const C = (user, database) => new pg.Client({ host: '127.0.0.1', port: PORT, user, database });
const out = (...a) => console.log(...a);
const sup = C('postgres', 'postgres'); await sup.connect();
const S = (q) => sup.query(q);
out('server', (await S('show server_version')).rows[0].server_version);
await S(`CREATE ROLE owner LOGIN`);
await S(`CREATE DATABASE app OWNER owner`); await S(`CREATE DATABASE other`);
await S(`CREATE ROLE nile_app NOLOGIN`); await S(`CREATE ROLE login LOGIN`); await S(`GRANT nile_app TO login`);
const kinds = ['table','col','maint','seq','func','catfunc','type','schema','db','dbother','otherobj','param','param_as',
  'defacl_grantee','defacl_role','policy','lo_owner','lo_grant','lang','fdw','server','umap','tblspc',
  'own_tbl','own_type','own_func','own_schema','own_db','own_seq','member_predef','member_role','attr','setting','pub_owner'];
for (const k of kinds) await S(`CREATE ROLE k_${k} NOLOGIN`);
await S(`GRANT CREATE ON DATABASE app TO k_pub_owner`);
const a = C('postgres', 'app'); await a.connect(); const A = (q) => a.query(q);
await A(`CREATE SCHEMA s AUTHORIZATION owner`);
await A(`SET ROLE owner`);
await A(`CREATE TABLE s.t(a int, b int); CREATE SEQUENCE s.q; CREATE FUNCTION s.f() RETURNS int LANGUAGE sql AS 'select 1'; CREATE TYPE s.ty AS ENUM ('x')`);
await A(`CREATE TABLE s.t2(a int); CREATE TYPE s.ty2 AS ENUM ('x'); CREATE FUNCTION s.f2() RETURNS int LANGUAGE sql AS 'select 1'; CREATE SCHEMA s2; CREATE SEQUENCE s.q2`);
await A(`RESET ROLE`);
const lo = (await A(`SELECT lo_create(0) o`)).rows[0].o; const lo2 = (await A(`SELECT lo_create(0) o`)).rows[0].o;
const g = {
  table: `GRANT SELECT ON s.t TO k_table`, col: `GRANT SELECT (b) ON s.t TO k_col`, maint: `GRANT MAINTAIN ON s.t TO k_maint`,
  seq: `GRANT UPDATE ON SEQUENCE s.q TO k_seq`, func: `GRANT EXECUTE ON FUNCTION s.f() TO k_func`,
  catfunc: `GRANT EXECUTE ON FUNCTION pg_catalog.pg_read_file(text) TO k_catfunc`, type: `GRANT USAGE ON TYPE s.ty TO k_type`,
  schema: `GRANT CREATE ON SCHEMA s TO k_schema`, db: `GRANT CREATE ON DATABASE app TO k_db`, dbother: `GRANT CREATE ON DATABASE other TO k_dbother`,
  param: `GRANT SET ON PARAMETER session_replication_role TO k_param`, param_as: `GRANT ALTER SYSTEM ON PARAMETER work_mem TO k_param_as`,
  defacl_grantee: `ALTER DEFAULT PRIVILEGES FOR ROLE owner IN SCHEMA s GRANT SELECT ON TABLES TO k_defacl_grantee`,
  defacl_role: `ALTER DEFAULT PRIVILEGES FOR ROLE k_defacl_role GRANT SELECT ON TABLES TO nile_app`,
  policy: `CREATE POLICY p ON s.t TO k_policy USING (true)`,
  lo_owner: `ALTER LARGE OBJECT ${lo} OWNER TO k_lo_owner`, lo_grant: `GRANT SELECT ON LARGE OBJECT ${lo2} TO k_lo_grant`,
  lang: `GRANT USAGE ON LANGUAGE plpgsql TO k_lang`,
  fdw: `CREATE FOREIGN DATA WRAPPER w; GRANT USAGE ON FOREIGN DATA WRAPPER w TO k_fdw`,
  server: `CREATE SERVER sv FOREIGN DATA WRAPPER w; GRANT USAGE ON FOREIGN SERVER sv TO k_server`,
  umap: `CREATE USER MAPPING FOR k_umap SERVER sv`,
  tblspc: `GRANT CREATE ON TABLESPACE ts TO k_tblspc`,
  own_tbl: `ALTER TABLE s.t2 OWNER TO k_own_tbl`, own_type: `ALTER TYPE s.ty2 OWNER TO k_own_type`, own_func: `ALTER FUNCTION s.f2() OWNER TO k_own_func`,
  own_schema: `ALTER SCHEMA s2 OWNER TO k_own_schema`, own_db: `ALTER DATABASE other OWNER TO k_own_db`, own_seq: `ALTER SEQUENCE s.q2 OWNER TO k_own_seq`,
  member_predef: `GRANT pg_execute_server_program TO k_member_predef`, member_role: `GRANT nile_app TO k_member_role`,
  attr: `ALTER ROLE k_attr CREATEROLE REPLICATION`, setting: `ALTER ROLE k_setting IN DATABASE app SET work_mem = '1MB'`,
  pub_owner: `CREATE PUBLICATION pub; ALTER PUBLICATION pub OWNER TO k_pub_owner`,
};
await S(`CREATE TABLESPACE ts LOCATION '/tmp/g7design/ts'`);
const o = C('postgres', 'other'); await o.connect();
await o.query(`CREATE TABLE ot(a int); GRANT SELECT ON ot TO k_otherobj`);
for (const [k, q] of Object.entries(g)) { try { await A(q); } catch (e) { out(`  setup ${k} FAILED: ${e.message}`); } }
const before = (await A(`SELECT count(*)::int n FROM pg_shdepend WHERE refobjid = 0`)).rows[0].n;
await A(`GRANT SELECT ON s.t TO PUBLIC; GRANT EXECUTE ON FUNCTION pg_catalog.pg_ls_dir(text) TO PUBLIC`);
const after = (await A(`SELECT count(*)::int n FROM pg_shdepend WHERE refobjid = 0`)).rows[0].n;
out('\n== pg_shdepend rows per role (queried from database "app"); dbid: cur=app, 0=shared, other=another DB');
const rows = (await A(`SELECT r.rolname, d.deptype, d.classid::regclass cls, d.objsubid,
  CASE WHEN d.dbid = 0 THEN '0' WHEN d.dbid = (SELECT oid FROM pg_database WHERE datname = current_database()) THEN 'cur' ELSE 'other' END db
  FROM pg_roles r LEFT JOIN pg_shdepend d ON d.refclassid = 'pg_authid'::regclass AND d.refobjid = r.oid
  WHERE r.rolname LIKE 'k\\_%' ORDER BY 1, 2, 3`)).rows;
const by = {}; for (const r of rows) (by[r.rolname] ??= []).push(r.deptype ? `${r.deptype}:${r.cls}${r.objsubid ? '#' + r.objsubid : ''}@${r.db}` : 'NONE');
for (const k of kinds) out(`  ${('k_' + k).padEnd(18)} ${(by['k_' + k] ?? ['?']).join(', ')}`);
out(`  PUBLIC grants add pg_shdepend rows? ${after !== before} (rows with refobjid=0: ${before} -> ${after})`);
out('\n== membership catalog (pg_auth_members, PG16+ options)');
out((await A(`SELECT m.roleid::regrole role, m.member::regrole member, admin_option, inherit_option, set_option FROM pg_auth_members m WHERE m.member::regrole::text IN ('login','k_member_predef','k_member_role')`)).rows);
out('  implicit pg_database_owner: owner is member in app?', (await A(`SELECT pg_has_role('owner','pg_database_owner','MEMBER') m, (SELECT count(*) FROM pg_auth_members WHERE roleid='pg_database_owner'::regrole)::int explicit_rows`)).rows[0]);
out('\n== predefined roles in this server');
out((await A(`SELECT string_agg(rolname, ' ' ORDER BY rolname) FROM pg_roles WHERE rolname ~ '^pg_'`)).rows[0].string_agg);
out('\n== privilege-inquiry functions available');
out((await A(`SELECT string_agg(DISTINCT proname, ' ' ORDER BY proname) FROM pg_proc WHERE proname ~ '^(has_.*_privilege|pg_has_role)$'`)).rows[0].string_agg);
await A(`GRANT USAGE ON SCHEMA s TO nile_app`);

// catalog readability by the runtime role (the check runs as nile_app)
out('\n== catalog readability as login with startup role nile_app');
const L = new pg.Client({ host: '127.0.0.1', port: PORT, user: 'login', database: 'app', options: '-c role=nile_app' }); await L.connect();
for (const cat of ['pg_roles','pg_authid','pg_auth_members','pg_shdepend','pg_db_role_setting','pg_parameter_acl','pg_default_acl',
  'pg_largeobject_metadata','pg_user_mapping','pg_user_mappings','pg_init_privs','pg_policy','pg_database','pg_tablespace','pg_foreign_server','pg_publication','pg_subscription','pg_hba_file_rules']) {
  try { const r = await L.query(`SELECT count(*)::int n FROM ${cat}`); out(`  ${cat.padEnd(24)} readable (${r.rows[0].n} rows)`); }
  catch (e) { out(`  ${cat.padEnd(24)} DENIED (${e.code})`); }
}
out('  pg_db_role_setting content visible to nile_app:', (await L.query(`SELECT setrole::regrole::text r, setconfig FROM pg_db_role_setting`)).rows);
out('  pg_parameter_acl content visible:', (await L.query(`SELECT parname, paracl::text FROM pg_parameter_acl`)).rows);
out('  login may CONNECT to databases:', (await L.query(`SELECT string_agg(datname, ' ') FROM pg_database WHERE has_database_privilege(session_user, oid, 'CONNECT')`)).rows[0].string_agg);
out('  pg_has_role(nile_app -> login) ? ', (await L.query(`SELECT pg_has_role('nile_app','login','MEMBER') m`)).rows[0].m);
await L.end();

// backend signalling without pg_signal_backend
out('\n== signalling: login (no pg_signal_backend) vs another session of the same login');
const v = new pg.Client({ host: '127.0.0.1', port: PORT, user: 'login', database: 'app', options: '-c role=nile_app' }); await v.connect(); v.on('error', () => {});
const vpid = (await v.query('select pg_backend_pid() p')).rows[0].p;
const k1 = new pg.Client({ host: '127.0.0.1', port: PORT, user: 'login', database: 'app', options: '-c role=nile_app' }); await k1.connect();
try { await k1.query(`SELECT pg_cancel_backend(${vpid})`); out('  as nile_app: cancel same-login backend -> SUCCEEDED'); } catch (e) { out(`  as nile_app: cancel same-login backend -> denied (${e.code})`); }
await k1.query('SET ROLE NONE');
try { const r = await k1.query(`SELECT pg_terminate_backend(${vpid}) t`); out(`  after SET ROLE NONE: terminate same-login backend -> ${r.rows[0].t ? 'SUCCEEDED' : 'false'}`); } catch (e) { out(`  after SET ROLE NONE: terminate -> denied (${e.code})`); }
await k1.end();

// ALTER ROLE .. IN DATABASE .. SET role, and what happens when the membership is missing / SET option false
out('\n== ALTER ROLE ... IN DATABASE ... SET role = nile_app');
await S(`CREATE ROLE login2 LOGIN`); await S(`GRANT nile_app TO login2`); await S(`ALTER ROLE login2 IN DATABASE app SET role = 'nile_app'`);
const tryConn = async (label, opts = {}) => {
  const c = new pg.Client({ host: '127.0.0.1', port: PORT, user: 'login2', database: 'app', ...opts }); const notices = [];
  c.on('notice', (n) => notices.push(`${n.severity}: ${n.message}`));
  try { await c.connect(); const r = (await c.query('select current_user u, session_user s')).rows[0];
    out(`  ${label}: connected current_user=${r.u} session_user=${r.s}${notices.length ? ' notices=' + JSON.stringify(notices) : ''}`); await c.end(); }
  catch (e) { out(`  ${label}: connection FAILED (${e.code}: ${e.message})`); }
};
await tryConn('membership present, no startup option');
await tryConn('client startup option -c role=login2 overrides?', { options: '-c role=login2' });
await S(`REVOKE nile_app FROM login2`);
await tryConn('membership REVOKED, no startup option');
await tryConn('membership REVOKED, startup option -c role=nile_app', { options: '-c role=nile_app' });
await S(`GRANT nile_app TO login2 WITH SET FALSE`);
await tryConn('membership WITH SET FALSE, no startup option');
await tryConn('membership WITH SET FALSE, startup option', { options: '-c role=nile_app' });

await o.end(); await a.end(); await sup.end();
out('\ndone');
