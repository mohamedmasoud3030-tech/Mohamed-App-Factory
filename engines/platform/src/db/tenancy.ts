/**
 * Shared building blocks every tenant-owned table MUST use (ADR-0002/0004/0005).
 *
 *  - tenantIdColumn(): `tenant_id uuid NOT NULL → organization(id)`
 *  - tenantPolicy():   fail-closed RLS policy (unset context ⇒ NULL ⇒ no rows)
 *  - tenantKey():      UNIQUE (tenant_id, id) so children can use COMPOSITE
 *                      foreign keys. PostgreSQL checks foreign keys WITHOUT
 *                      applying RLS, so a plain `child.parent_id → parent.id`
 *                      lets tenant A attach rows to tenant B's parent. The
 *                      composite FK (tenant_id, parent_id) → (tenant_id, id)
 *                      makes that impossible at the database level.
 *
 * FORCE ROW LEVEL SECURITY + runtime-role grants live in the hardening
 * migration (drizzle-kit cannot express FORCE): engines/db/migrations.
 */
import { sql } from 'drizzle-orm';
import { pgPolicy, unique, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { organization } from '../auth/schema.js';

export const TENANT_EXPR = sql`tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid`;

export const tenantIdColumn = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => organization.id);

export const tenantPolicy = () =>
  pgPolicy('tenant_isolation', { as: 'permissive', for: 'all', to: 'public', using: TENANT_EXPR, withCheck: TENANT_EXPR });

export const tenantKey = (table: string, tenantId: AnyPgColumn, id: AnyPgColumn) =>
  unique(`${table}_tenant_id_id_uq`).on(tenantId, id);
