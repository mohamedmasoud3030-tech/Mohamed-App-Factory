/**
 * Piece/measured-goods sale pricing (pure, server-side only).
 * Same financial rules as the extracted kayyal core (FINANCIAL_RULES §1.3):
 * Decimal arithmetic, round PER LINE (half-up, money scale), then sum the
 * rounded line totals. Storage/API values are integer minor units; the
 * conversion goes through money-bridge.ts only. Client-supplied prices or
 * totals are never accepted — unit prices come from the catalog.
 */
import { Decimal, gt, roundMoney } from './decimal.js';
import { decimalToMinorUnits, minorUnitsToDecimal } from './money-bridge.js';
import { DomainError } from './line.js';

export interface SaleLineRequest {
  variantId: string;
  quantity: string; // decimal string, up to 3 dp ("2", "0.750")
}

export interface PricedLineInput extends SaleLineRequest {
  unitPriceMinor: number;
  nameAr: string;
  nameEn: string;
}

export interface PricedLine extends PricedLineInput {
  quantity: string; // normalized "2.000"
  lineTotalMinor: number;
}

export interface PricedSale {
  lines: PricedLine[];
  totalMinor: number;
  currency: string;
}

const QTY_SCALE = 3;

function parseQuantity(q: string): Decimal {
  let d: Decimal;
  try {
    d = new Decimal(q);
  } catch {
    throw new DomainError('invalid_quantity', 'كمية غير صالحة');
  }
  if (!d.isFinite() || !gt(d, new Decimal(0)) || d.decimalPlaces() > QTY_SCALE) {
    throw new DomainError('invalid_quantity', 'كمية غير صالحة', { quantity: q });
  }
  return d;
}

/** Duplicate variants in one cart are merged (one stock decrement per variant). */
export function mergeSaleLines(lines: readonly SaleLineRequest[]): SaleLineRequest[] {
  const acc = new Map<string, Decimal>();
  for (const l of lines) acc.set(l.variantId, (acc.get(l.variantId) ?? new Decimal(0)).plus(parseQuantity(l.quantity)));
  return [...acc.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([variantId, q]) => ({ variantId, quantity: q.toFixed(QTY_SCALE) }));
}

function toSafeNumber(minor: bigint): number {
  const n = Number(minor);
  if (!Number.isSafeInteger(n)) throw new DomainError('amount_out_of_range', 'المبلغ خارج النطاق المسموح');
  return n;
}

export function priceSale(lines: readonly PricedLineInput[], currency = 'EGP'): PricedSale {
  if (lines.length === 0) throw new DomainError('empty_sale', 'لا توجد أصناف في الفاتورة');
  let total = 0n;
  const priced = lines.map((l) => {
    if (!Number.isSafeInteger(l.unitPriceMinor) || l.unitPriceMinor < 0) {
      throw new DomainError('invalid_price', 'سعر غير صالح');
    }
    const qty = parseQuantity(l.quantity);
    const lineTotal = roundMoney(qty.times(minorUnitsToDecimal(l.unitPriceMinor, currency)));
    const lineMinor = decimalToMinorUnits(lineTotal, currency);
    total += lineMinor;
    return { ...l, quantity: qty.toFixed(QTY_SCALE), lineTotalMinor: toSafeNumber(lineMinor) };
  });
  return { lines: priced, totalMinor: toSafeNumber(total), currency };
}
