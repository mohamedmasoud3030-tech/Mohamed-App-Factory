/**
 * Nile Platform Engine — tenant context (fail-closed).
 * Implements the invariants of ADR-0002 / ADR-0005:
 *  - active tenant is derived from authenticated server state, never from an
 *    arbitrary client-supplied id;
 *  - the RLS session variable is transaction-local (pooled connections can
 *    never leak tenant context);
 *  - unset context => NULL comparison => zero rows (deny by default).
 */

export interface TenantContext {
  tenantId: string;
  userId: string;
  /** role inside the organization: owner | admin | member | custom app roles */
  role: string;
}

/** The one SQL statement that opens every tenant-scoped transaction (ADR-0005 §5). */
export const SET_TENANT_SQL = `SELECT set_config('app.tenant_id', $1, true)`;

/** RLS policy body used by module migrations (ADR-0005 §6). */
export const RLS_POLICY_USING = `tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid`;

export class TenantContextError extends Error {}

/**
 * Validate a client-provided tenant hint against server-side membership.
 * Returns the trusted context or throws — a hint alone is never trusted.
 */
export function resolveTenantContext(opts: {
  sessionUserId: string | null;
  memberships: ReadonlyArray<{ tenantId: string; role: string }>;
  activeTenantId: string | null;
  clientHint?: string | null;
}): TenantContext {
  if (!opts.sessionUserId) throw new TenantContextError('UNAUTHENTICATED');
  const requested = opts.clientHint ?? opts.activeTenantId;
  if (!requested) throw new TenantContextError('NO_ACTIVE_TENANT');
  const membership = opts.memberships.find((m) => m.tenantId === requested);
  if (!membership) throw new TenantContextError('NOT_A_MEMBER');
  return { tenantId: membership.tenantId, userId: opts.sessionUserId, role: membership.role };
}

/** Guard used by services before touching a tenant-owned row. */
export function assertOwnsTenant(ctx: TenantContext, rowTenantId: string): void {
  if (ctx.tenantId !== rowTenantId) throw new TenantContextError('CROSS_TENANT_ACCESS');
}
