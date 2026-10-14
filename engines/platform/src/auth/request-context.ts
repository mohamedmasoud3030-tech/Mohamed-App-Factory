/**
 * Request → trusted TenantContext (ADR-0005 §4).
 * session (cookie) → user → server-side memberships → activeOrganizationId.
 * Nothing the client sends (body, query, headers other than the session
 * cookie) can influence which tenant is used.
 */
import { eq } from 'drizzle-orm';
import { member } from './schema.js';
import { resolveTenantContext, TenantContextError, type TenantContext } from '../tenant.js';
import type { AnyPgDatabase } from '../db/with-tenant.js';
import type { NileAuth } from './auth.js';

export interface RequestContext extends TenantContext {
  userName: string;
  userEmail: string;
}

export async function resolveRequestContext(auth: NileAuth, db: AnyPgDatabase, headers: Headers): Promise<RequestContext> {
  const s = await auth.api.getSession({ headers });
  if (!s) throw new TenantContextError('UNAUTHENTICATED');
  const memberships = await db
    .select({ tenantId: member.organizationId, role: member.role })
    .from(member)
    .where(eq(member.userId, s.user.id));
  const activeTenantId = (s.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null;
  const ctx = resolveTenantContext({ sessionUserId: s.user.id, memberships, activeTenantId });
  return { ...ctx, userName: s.user.name, userEmail: s.user.email };
}
