/**
 * Booking DB schema (Drizzle, ADR-0004).
 * NOTE: DB-level "no double booking" (EXCLUDE USING gist on tstzrange) is
 * added with the booking flow; the domain conflict check lives in booking.ts.
 */
import { bigint, boolean, foreignKey, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { tenantIdColumn, tenantKey, tenantPolicy } from '../../../platform/src/db/tenancy.js';

export const bookableResources = pgTable(
  'bookable_resources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantIdColumn(),
    kind: text('kind').notNull(), // court | doctor | table | room | trainer
    nameAr: text('name_ar').notNull(),
    nameEn: text('name_en').notNull(),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [tenantKey('bookable_resources', t.tenantId, t.id), tenantPolicy()],
).enableRLS();

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantIdColumn(),
    resourceId: uuid('resource_id').notNull(),
    customerName: text('customer_name').notNull(),
    customerPhone: text('customer_phone').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    status: text('status').notNull().default('PENDING'),
    depositMinor: bigint('deposit_minor', { mode: 'number' }).notNull().default(0),
    code: text('code').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('bookings_tenant_code_uq').on(t.tenantId, t.code),
    foreignKey({ name: 'bookings_resource_fk', columns: [t.tenantId, t.resourceId], foreignColumns: [bookableResources.tenantId, bookableResources.id] }),
    index('bookings_resource_time_idx').on(t.tenantId, t.resourceId, t.startsAt),
    tenantPolicy(),
  ],
).enableRLS();
