/**
 * Platform tenant-owned tables (Drizzle, ADR-0004). Identity/membership
 * tables live in ../auth/schema.ts (platform-global, see note there).
 */
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenantIdColumn, tenantPolicy } from './tenancy.js';

/** Tenant-scoped audit trail (ADR-0002: audit records carry tenant context). */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantIdColumn(),
    userId: uuid('user_id').notNull(),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    payload: text('payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_tenant_created_idx').on(t.tenantId, t.createdAt), tenantPolicy()],
).enableRLS();
