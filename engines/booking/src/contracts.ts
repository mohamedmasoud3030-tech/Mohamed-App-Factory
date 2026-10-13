/** REST/OpenAPI request contracts (ADR-0006) — validated at the API edge. */
import { z } from 'zod';

export const createBookingSchema = z.object({
  resourceId: z.string().uuid(),
  customerName: z.string().min(2),
  customerPhone: z.string().min(8),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  depositMinor: z.number().int().min(0).default(0),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const bookingActionSchema = z.object({
  action: z.enum(['confirm', 'arrive', 'start', 'complete', 'cancel', 'noShow']),
});
