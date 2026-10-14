/**
 * REST request contracts (ADR-0006) — validated at the API edge and exported
 * to OpenAPI via z.toJSONSchema. Objects are STRICT: unknown keys (e.g. a
 * client-supplied tenantId, price or total) are rejected, not ignored.
 */
import { z } from 'zod';

const quantity = z.string().regex(/^\d{1,12}(\.\d{1,3})?$/, 'quantity as decimal string (≤3 dp)');

export const createSaleSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    lines: z
      .array(z.object({ variantId: z.string().uuid(), quantity }).strict())
      .min(1)
      .max(200),
  })
  .strict();
export type CreateSaleInput = z.infer<typeof createSaleSchema>;

export const stockMovementSchema = z
  .object({
    variantId: z.string().uuid(),
    direction: z.enum(['in', 'out', 'adjust']),
    quantity,
    warehouse: z.string().default('main'),
    reason: z.string().max(500).optional(),
  })
  .strict();
