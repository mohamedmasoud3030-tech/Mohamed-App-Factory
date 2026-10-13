/**
 * Nile Catalog Engine — products/listings + public-site lead pipeline (pure).
 *
 * Patterns generalized from:
 *  - starting `features/catalog/catalogForm.ts` (item validation with Arabic
 *    messages — validateCatalogItem below keeps that contract, money moved
 *    to integer minor units).
 *  - The competitor benchmark in the Nile brief: variant stock states
 *    (sold-out struck through, "last piece"), discount countdown offers,
 *    installment calculators, and a single lead pipeline fed by every
 *    public site into the admin panel.
 */

export interface CatalogVariant {
  sku: string;
  labelAr: string;
  labelEn: string;
  stock: number;
}

export interface CatalogItem {
  id: string;
  tenantId: string;
  nameAr: string;
  nameEn: string;
  category: string;
  /** integer minor units */
  priceMinor: number;
  compareAtMinor?: number;
  variants: CatalogVariant[];
  isActive: boolean;
}

export type VariantStockState = 'in' | 'low' | 'out';

export function variantStockState(v: CatalogVariant, lowThreshold = 1): VariantStockState {
  if (v.stock <= 0) return 'out';
  if (v.stock <= lowThreshold) return 'low'; // "last piece" in storefront UX
  return 'in';
}

export function itemStock(item: CatalogItem): number {
  return item.variants.reduce((s, v) => s + Math.max(0, v.stock), 0);
}

/** Whole-percent discount of price vs compare-at (0 when none). */
export function discountPercent(item: CatalogItem): number {
  if (!item.compareAtMinor || item.compareAtMinor <= item.priceMinor) return 0;
  return Math.round((1 - item.priceMinor / item.compareAtMinor) * 100);
}

export type CatalogFormErrors = Partial<Record<'name' | 'costPrice' | 'sellingPrice', string>>;

/** Adapted from starting/catalogForm (Arabic operator-facing messages). */
export function validateCatalogItem(values: { name: string; costPrice: number; sellingPrice: number }): CatalogFormErrors {
  const errors: CatalogFormErrors = {};
  if (!values.name.trim()) errors.name = 'الاسم مطلوب';
  if (Number.isNaN(values.costPrice)) errors.costPrice = 'أدخل تكلفة صحيحة';
  else if (values.costPrice < 0) errors.costPrice = 'التكلفة لا يمكن أن تكون سالبة';
  if (Number.isNaN(values.sellingPrice)) errors.sellingPrice = 'أدخل سعر بيع صحيح';
  else if (values.sellingPrice < 0) errors.sellingPrice = 'سعر البيع لا يمكن أن يكون سالباً';
  return errors;
}

/** Equal monthly installment for the storefront calculators (mobile/real-estate/gym sites). */
export function monthlyInstallment(opts: {
  priceMinor: number;
  downPaymentMinor?: number;
  months: number;
  /** annual rate, e.g. 0.24 — 0 means interest-free split */
  annualRate?: number;
}): number {
  const principal = opts.priceMinor - (opts.downPaymentMinor ?? 0);
  if (principal <= 0 || opts.months <= 0) return 0;
  const rate = opts.annualRate ?? 0;
  if (rate === 0) return Math.ceil(principal / opts.months);
  const r = rate / 12;
  const pmt = (principal * r) / (1 - Math.pow(1 + r, -opts.months));
  return Math.ceil(pmt);
}

/* ---------------- Lead pipeline (all public sites → one admin inbox) ---------------- */

export type LeadSource = 'courts' | 'restaurant' | 'clinic' | 'realestate' | 'gym' | 'mobile' | 'fashion';
export type LeadStage = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'WON' | 'LOST';

export interface Lead {
  id: string;
  tenantId: string;
  source: LeadSource;
  customerName: string;
  customerPhone: string;
  message?: string;
  stage: LeadStage;
  createdAt: string;
}

const LEAD_FLOW: Record<LeadStage, LeadStage[]> = {
  NEW: ['CONTACTED', 'LOST'],
  CONTACTED: ['QUALIFIED', 'LOST'],
  QUALIFIED: ['WON', 'LOST'],
  WON: [],
  LOST: [],
};

export function canMoveLead(from: LeadStage, to: LeadStage): boolean {
  return LEAD_FLOW[from].includes(to);
}
