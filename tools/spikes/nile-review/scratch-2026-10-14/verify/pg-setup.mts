// Production-like topology on real PostgreSQL (scratch; never committed).
//   postgres   = cluster superuser (setup only)
//   nile_owner = migration/owner login (NOT superuser; CREATEROLE so the hardening migration can create nile_app)
//   nile_login = runtime login; granted nile_app AFTER migrations
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { migrationsFolder, schema } from '../engines/db/open.ts';

const su = new pg.Client({ connectionString: 'postgres://postgres@127.0.0.1:5433/postgres' });
await su.connect();
await su.query('DROP DATABASE IF EXISTS nile WITH (FORCE)');
for (const r of ['nile_login', 'nile_app', 'nile_owner']) await su.query(`DROP ROLE IF EXISTS ${r}`);
await su.query('CREATE ROLE nile_owner LOGIN NOSUPERUSER CREATEROLE');
await su.query('CREATE ROLE nile_login LOGIN NOSUPERUSER');
await su.query('CREATE DATABASE nile OWNER nile_owner');
await su.end();

const owner = new pg.Pool({ connectionString: 'postgres://nile_owner@127.0.0.1:5433/nile', max: 1 });
await migrate(drizzle(owner, { schema }), { migrationsFolder });
const info = await owner.query(`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`);
console.log('migrations applied as nile_owner:', info.rows[0].n);
await owner.end();

const su2 = new pg.Client({ connectionString: 'postgres://postgres@127.0.0.1:5433/nile' });
await su2.connect();
await su2.query('GRANT nile_app TO nile_login');
const roles = await su2.query(`SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname LIKE 'nile_%' ORDER BY 1`);
console.table(roles.rows);
const owners = await su2.query(`SELECT DISTINCT tableowner FROM pg_tables WHERE schemaname='public'`);
console.log('public table owner(s):', owners.rows.map((r) => r.tableowner));
await su2.end();
