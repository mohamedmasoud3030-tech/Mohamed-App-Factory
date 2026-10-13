/**
 * Catalog DB schema (Drizzle, ADR-0004).
 * SQL mirror: engines/db/migrations/0001_nile_engines.sql
 */
import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizations } from '../../../platform/src/db/schema.js';

export const catalogItems = pgTable('catalog_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => organizations.id),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  category: text('category').notNull(),
  priceMinor: integer('price_minor').notNull(),
  compareAtMinor: integer('compare_at_minor'),
  isActive: text('is_active').notNull().default('true'),
});

export const catalogVariants = pgTable('catalog_variants', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => organizations.id),
  itemId: uuid('item_id').notNull().references(() => catalogItems.id),
  sku: text('sku').notNull(),
  labelAr: text('label_ar').notNull(),
  labelEn: text('label_en').notNull(),
  stock: integer('stock').notNull().default(0),
});

/** Every public site writes here; the admin panel works this pipeline. */
export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => organizations.id),
  source: text('source').notNull(), // courts|restaurant|clinic|realestate|gym|mobile|fashion
  customerName: text('customer_name').notNull(),
  customerPhone: text('customer_phone').notNull(),
  message: text('message'),
  stage: text('stage').notNull().default('NEW'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
