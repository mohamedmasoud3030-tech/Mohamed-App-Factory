/**
 * Booking DB schema (Drizzle, ADR-0004).
 * SQL mirror: engines/db/migrations/0001_nile_engines.sql
 */
import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizations } from '../../../platform/src/db/schema.js';

export const bookableResources = pgTable('bookable_resources', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => organizations.id),
  kind: text('kind').notNull(), // court | doctor | table | room | trainer
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  isActive: text('is_active').notNull().default('true'),
});

export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => organizations.id),
  resourceId: uuid('resource_id').notNull().references(() => bookableResources.id),
  customerName: text('customer_name').notNull(),
  customerPhone: text('customer_phone').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('PENDING'),
  depositMinor: integer('deposit_minor').notNull().default(0),
  code: text('code').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
