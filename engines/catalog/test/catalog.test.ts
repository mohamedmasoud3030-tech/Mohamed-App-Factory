import { describe, expect, it } from 'vitest';
import { canMoveLead, discountPercent, monthlyInstallment, validateCatalogItem, variantStockState, type CatalogItem } from '../src/catalog.js';

const item: CatalogItem = {
  id: 'p1', tenantId: 't1', nameAr: 'فستان', nameEn: 'Dress', category: 'women',
  priceMinor: 80000, compareAtMinor: 100000,
  variants: [{ sku: 'D-M', labelAr: 'وسط', labelEn: 'M', stock: 1 }, { sku: 'D-L', labelAr: 'كبير', labelEn: 'L', stock: 0 }],
  isActive: true,
};

describe('catalog', () => {
  it('computes discount and variant stock states (out struck-through, low = last piece)', () => {
    expect(discountPercent(item)).toBe(20);
    expect(variantStockState(item.variants[0]!)).toBe('low');
    expect(variantStockState(item.variants[1]!)).toBe('out');
  });
  it('validates items with Arabic messages (starting contract)', () => {
    expect(validateCatalogItem({ name: '', costPrice: 1, sellingPrice: 2 }).name).toBe('الاسم مطلوب');
    expect(validateCatalogItem({ name: 'x', costPrice: -1, sellingPrice: 2 }).costPrice).toContain('سالبة');
    expect(validateCatalogItem({ name: 'x', costPrice: 1, sellingPrice: 2 })).toEqual({});
  });
  it('computes installments for storefront calculators', () => {
    expect(monthlyInstallment({ priceMinor: 120000, months: 12 })).toBe(10000);
    expect(monthlyInstallment({ priceMinor: 120000, downPaymentMinor: 20000, months: 10 })).toBe(10000);
    expect(monthlyInstallment({ priceMinor: 100000, months: 12, annualRate: 0.24 })).toBeGreaterThan(Math.ceil(100000 / 12));
  });
  it('enforces the lead pipeline flow', () => {
    expect(canMoveLead('NEW', 'CONTACTED')).toBe(true);
    expect(canMoveLead('NEW', 'WON')).toBe(false);
    expect(canMoveLead('QUALIFIED', 'WON')).toBe(true);
    expect(canMoveLead('WON', 'CONTACTED')).toBe(false);
  });
});
