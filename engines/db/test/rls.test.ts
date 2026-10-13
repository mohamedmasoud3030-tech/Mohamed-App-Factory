/**
 * Real-PostgreSQL (PGlite) proof of ADR-0005 fail-closed invariants:
 *  1. No tenant context -> zero rows.
 *  2. Tenant A cannot read tenant B rows.
 *  3. Tenant A cannot insert rows as tenant B.
 * The migration uses FORCE RLS, so policies bind even the table owner here —
 * in production the runtime role is additionally non-owner (ADR-0005 §7).
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';
let db: PGlite;

async function asTenant<T>(tenantId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query(`SELECT set_config('app.tenant_id', $1, false)`, [tenantId ?? '']);
  try {
    return await fn();
  } finally {
    await db.query(`SELECT set_config('app.tenant_id', '', false)`);
  }
}

beforeAll(async () => {
  db = new PGlite();
  const sql = readFileSync(new URL('../migrations/0001_nile_engines.sql', import.meta.url), 'utf8');
  await db.exec(sql);
  // Production runs as a NON-superuser, non-owner runtime role (ADR-0005 §7);
  // superusers bypass RLS by design, so the whole suite runs under nile_app.
  await db.exec(`CREATE ROLE nile_app NOLOGIN;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nile_app;`);
  await asTenant(ORG_A, async () => {
    await db.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, 'A', 'a')`, [ORG_A]);
    await db.query(
      `INSERT INTO bookable_resources (id, tenant_id, kind, name_ar, name_en) VALUES ('33333333-3333-3333-3333-333333333333', $1, 'court', 'ملعب', 'Court')`,
      [ORG_A],
    );
    await db.query(
      `INSERT INTO bookings (tenant_id, resource_id, customer_name, customer_phone, starts_at, ends_at, code)
       VALUES ($1, '33333333-3333-3333-3333-333333333333', 'Ahmed', '0100', now(), now() + interval '1 hour', 'BK-AAAAA')`,
      [ORG_A],
    );
  });
  await asTenant(ORG_B, async () => {
    await db.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, 'B', 'b')`, [ORG_B]);
  });
  await db.query('SET ROLE nile_app');
}, 60_000);

describe('RLS tenant isolation (real PostgreSQL)', () => {
  it('no tenant context -> zero rows (fail closed)', async () => {
    const r = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM bookings');
    expect(r.rows[0]?.n).toBe(0);
  });

  it('tenant B cannot read tenant A bookings', async () => {
    await asTenant(ORG_B, async () => {
      const r = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM bookings');
      expect(r.rows[0]?.n).toBe(0);
    });
    await asTenant(ORG_A, async () => {
      const r = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM bookings');
      expect(r.rows[0]?.n).toBe(1);
    });
  });

  it('tenant A cannot insert rows as tenant B', async () => {
    await asTenant(ORG_A, async () => {
      await expect(
        db.query(
          `INSERT INTO bookings (tenant_id, resource_id, customer_name, customer_phone, starts_at, ends_at, code)
           VALUES ($1, '33333333-3333-3333-3333-333333333333', 'Mallory', '0100', now(), now(), 'BK-BBBBB')`,
          [ORG_B],
        ),
      ).rejects.toThrow();
    });
  });

  it('composite uniqueness is per-tenant (same idempotency key, two tenants OK)', async () => {
    const insertTxn = (tenant: string) =>
      db.query(
        `INSERT INTO sales_transactions (tenant_id, kind, total_minor, idempotency_key, created_by)
         VALUES ($1, 'sale', 100, 'key-1', 'u1')`,
        [tenant],
      );
    await asTenant(ORG_A, () => insertTxn(ORG_A));
    await asTenant(ORG_B, () => insertTxn(ORG_B));
    await asTenant(ORG_A, async () => {
      await expect(insertTxn(ORG_A)).rejects.toThrow(); // duplicate within tenant
    });
  });
});
