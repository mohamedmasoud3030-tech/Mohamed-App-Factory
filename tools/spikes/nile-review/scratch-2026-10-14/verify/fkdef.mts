import { PGlite } from '@electric-sql/pglite';
const c = new PGlite('/tmp/drift/db');
const r = await c.query<{ tbl: string; conname: string; def: string }>(`
  SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid) AS def
  FROM pg_constraint WHERE contype='f' AND array_length(conkey,1) > 1 ORDER BY 1,2`);
for (const x of r.rows) console.log(x.tbl.padEnd(20), x.conname.padEnd(30), x.def);
await c.close();
