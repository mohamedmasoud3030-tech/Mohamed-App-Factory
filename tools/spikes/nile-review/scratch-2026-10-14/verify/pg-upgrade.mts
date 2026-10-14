// Upgrade an EXISTING migrated database in place (no drop), as the owner role.
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { migrationsFolder, schema } from '../engines/db/open.ts';

const su = new pg.Client({ connectionString: 'postgres://postgres@127.0.0.1:5433/nile' });
await su.connect();
const snap = async (label: string) => {
  const r = await su.query(`SELECT (SELECT count(*) FROM drizzle.__drizzle_migrations)::int AS migrations,
    (SELECT count(*) FROM sales_transactions)::int AS sales, (SELECT count(*) FROM audit_log)::int AS audit,
    (SELECT count(*) FROM stock_movements)::int AS moves`);
  console.log(label, JSON.stringify(r.rows[0]));
};
await snap('BEFORE upgrade:');
const owner = new pg.Pool({ connectionString: 'postgres://nile_owner@127.0.0.1:5433/nile', max: 1 });
await migrate(drizzle(owner, { schema }), { migrationsFolder });
await migrate(drizzle(owner, { schema }), { migrationsFolder }); // second run must be a no-op
await owner.end();
await snap('AFTER upgrade (run twice):');
const p = await su.query(`SELECT t, has_table_privilege('nile_app', t, 'UPDATE') u, has_table_privilege('nile_app', t, 'DELETE') d
  FROM unnest(array['audit_log','sales_transactions','transaction_lines','stock_movements','cash_movements','catalog_variants']) t`);
console.log('nile_app UPDATE/DELETE after upgrade:', p.rows.map((r) => `${r.t}=${r.u ? 'U' : '-'}${r.d ? 'D' : '-'}`).join(' '));
await su.end();
export {};
