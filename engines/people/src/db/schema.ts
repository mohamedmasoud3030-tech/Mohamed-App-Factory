/**
 * People (HR) DB schema (Drizzle, ADR-0004). Money = integer minor units.
 * SQL mirror: engines/db/migrations/0001_nile_engines.sql
 */
import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizations } from '../../../platform/src/db/schema.js';

export const employees = pgTable('employees', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  role: text('role').notNull(),
  phone: text('phone'),
  baseSalaryMinor: integer('base_salary_minor').notNull(),
  isActive: text('is_active').notNull().default('true'),
});

export const attendanceRecords = pgTable('attendance_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => organizations.id),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  day: text('day').notNull(), // YYYY-MM-DD
  checkIn: text('check_in'),
  checkOut: text('check_out'),
  status: text('status').notNull().default('PRESENT'),
});

export const leaveRequests = pgTable('leave_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => organizations.id),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  days: integer('days').notNull(),
  status: text('status').notNull().default('PENDING'), // PENDING|APPROVED|REJECTED
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Salary advances paid back in monthly installments (payroll.ts loanSchedule). */
export const loans = pgTable('loans', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => organizations.id),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  totalMinor: integer('total_minor').notNull(),
  months: integer('months').notNull(),
  remainingMinor: integer('remaining_minor').notNull(),
});
