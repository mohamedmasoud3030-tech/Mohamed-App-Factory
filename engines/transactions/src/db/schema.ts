/**
 * Transactions DB schema (Drizzle, ADR-0004).
 * Money = bigint minor units (money-minor.ts); quantities numeric(18,3).
 * Child rows use COMPOSITE foreign keys (tenant_id, parent_id) so a row can
 * never point at another tenant's parent (FK checks bypass RLS).
 */
import { bigint, foreignKey, index, numeric, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { tenantIdColumn, tenantKey, tenantPolicy } from '../../../platform/src/db/tenancy.js';
import { catalogVariants } from '../../../catalog/src/db/schema.js';

const money = (name: string) => bigint(name, { mode: 'number' });

export const salesTransactions = pgTable(
  'sales_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantIdColumn(),
    kind: text('kind').notNull(), // sale | purchase | return
    status: text('status').notNull().default('posted'), // draft | posted | void
    totalMinor: money('total_minor').notNull(),
    currency: text('currency').notNull().default('EGP'),
    idempotencyKey: text('idempotency_key').notNull(),
    /** sha256 of the canonical request — same key + different body ⇒ 409. */
    requestHash: text('request_hash').notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    tenantKey('sales_transactions', t.tenantId, t.id),
    unique('sales_transactions_tenant_idem_uq').on(t.tenantId, t.idempotencyKey),
    index('sales_transactions_created_idx').on(t.tenantId, t.createdAt),
    tenantPolicy(),
  ],
).enableRLS();

export const transactionLines = pgTable(
  'transaction_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantIdColumn(),
    transactionId: uuid('transaction_id').notNull(),
    variantId: uuid('variant_id').notNull(),
    /** Snapshots: a receipt must print what was sold, even after renames. */
    nameAr: text('name_ar').notNull(),
    nameEn: text('name_en').notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 3 }).notNull(),
    unitPriceMinor: money('unit_price_minor').notNull(),
    lineTotalMinor: money('line_total_minor').notNull(),
  },
  (t) => [
    foreignKey({ name: 'transaction_lines_txn_fk', columns: [t.tenantId, t.transactionId], foreignColumns: [salesTransactions.tenantId, salesTransactions.id] }),
    foreignKey({ name: 'transaction_lines_variant_fk', columns: [t.tenantId, t.variantId], foreignColumns: [catalogVariants.tenantId, catalogVariants.id] }),
    index('transaction_lines_txn_idx').on(t.tenantId, t.transactionId),
    tenantPolicy(),
  ],
).enableRLS();

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantIdColumn(),
    variantId: uuid('variant_id').notNull(),
    warehouse: text('warehouse').notNull().default('main'),
    direction: text('direction').notNull(), // in | out | adjust
    quantity: numeric('quantity', { precision: 18, scale: 3 }).notNull(),
    costPerUnitMinor: money('cost_per_unit_minor'),
    reason: text('reason'),
    transactionId: uuid('transaction_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ name: 'stock_movements_variant_fk', columns: [t.tenantId, t.variantId], foreignColumns: [catalogVariants.tenantId, catalogVariants.id] }),
    foreignKey({ name: 'stock_movements_txn_fk', columns: [t.tenantId, t.transactionId], foreignColumns: [salesTransactions.tenantId, salesTransactions.id] }),
    index('stock_movements_variant_idx').on(t.tenantId, t.variantId, t.createdAt),
    tenantPolicy(),
  ],
).enableRLS();

/** Cash drawer movements per shift (cash.ts domain). */
export const cashMovements = pgTable(
  'cash_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantIdColumn(),
    shiftId: uuid('shift_id').notNull(),
    direction: text('direction').notNull(), // in | out
    status: text('status').notNull().default('pending'), // pending | posted
    amountMinor: money('amount_minor').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [tenantPolicy()],
).enableRLS();
