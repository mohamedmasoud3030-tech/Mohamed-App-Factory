/**
 * The ONLY tenant-scoped SQL path (ADR-0005 §5): opens a transaction whose
 * first statement sets the transaction-local `app.tenant_id`, so pooled
 * connections can never leak tenant context between requests.
 * Pairs with migrations' fail-closed RLS policies.
 */
import { sql, type SQL } from 'drizzle-orm';

export interface TenantExecutor {
  execute: (query: SQL) => Promise<unknown>;
  transaction: <T>(fn: (tx: TenantExecutor) => Promise<T>) => Promise<T>;
}

export async function withTenant<T>(db: TenantExecutor, tenantId: string, fn: (tx: TenantExecutor) => Promise<T>): Promise<T> {
  if (!tenantId) throw new Error('TENANT_CONTEXT_REQUIRED');
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}
