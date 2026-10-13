/** REST/OpenAPI request contracts (ADR-0006) — validated at the API edge. */
import { z } from 'zod';

export const createEmployeeSchema = z.object({
  name: z.string().min(2),
  role: z.string().min(1),
  phone: z.string().optional(),
  baseSalaryMinor: z.number().int().min(0),
});
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const attendanceSchema = z.object({
  employeeId: z.string().uuid(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'LEAVE', 'HOLIDAY']).default('PRESENT'),
});

export const leaveRequestSchema = z.object({
  employeeId: z.string().uuid(),
  days: z.number().int().positive(),
});
