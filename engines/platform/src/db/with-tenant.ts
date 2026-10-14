/**
 * The ONLY tenant-scoped SQL path (ADR-0005 §5).
 * Opens a transaction whose FIRST statement sets the transaction-local
 * `app.tenant_id`; the value reverts on commit/rollback, so a pooled
 * connection can never carry tenant context into the next request.
 * Works with any Drizzle PostgreSQL driver (node-postgres in production,
 * PGlite in tests / offline desktop builds).
 */
import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPgDatabase = PgDatabase<PgQueryResultHKT, any, any>;
export type TenantTx<D extends AnyPgDatabase> = Parameters<Parameters<D['transaction']>[0]>[0];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class TenantScopeError extends Error {
  constructor(readonly code: 'TENANT_CONTEXT_REQUIRED' | 'TENANT_CONTEXT_INVALID') {
    super(code);
    this.name = 'TenantScopeError';
  }
}

export async function withTenant<D extends AnyPgDatabase, T>(
  db: D,
  tenantId: string,
  fn: (tx: TenantTx<D>) => Promise<T>,
): Promise<T> {
  if (!tenantId) throw new TenantScopeError('TENANT_CONTEXT_REQUIRED');
  if (!UUID_RE.test(tenantId)) throw new TenantScopeError('TENANT_CONTEXT_INVALID');
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx as TenantTx<D>);
  }) as Promise<T>;
}
