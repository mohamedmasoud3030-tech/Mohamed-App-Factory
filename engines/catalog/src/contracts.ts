/** REST/OpenAPI request contracts (ADR-0006) — validated at the API edge. */
import { z } from 'zod';

export const createCatalogItemSchema = z.object({
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  category: z.string().min(1),
  priceMinor: z.number().int().min(0),
  compareAtMinor: z.number().int().min(0).optional(),
  variants: z.array(
    z.object({
      sku: z.string().min(1),
      labelAr: z.string().min(1),
      labelEn: z.string().min(1),
      stock: z.number().int().min(0),
    }),
  ),
});
export type CreateCatalogItemInput = z.infer<typeof createCatalogItemSchema>;

/** Public-site lead submission (no auth — rate-limited at the edge). */
export const createLeadSchema = z.object({
  source: z.enum(['courts', 'restaurant', 'clinic', 'realestate', 'gym', 'mobile', 'fashion']),
  customerName: z.string().min(2),
  customerPhone: z.string().min(8),
  message: z.string().max(1000).optional(),
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
