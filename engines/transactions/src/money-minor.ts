/**
 * NILE ENGINE EXTRACTION
 * Extracted verbatim from Terranex src/shared/money/index.ts — CANONICAL storage/API money format: integer minor units (bigint-safe strings).
 * Source: github.com/mohamedmasoud3030-tech — extracted 2026-10-13, original repo untouched.
 */
// Canonical exact money implementation — shared by every financial feature.
//
// Money stays exact end-to-end: user-facing form input is parsed as decimal
// text into integer minor units, PostgreSQL stores bigint, and read views
// expose bigint values as text so PostgREST/JavaScript can never round large
// integers in transit. No JavaScript floating-point financial arithmetic is
// performed anywhere in the application.
//
// GF-003 (S1 Terms & Funding) created this implementation under
// `src/features/funding/money.ts`; GF-004 (S2 Cost & Cash) is its second real
// consumer, so the implementation now lives here under `src/shared/money`
// per the extraction rule (ADR-0002). Funding imports re-point here; behavior
// is unchanged.

export const MONEY_CURRENCIES: Record<string, number> = {
  EGP: 2,
  USD: 2,
  EUR: 2,
  SAR: 2,
  AED: 2,
  // ISO 4217 three-decimal currencies — an unknown currency must never be
  // silently treated as two decimals when its real minor unit is three.
  BHD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
  IQD: 3,
};

export const INT64_MAX = 9_223_372_036_854_775_807n;

const ARABIC_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

/** Currency minor-unit exponent (decimal places). Unsupported currencies fail
 * closed so financial values can never be silently scaled with a guessed
 * exponent. */
export function currencyDecimals(currency: string): number {
  const normalized = currency.trim().toUpperCase();
  const decimals = MONEY_CURRENCIES[normalized];
  if (decimals === undefined) throw new Error(`unsupported currency: ${normalized || '(empty)'}`);
  return decimals;
}

function normalizeMoneyInput(value: string): string {
  return value
    .trim()
    .replace(/[٠-٩]/g, (digit) => ARABIC_DIGITS[digit] ?? digit)
    .replace(/٫/g, '.')
    .replace(/[٬,\s]/g, '');
}

/** Parses non-negative user-facing decimal text into integer minor units as
 * text (exact bigint transport). Throws on invalid text, zero, negative, or
 * values beyond the PostgreSQL int8 range. */
export function parseMajorUnitsToMinor(value: string, currency: string): string {
  const decimals = currencyDecimals(currency);
  const normalized = normalizeMoneyInput(value);
  const pattern = decimals === 0
    ? /^(\d+)$/
    : new RegExp(`^(\\d+)(?:\\.(\\d{1,${decimals}}))?$`);
  const match = normalized.match(pattern);
  if (!match) throw new Error('invalid money amount');

  const whole = BigInt(match[1] ?? '0');
  const fraction = decimals === 0
    ? 0n
    : BigInt((match[2] ?? '').padEnd(decimals, '0'));
  const scale = 10n ** BigInt(decimals);
  const minor = whole * scale + fraction;
  if (minor <= 0n || minor > INT64_MAX) throw new Error('money amount out of range');
  return minor.toString();
}

/** Parses signed user-facing decimal text (e.g. bank-statement amounts, where
 * a negative value means money left the account) into integer minor units as
 * text. Zero parses, so callers decide whether zero is meaningful. */
export function parseSignedMajorUnitsToMinor(value: string, currency: string): string {
  const decimals = currencyDecimals(currency);
  const normalized = normalizeMoneyInput(value);
  const sign = normalized.startsWith('-') ? -1n : 1n;
  const unsigned = normalized.replace(/^[+-]/, '');
  const pattern = decimals === 0
    ? /^(\d+)$/
    : new RegExp(`^(\\d+)(?:\\.(\\d{1,${decimals}}))?$`);
  const match = unsigned.match(pattern);
  if (!match) throw new Error('invalid money amount');

  const whole = BigInt(match[1] ?? '0');
  const fraction = decimals === 0
    ? 0n
    : BigInt((match[2] ?? '').padEnd(decimals, '0'));
  const scale = 10n ** BigInt(decimals);
  const minor = sign * (whole * scale + fraction);
  // Signed values may use the full PostgreSQL bigint range, including INT64_MIN.
  if (minor < -INT64_MAX - 1n || minor > INT64_MAX) throw new Error('money amount out of range');
  return minor.toString();
}

export function isValidMajorMoney(value: string, currency = 'EGP'): boolean {
  try {
    parseMajorUnitsToMinor(value, currency);
    return true;
  } catch {
    return false;
  }
}

export function isValidSignedMoney(value: string, currency = 'EGP'): boolean {
  try {
    parseSignedMajorUnitsToMinor(value, currency);
    return true;
  } catch {
    return false;
  }
}

function parseExactInteger(value: string | number | bigint): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return Number.isSafeInteger(value) ? BigInt(value) : null;
  if (!/^-?\d+$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

/** Formats integer minor units as user-facing Arabic/RTL currency text.
 * Accepts text (exact), bigint, or safe integers only; values that cannot be
 * represented exactly render as an em dash instead of rounding. */
export function formatMinorUnits(minorUnits: string | number | bigint, currency: string): string {
  const amount = parseExactInteger(minorUnits);
  if (amount === null) return '—';

  const decimals = currencyDecimals(currency);
  const scale = 10n ** BigInt(decimals);
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const whole = absolute / scale;
  const fraction = absolute % scale;
  const integerFormatter = new Intl.NumberFormat('ar-EG', {
    useGrouping: true,
    maximumFractionDigits: 0,
  });
  const wholeText = integerFormatter.format(whole);
  const decimalSeparator = new Intl.NumberFormat('ar-EG')
    .formatToParts(1.1)
    .find((part) => part.type === 'decimal')?.value ?? '.';
  const fractionText = decimals === 0
    ? ''
    : new Intl.NumberFormat('ar-EG', {
        useGrouping: false,
        minimumIntegerDigits: decimals,
        maximumFractionDigits: 0,
      }).format(Number(fraction));
  const currencyText = new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).formatToParts(0).find((part) => part.type === 'currency')?.value ?? currency;

  return `${negative ? '−' : ''}${wholeText}${decimals ? `${decimalSeparator}${fractionText}` : ''} ${currencyText}`;
}
