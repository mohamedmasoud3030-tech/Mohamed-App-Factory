/**
 * Phase 2 gate on REAL PostgreSQL 18 via the production path (openPostgres),
 * runtime login `nile_login` (member of nile_app). Scratch — never committed.
 * Each test prints an OBSERVED line so the report can quote evidence.
 */
import pg from 'pg';
import { sql, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPostgres, type NileDb, type OpenedDatabase } from '../engines/db/open.ts';
import { organization } from '../engines/platform/src/auth/schema.ts';
import { withTenant } from '../engines/platform/src/db/with-tenant.ts';
import { createCatalogItems } from '../engines/catalog/src/catalog-service.ts';
import { catalogVariants, catalogItems } from '../engines/catalog/src/db/schema.ts';
import { salesTransactions, transactionLines, stockMovements } from '../engines/transactions/src/db/schema.ts';
import { auditLog } from '../engines/platform/src/db/schema.ts';
import { recordSale } from '../engines/transactions/src/sale-service.ts';

const RUNTIME = 'postgres://nile_login@127.0.0.1:5433/nile';
const OWNER = 'postgres://nile_owner@127.0.0.1:5433/nile';
let opened: OpenedDatabase;
let db: NileDb;
let pool: pg.Pool;
const log = (...a: unknown[]) => console.log('OBSERVED:', ...a);
const pgCode = (e: any) => { for (let x = e; x; x = x.cause) if (x.code) return x.code; return undefined; };

async function newTenant(slug: string, stock: string, price = 1000) {
  const [o] = await db.insert(organization).values({ name: slug, slug: `${slug}-${Date.now()}-${Math.random()}` }).returning({ id: organization.id });
  await createCatalogItems(db, o!.id, [{ nameAr: 'صنف', nameEn: 'Item', category: 'x', priceMinor: price, variants: [{ sku: `S-${slug}`, labelAr: 'افتراضي', labelEn: 'Default', stock }] }]);
  const variantId = await withTenant(db, o!.id, async (tx: any) => (await tx.select({ id: catalogVariants.id }).from(catalogVariants))[0].id as string);
  return { tenantId: o!.id, variantId };
}
const counts = (tenantId: string) =>
  withTenant(db, tenantId, async (tx: any) => {
    const n = async (t: any) => Number((await tx.select({ n: sql<number>`count(*)` }).from(t))[0].n);
    const [v] = await tx.select({ stock: catalogVariants.stock }).from(catalogVariants);
    return { sales: await n(salesTransactions), lines: await n(transactionLines), moves: await n(stockMovements), audit: await n(auditLog), stock: v.stock as string };
  });
const actor = (tenantId: string) => ({ tenantId, userId: tenantId });

beforeAll(async () => {
  opened = await openPostgres({ url: RUNTIME });
  db = opened.db;
  pool = (db as any).$client as pg.Pool;
});
afterAll(() => opened.close());

describe('A. runtime role + pooled connections (real PG)', () => {
  it('A1 every pooled connection runs as nile_app (not just the first)', async () => {
    const clients = await Promise.all(Array.from({ length: 10 }, () => pool.connect()));
    const users = await Promise.all(clients.map(async (c) => (await c.query('SELECT current_user u')).rows[0].u));
    clients.forEach((c) => c.release());
    log('A1 current_user across 10 concurrent pooled connections =', [...new Set(users)]);
    expect(new Set(users)).toEqual(new Set(['nile_app']));
  });

  it('A2 interleaved concurrent tenant transactions never see each other; no context survives on the pool', async () => {
    const a = await newTenant('a2a', '10');
    const b = await newTenant('a2b', '10');
    const runs = Array.from({ length: 40 }, (_, i) => {
      const t = i % 2 ? a : b;
      return withTenant(db, t.tenantId, async (tx: any) => {
        await tx.execute(sql`SELECT pg_sleep(${Math.random() * 0.02})`);
        const rows = await tx.select({ tenantId: catalogItems.tenantId }).from(catalogItems);
        return rows.every((r: any) => r.tenantId === t.tenantId) && rows.length === 1;
      });
    });
    const ok = await Promise.all(runs);
    const leftovers = await Promise.all(
      Array.from({ length: 10 }, async () => {
        const c = await pool.connect();
        try { return (await c.query(`SELECT current_setting('app.tenant_id', true) v`)).rows[0].v; } finally { c.release(); }
      }),
    );
    log('A2 40 interleaved txns all isolated =', ok.every(Boolean), '; app.tenant_id on idle pooled connections =', JSON.stringify([...new Set(leftovers)]));
    expect(ok.every(Boolean)).toBe(true);
    expect(leftovers.every((v) => !v)).toBe(true);
  });

  it('A3 cross-tenant read/insert/update/delete/FK on real PG', async () => {
    const a = await newTenant('a3a', '5');
    const b = await newTenant('a3b', '5');
    const read = await withTenant(db, a.tenantId, (tx: any) => tx.select().from(catalogVariants).where(eq(catalogVariants.id, b.variantId)));
    const ins = await withTenant(db, a.tenantId, (tx: any) => tx.insert(catalogItems).values({ tenantId: b.tenantId, nameAr: 'x', nameEn: 'x', category: 'x', priceMinor: 1 })).then(() => 'ok', pgCode);
    const upd = await withTenant(db, a.tenantId, (tx: any) => tx.update(catalogVariants).set({ stock: '0' }).where(eq(catalogVariants.id, b.variantId)).returning());
    const del = await withTenant(db, a.tenantId, (tx: any) => tx.delete(catalogVariants).where(eq(catalogVariants.id, b.variantId)).returning());
    // FK: tenant A movement pointing at tenant B's variant
    const fk = await withTenant(db, a.tenantId, (tx: any) => tx.insert(stockMovements).values({ tenantId: a.tenantId, variantId: b.variantId, direction: 'in', quantity: '1' })).then(() => 'ok', pgCode);
    const noCtx = Number((await db.select({ n: sql<number>`count(*)` }).from(catalogItems))[0]!.n);
    log('A3 read=', read.length, 'insertAsB=', ins, 'update=', upd.length, 'delete=', del.length, 'fkToB=', fk, 'rowsWithoutContext=', noCtx);
    expect([read.length, ins, upd.length, del.length, fk, noCtx]).toEqual([0, '42501', 0, 0, '23503', 0]);
  });
});

describe('C. sales integrity under real concurrency', () => {
  it('C1 20 concurrent single-unit sales against stock 5 → exactly 5 succeed, stock 0, no oversell', async () => {
    const t = await newTenant('c1', '5');
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) => recordSale(db, actor(t.tenantId), { idempotencyKey: `c1-key-${i}`, lines: [{ variantId: t.variantId, quantity: '1' }] })),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const reasons = results.filter((r) => r.status === 'rejected').map((r: any) => r.reason?.code ?? pgCode(r.reason) ?? String(r.reason));
    const c = await counts(t.tenantId);
    log('C1 succeeded=', ok, 'failures=', JSON.stringify([...new Set(reasons)]), 'db=', JSON.stringify(c));
    expect(ok).toBe(5);
    expect(c).toMatchObject({ sales: 5, lines: 5, moves: 5, audit: 5, stock: '0.000' });
    expect(new Set(reasons)).toEqual(new Set(['insufficient_stock']));
  });

  it('C2 10 concurrent DUPLICATE requests (same key, same body) → one sale, all callers get it', async () => {
    const t = await newTenant('c2', '50');
    const body = { idempotencyKey: 'c2-same-key', lines: [{ variantId: t.variantId, quantity: '2' }] };
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => recordSale(db, actor(t.tenantId), body)));
    const ids = results.map((r: any) => (r.status === 'fulfilled' ? r.value.sale.id : `ERR:${r.reason?.code ?? pgCode(r.reason) ?? r.reason}`));
    const replays = results.filter((r: any) => r.status === 'fulfilled' && r.value.replayed).length;
    const c = await counts(t.tenantId);
    log('C2 distinct outcomes=', JSON.stringify([...new Set(ids)]), 'replayed=', replays, 'db=', JSON.stringify(c));
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).not.toMatch(/^ERR/);
    expect(c).toMatchObject({ sales: 1, lines: 1, moves: 1, audit: 1, stock: '48.000' });
  });

  it('C3 concurrent same key with DIFFERENT bodies → one sale, others 409 idempotency_conflict', async () => {
    const t = await newTenant('c3', '50');
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => recordSale(db, actor(t.tenantId), { idempotencyKey: 'c3-key', lines: [{ variantId: t.variantId, quantity: String(i + 1) }] })),
    );
    const outcomes = results.map((r: any) => (r.status === 'fulfilled' ? 'ok' : r.reason?.code ?? pgCode(r.reason)));
    const c = await counts(t.tenantId);
    log('C3 outcomes=', JSON.stringify(outcomes), 'db=', JSON.stringify(c));
    expect(outcomes.filter((o) => o === 'ok').length).toBe(1);
    expect(outcomes.filter((o) => o !== 'ok').every((o) => o === 'idempotency_conflict')).toBe(true);
    expect(c.sales).toBe(1);
  });

  it('C4 concurrent multi-line carts in opposite order do not deadlock', async () => {
    const [o] = await db.insert(organization).values({ name: 'c4', slug: `c4-${Date.now()}` }).returning({ id: organization.id });
    await createCatalogItems(db, o!.id, [
      { nameAr: 'أ', nameEn: 'A', category: 'x', priceMinor: 100, variants: [{ sku: 'C4A', labelAr: 'افتراضي', labelEn: 'Default', stock: '1000' }] },
      { nameAr: 'ب', nameEn: 'B', category: 'x', priceMinor: 100, variants: [{ sku: 'C4B', labelAr: 'افتراضي', labelEn: 'Default', stock: '1000' }] },
    ]);
    const [va, vb] = await withTenant(db, o!.id, async (tx: any) => (await tx.select({ id: catalogVariants.id }).from(catalogVariants).orderBy(catalogVariants.sku)).map((r: any) => r.id));
    const results = await Promise.allSettled(
      Array.from({ length: 30 }, (_, i) =>
        recordSale(db, actor(o!.id), { idempotencyKey: `c4-${i}`, lines: i % 2 ? [{ variantId: va, quantity: '1' }, { variantId: vb, quantity: '1' }] : [{ variantId: vb, quantity: '1' }, { variantId: va, quantity: '1' }] }),
      ),
    );
    const errs = results.filter((r) => r.status === 'rejected').map((r: any) => pgCode(r.reason) ?? r.reason?.code);
    log('C4 30 opposite-order carts: rejected=', errs.length, JSON.stringify([...new Set(errs)]));
    expect(errs).toEqual([]);
  });

  it('C5 failure injected at the LAST write (audit insert) → nothing persisted, stock untouched', async () => {
    const t = await newTenant('c5', '7');
    const owner = new pg.Client({ connectionString: OWNER });
    await owner.connect();
    await owner.query(`CREATE OR REPLACE FUNCTION scratch_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$`);
    await owner.query(`CREATE TRIGGER scratch_fail_audit BEFORE INSERT ON audit_log FOR EACH ROW WHEN (NEW.tenant_id = '${t.tenantId}') EXECUTE FUNCTION scratch_fail()`);
    try {
      const r = await recordSale(db, actor(t.tenantId), { idempotencyKey: 'c5-k', lines: [{ variantId: t.variantId, quantity: '3' }] }).then(() => 'committed', (e) => `rejected: ${String(e.cause?.message ?? e.message).slice(0, 40)}`);
      const c = await counts(t.tenantId);
      log('C5 audit-insert failure:', r, 'db=', JSON.stringify(c));
      expect(c).toMatchObject({ sales: 0, lines: 0, moves: 0, audit: 0, stock: '7.000' });
    } finally {
      await owner.query('DROP TRIGGER scratch_fail_audit ON audit_log');
      await owner.end();
    }
  });

  it('C6 failure injected mid-way (stock_movements insert, after header+lines) → nothing persisted', async () => {
    const t = await newTenant('c6', '7');
    const owner = new pg.Client({ connectionString: OWNER });
    await owner.connect();
    await owner.query(`CREATE TRIGGER scratch_fail_moves BEFORE INSERT ON stock_movements FOR EACH ROW WHEN (NEW.tenant_id = '${t.tenantId}') EXECUTE FUNCTION scratch_fail()`);
    try {
      await recordSale(db, actor(t.tenantId), { idempotencyKey: 'c6-k', lines: [{ variantId: t.variantId, quantity: '3' }] }).catch(() => undefined);
      const c = await counts(t.tenantId);
      log('C6 stock_movements failure: db=', JSON.stringify(c));
      expect(c).toMatchObject({ sales: 0, lines: 0, moves: 0, audit: 0, stock: '7.000' });
      // and the same idempotency key is usable after the failure is gone
    } finally {
      await owner.query('DROP TRIGGER scratch_fail_moves ON stock_movements');
      await owner.end();
    }
    const retry = await recordSale(db, actor(t.tenantId), { idempotencyKey: 'c6-k', lines: [{ variantId: t.variantId, quantity: '3' }] });
    log('C6 retry with same key after failure → replayed=', retry.replayed, 'stock=', (await counts(t.tenantId)).stock);
    expect(retry.replayed).toBe(false);
  });

  it('C7 money bounds: unsafe price and overflowing total are rejected as domain errors (not 500, not silently wrong)', async () => {
    const t = await newTenant('c7', '1000000000000', 1000);
    const owner = new pg.Client({ connectionString: OWNER });
    await owner.connect();
    await owner.query(`SELECT set_config('app.tenant_id', $1, false)`, [t.tenantId]);
    await owner.query(`UPDATE catalog_items SET price_minor = 9007199254740993 WHERE tenant_id = $1`, [t.tenantId]); // > 2^53
    const unsafe = await recordSale(db, actor(t.tenantId), { idempotencyKey: 'c7-a', lines: [{ variantId: t.variantId, quantity: '1' }] }).then(() => 'committed', (e) => e.code ?? pgCode(e));
    await owner.query(`UPDATE catalog_items SET price_minor = 9007199254740991 WHERE tenant_id = $1`, [t.tenantId]); // = MAX_SAFE
    const overflow = await recordSale(db, actor(t.tenantId), { idempotencyKey: 'c7-b', lines: [{ variantId: t.variantId, quantity: '2' }] }).then(() => 'committed', (e) => e.code ?? pgCode(e));
    await owner.end();
    const c = await counts(t.tenantId);
    log('C7 price>2^53 →', unsafe, '; total>MAX_SAFE →', overflow, '; sales persisted =', c.sales);
    expect([unsafe, overflow, c.sales]).toEqual(['invalid_price', 'amount_out_of_range', 0]);
  });
});

describe('D. runtime privileges + constraints (real PG, as nile_app)', () => {
  let t: { tenantId: string; variantId: string };
  beforeAll(async () => {
    t = await newTenant('d', '5');
    await recordSale(db, actor(t.tenantId), { idempotencyKey: 'd-seed', lines: [{ variantId: t.variantId, quantity: '1' }] });
  });
  const attempt = (q: string) => withTenant(db, t.tenantId, (tx: any) => tx.execute(sql.raw(q))).then((r: any) => `ALLOWED (rows=${r.rowCount ?? r.rows?.length})`, (e) => `denied ${pgCode(e)}`);

  it('D1 privilege probe', async () => {
    const probes: Record<string, string> = {
      'UPDATE audit_log': await attempt(`UPDATE audit_log SET action = 'tampered'`),
      'DELETE audit_log': await attempt(`DELETE FROM audit_log`),
      'TRUNCATE audit_log': await attempt(`TRUNCATE audit_log`),
      'UPDATE transaction_lines (rewrite a sold price)': await attempt(`UPDATE transaction_lines SET unit_price_minor = 1`),
      'DELETE stock_movements': await attempt(`DELETE FROM stock_movements`),
      'DELETE sales_transactions': await attempt(`DELETE FROM sales_transactions WHERE id NOT IN (SELECT transaction_id FROM transaction_lines) `),
      'ALTER TABLE ... DISABLE RLS': await attempt(`ALTER TABLE sales_transactions DISABLE ROW LEVEL SECURITY`),
      'SET row_security = off then read': await attempt(`SET LOCAL row_security = off; SELECT * FROM sales_transactions`),
      'CREATE TABLE in public': await attempt(`CREATE TABLE scratch_evil(x int)`),
      'read drizzle migrations table': await attempt(`SELECT * FROM drizzle.__drizzle_migrations`),
      'DELETE organization': await attempt(`DELETE FROM organization WHERE false`),
      'UPDATE member SET role': await attempt(`UPDATE member SET role = role WHERE false`),
      'SET ROLE nile_owner': await attempt(`SET LOCAL ROLE nile_owner`),
    };
    for (const [k, v] of Object.entries(probes)) log('D1', k.padEnd(48), v);
    expect(probes['TRUNCATE audit_log']).toMatch(/denied/);
    expect(probes['ALTER TABLE ... DISABLE RLS']).toMatch(/denied/);
    expect(probes['CREATE TABLE in public']).toMatch(/denied/);
  });

  it('D2 domain constraints at DB level (enum-like text, negative stock/qty/amounts)', async () => {
    const probes: Record<string, string> = {
      'stock = -5': await attempt(`UPDATE catalog_variants SET stock = -5`),
      "kind = 'banana'": await attempt(`UPDATE sales_transactions SET kind = 'banana'`),
      'total_minor = -100': await attempt(`UPDATE sales_transactions SET total_minor = -100`),
      'line quantity = 0': await attempt(`UPDATE transaction_lines SET quantity = 0`),
      "direction = 'sideways'": await attempt(`UPDATE stock_movements SET direction = 'sideways'`),
      'price_minor = -1': await attempt(`UPDATE catalog_items SET price_minor = -1`),
    };
    for (const [k, v] of Object.entries(probes)) log('D2', k.padEnd(24), v);
  });

  it('D3 column types: money=bigint, flags=boolean, quantities=numeric(18,3)', async () => {
    const r = (await db.execute(sql`
      SELECT table_name, column_name, data_type, numeric_precision, numeric_scale FROM information_schema.columns
      WHERE table_schema='public' AND (column_name LIKE '%\_minor' OR column_name LIKE 'is\_%' OR column_name IN ('quantity','stock'))
      ORDER BY 1,2`)) as any;
    const bad = r.rows.filter((c: any) =>
      (c.column_name.endsWith('_minor') && c.data_type !== 'bigint') ||
      (c.column_name.startsWith('is_') && c.data_type !== 'boolean') ||
      (['quantity', 'stock'].includes(c.column_name) && !(c.data_type === 'numeric' && c.numeric_precision === 18 && c.numeric_scale === 3)));
    log('D3 checked columns =', r.rows.length, '; mismatches =', JSON.stringify(bad));
    expect(bad).toEqual([]);
  });
});
