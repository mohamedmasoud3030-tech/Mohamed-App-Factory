/**
 * Bridge between the two extracted money representations — ONE canonical rule:
 *  - Storage / API / DB: integer minor units (Terranex money-minor, bigint-safe).
 *  - In-domain arithmetic (quantities × prices, costing): Decimal (kayyal decimal.ts).
 * Conversion happens ONLY here, rounding half-up at the currency scale.
 */
import { Decimal, type EGP } from './decimal.js';
import { currencyDecimals } from './money-minor.js';

export function decimalToMinorUnits(amount: Decimal, currency = 'EGP'): bigint {
  const scale = currencyDecimals(currency);
  const factor = new Decimal(10).pow(scale);
  return BigInt(amount.mul(factor).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toString());
}

export function minorUnitsToDecimal(minor: bigint | string | number, currency = 'EGP'): Decimal {
  const scale = currencyDecimals(currency);
  return new Decimal(minor.toString()).div(new Decimal(10).pow(scale));
}

export function egpToMinorUnits(amount: EGP): bigint {
  return decimalToMinorUnits(amount as Decimal, 'EGP');
}
