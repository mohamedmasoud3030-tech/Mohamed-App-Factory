import { describe, expect, it } from 'vitest';
import { mergeSaleLines, priceSale } from '../src/sale.js';
import { createSaleSchema } from '../src/contracts.js';

const V1 = '00000000-0000-4000-8000-000000000001';
const V2 = '00000000-0000-4000-8000-000000000002';

describe('sale pricing (server-side, per-line rounding)', () => {
  it('prices piece goods in minor units', () => {
    const r = priceSale([
      { variantId: V1, quantity: '3', unitPriceMinor: 750, nameAr: 'مياه', nameEn: 'Water' },
      { variantId: V2, quantity: '1', unitPriceMinor: 8995, nameAr: 'زيت', nameEn: 'Oil' },
    ]);
    expect(r.lines.map((l) => l.lineTotalMinor)).toEqual([2250, 8995]);
    expect(r.totalMinor).toBe(11245);
    expect(r.lines[0]!.quantity).toBe('3.000');
  });

  it('weighed goods: rounds each line half-up BEFORE summing', () => {
    // 0.333 kg × 320.00 = 106.56 ; 0.335 kg × 320.00 = 107.20 ; 0.001 × 7.50 = 0.0075 → 0.01
    const r = priceSale([
      { variantId: V1, quantity: '0.333', unitPriceMinor: 32000, nameAr: 'جبن', nameEn: 'Cheese' },
      { variantId: V2, quantity: '0.001', unitPriceMinor: 750, nameAr: 'مياه', nameEn: 'Water' },
    ]);
    expect(r.lines.map((l) => l.lineTotalMinor)).toEqual([10656, 1]);
    expect(r.totalMinor).toBe(10657);
  });

  it('rejects zero, negative, and over-precise quantities', () => {
    for (const q of ['0', '-1', '1.2345', 'abc']) {
      expect(() => priceSale([{ variantId: V1, quantity: q, unitPriceMinor: 100, nameAr: 'a', nameEn: 'a' }])).toThrow();
    }
  });

  it('merges duplicate variants so stock is decremented once per variant', () => {
    expect(mergeSaleLines([{ variantId: V2, quantity: '1' }, { variantId: V1, quantity: '2' }, { variantId: V2, quantity: '0.5' }])).toEqual([
      { variantId: V1, quantity: '2.000' },
      { variantId: V2, quantity: '1.500' },
    ]);
  });

  it('contract rejects client-supplied prices, totals and tenant ids', () => {
    const base = { idempotencyKey: 'abcdefgh-1', lines: [{ variantId: V1, quantity: '1' }] };
    expect(createSaleSchema.safeParse(base).success).toBe(true);
    expect(createSaleSchema.safeParse({ ...base, tenantId: V2 }).success).toBe(false);
    expect(createSaleSchema.safeParse({ ...base, totalMinor: 1 }).success).toBe(false);
    expect(createSaleSchema.safeParse({ ...base, lines: [{ variantId: V1, quantity: '1', unitPriceMinor: 1 }] }).success).toBe(false);
  });
});
