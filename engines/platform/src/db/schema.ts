/**
 * Platform DB schema (Drizzle, ADR-0004). Module-owned per ADR-0004 migration model.
 * SQL mirror: engines/db/migrations/0001_nile_engines.sql
 */
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** A tenant = one customer organization (ADR-0002). */
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  isDemo: text('is_demo').notNull().default('false'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Tenant-scoped audit trail (ADR-0002: audit records carry tenant context). */
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => organizations.id),
  userId: text('user_id').notNull(),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  payload: text('payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
