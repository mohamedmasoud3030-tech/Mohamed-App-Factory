/** REST/OpenAPI request contracts (ADR-0006) — validated at the API edge. */
import { z } from 'zod';

export const createSaleSchema = z.object({
  kind: z.enum(['sale', 'purchase', 'return']),
  idempotencyKey: z.string().min(8),
  lines: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        quantity: z.string().regex(/^\d+(\.\d{1,3})?$/, 'quantity as decimal string'),
        unitPriceMinor: z.number().int().min(0),
      }),
    )
    .min(1),
});
export type CreateSaleInput = z.infer<typeof createSaleSchema>;

export const stockMovementSchema = z.object({
  itemId: z.string().uuid(),
  direction: z.enum(['in', 'out', 'adjust']),
  quantity: z.string().regex(/^\d+(\.\d{1,3})?$/),
  warehouse: z.string().default('main'),
  reason: z.string().optional(),
});
