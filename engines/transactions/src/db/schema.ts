/**
 * Transactions DB schema (Drizzle, ADR-0004). Money = integer minor units
 * (money-minor.ts). Quantities/costs cross boundaries as decimal strings.
 * SQL mirror: engines/db/migrations/0001_nile_engines.sql
 */
import { integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizations } from '../../../platform/src/db/schema.js';

export const salesTransactions = pgTable('sales_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => organizations.id),
  kind: text('kind').notNull(), // sale | purchase | return
  status: text('status').notNull().default('posted'), // draft | posted | void
  totalMinor: integer('total_minor').notNull(),
  currency: text('currency').notNull().default('EGP'),
  idempotencyKey: text('idempotency_key').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const transactionLines = pgTable('transaction_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => organizations.id),
  transactionId: uuid('transaction_id').notNull().references(() => salesTransactions.id),
  itemId: uuid('item_id').notNull(),
  quantity: numeric('quantity', { precision: 18, scale: 3 }).notNull(),
  unitPriceMinor: integer('unit_price_minor').notNull(),
  lineTotalMinor: integer('line_total_minor').notNull(),
});

export const stockMovements = pgTable('stock_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => organizations.id),
  itemId: uuid('item_id').notNull(),
  warehouse: text('warehouse').notNull().default('main'),
  direction: text('direction').notNull(), // in | out | adjust
  quantity: numeric('quantity', { precision: 18, scale: 3 }).notNull(),
  costPerUnitMinor: integer('cost_per_unit_minor'),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Cash drawer movements per shift (cash.ts domain). */
export const cashMovements = pgTable('cash_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => organizations.id),
  shiftId: uuid('shift_id').notNull(),
  direction: text('direction').notNull(), // in | out
  status: text('status').notNull().default('pending'), // pending | posted
  amountMinor: integer('amount_minor').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
