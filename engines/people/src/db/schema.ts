/**
 * People (HR) DB schema (Drizzle, ADR-0004). Money = bigint minor units.
 */
import { bigint, boolean, foreignKey, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { tenantIdColumn, tenantKey, tenantPolicy } from '../../../platform/src/db/tenancy.js';

const money = (name: string) => bigint(name, { mode: 'number' });

export const employees = pgTable(
  'employees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantIdColumn(),
    name: text('name').notNull(),
    role: text('role').notNull(),
    phone: text('phone'),
    baseSalaryMinor: money('base_salary_minor').notNull(),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [tenantKey('employees', t.tenantId, t.id), tenantPolicy()],
).enableRLS();

const employeeFk = (name: string, t: { tenantId: any; employeeId: any }) =>
  foreignKey({ name, columns: [t.tenantId, t.employeeId], foreignColumns: [employees.tenantId, employees.id] });

export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantIdColumn(),
    employeeId: uuid('employee_id').notNull(),
    day: text('day').notNull(), // YYYY-MM-DD (Africa/Cairo)
    checkIn: text('check_in'),
    checkOut: text('check_out'),
    status: text('status').notNull().default('PRESENT'),
  },
  (t) => [unique('attendance_tenant_emp_day_uq').on(t.tenantId, t.employeeId, t.day), employeeFk('attendance_employee_fk', t), tenantPolicy()],
).enableRLS();

export const leaveRequests = pgTable(
  'leave_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantIdColumn(),
    employeeId: uuid('employee_id').notNull(),
    days: integer('days').notNull(),
    status: text('status').notNull().default('PENDING'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [employeeFk('leave_employee_fk', t), tenantPolicy()],
).enableRLS();

/** Salary advances paid back in monthly installments (payroll.ts). */
export const loans = pgTable(
  'loans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantIdColumn(),
    employeeId: uuid('employee_id').notNull(),
    totalMinor: money('total_minor').notNull(),
    months: integer('months').notNull(),
    remainingMinor: money('remaining_minor').notNull(),
  },
  (t) => [employeeFk('loans_employee_fk', t), tenantPolicy()],
).enableRLS();
