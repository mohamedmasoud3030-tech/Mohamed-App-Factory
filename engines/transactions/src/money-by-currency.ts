/**
 * NILE ENGINE EXTRACTION
 * Extracted from Terranex src/shared/money/by-currency.ts — per-currency rollup (only sanctioned cross-currency aggregation). Import path adapted to ./money-minor.js.
 * Source: github.com/mohamedmasoud3030-tech — extracted 2026-10-13, original repo untouched.
 */
// Currency-safe roll-up of money rows.
//
// There is no FX contract anywhere in Terranex. `docs/OPEN_BUSINESS_DECISIONS.md`
// leaves the rate/consolidation policy open (BD-005), and the only consolidated
// figure the product is allowed to state is the one the database already
// qualifies with `fx_status === 'CONSOLIDATED_AT_RATE'`.
//
// Therefore a single number that adds amounts in two currencies is not a
// rounded answer — it is a fabricated one. The historical defect was exactly
// this shape: a page summed `project_cash_position_read.balance_minor_units`
// across accounts and printed the result with `investment_projects
// .reporting_currency`, so 100,000,000.00 EGP + 5,000,000.000 OMR surfaced as
// `105,000,000`. The currencies differed in scale as well as identity, so even
// the digit string was wrong.
//
// This module is the one place a page is allowed to total money rows. It is
// built so that the unsafe operation is *unavailable*, not merely discouraged:
//
//   * it cannot return a scalar. The return type is a list keyed by currency,
//     so "what is the total?" has no expressible answer until the caller names
//     a currency — and naming one is the decision that requires BD-005.
//   * adding two rollups is only possible through `addSameCurrency`, which
//     rejects a currency mismatch instead of coercing it.
//   * a row whose currency is missing or malformed becomes its own bucket and
//     is never folded into a real currency's total.
//   * a row whose amount is not exact integer text makes the whole call fail
//     closed and is disclosed through `unparseableRowCount`, rather than
//     silently contributing zero.
//
// The per-domain contracts (`features/result/project-result.ts`,
// `features/funding/project-capital.ts`) stay authoritative for their own
// semantics. This module only covers the case they do not: a page that holds
// ordinary rows and needs a per-currency total of one column.

import { MONEY_CURRENCIES, formatMinorUnits } from './money-minor.js';

/** A currency code the money module can render with the correct number of decimals. */
export function isRenderableCurrency(currency: string): boolean {
  return Object.prototype.hasOwnProperty.call(MONEY_CURRENCIES, currency);
}

/**
 * One currency's total. `minorUnits` is exact — never a float, never rounded.
 * `currency` is the raw grouping key, so an unrenderable or empty code is still
 * visible rather than being replaced by a plausible one.
 */
export type CurrencyRollup = {
  readonly currency: string;
  readonly minorUnits: bigint;
  readonly rowCount: number;
  /** False when the currency code is missing, malformed, or not renderable. */
  readonly presentable: boolean;
};

export type CurrencyRollupResult = {
  /** Ordered by currency code, so the panel does not depend on row order. */
  readonly totals: readonly CurrencyRollup[];
  /** Rows rejected for a non-integer amount. Never non-zero in a healthy deployment. */
  readonly unparseableRowCount: number;
  /** True when the rows span more than one currency and no single total exists. */
  readonly isMultiCurrency: boolean;
};

const EXACT_INTEGER = /^-?\d+$/;

function assertExactIntegerText(amount: string | bigint, context: string): bigint {
  if (typeof amount === 'bigint') return amount;
  if (!EXACT_INTEGER.test(amount)) {
    throw new Error(`${context}: money must be exact integer text, received ${JSON.stringify(amount)}`);
  }
  return BigInt(amount);
}

/**
 * Total one money column, partitioned by currency.
 *
 * `currencyOf` and `amountOf` are accessors rather than fixed column names so
 * that every read model can use this without being reshaped first.
 */
export function totalsByCurrency<T>(
  rows: readonly T[],
  currencyOf: (row: T) => string | null | undefined,
  amountOf: (row: T) => string | bigint | null | undefined,
): CurrencyRollupResult {
  const byCurrency = new Map<string, { minorUnits: bigint; rowCount: number }>();
  let unparseableRowCount = 0;

  for (const row of rows) {
    // A missing currency is its own bucket, not a licence to use another one.
    const currency = currencyOf(row) ?? '';
    const rawAmount = amountOf(row);

    let minorUnits: bigint;
    if (rawAmount === null || rawAmount === undefined) {
      // "No amount recorded" contributes nothing but is still a row of this
      // currency; dropping it would make the row count disagree with the total.
      minorUnits = 0n;
    } else {
      try {
        minorUnits = assertExactIntegerText(rawAmount, 'totalsByCurrency');
      } catch {
        unparseableRowCount += 1;
        continue;
      }
    }

    const bucket = byCurrency.get(currency) ?? { minorUnits: 0n, rowCount: 0 };
    bucket.minorUnits += minorUnits;
    bucket.rowCount += 1;
    byCurrency.set(currency, bucket);
  }

  const totals: CurrencyRollup[] = [...byCurrency.entries()]
    .map(([currency, bucket]) => ({
      currency,
      minorUnits: bucket.minorUnits,
      rowCount: bucket.rowCount,
      presentable: isRenderableCurrency(currency),
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  return {
    totals,
    unparseableRowCount,
    isMultiCurrency: totals.length > 1,
  };
}

/**
 * Add two rollups of the *same* currency.
 *
 * This exists so that the failure case has somewhere to live: the alternative
 * is a caller writing `a.minorUnits + b.minorUnits` directly, which is the
 * operation this module removes. A mismatch is refused rather than coerced,
 * because there is no rate at which to coerce it.
 */
export function addSameCurrency(a: CurrencyRollup, b: CurrencyRollup): CurrencyRollup {
  if (a.currency !== b.currency) {
    throw new Error(
      `refusing to add ${a.currency} to ${b.currency}: no FX contract is available to convert between them`,
    );
  }
  const currency = a.currency;
  return {
    currency,
    minorUnits: a.minorUnits + b.minorUnits,
    rowCount: a.rowCount + b.rowCount,
    presentable: a.presentable && b.presentable,
  };
}

/**
 * A rollup is only displayable together with its currency, exactly like
 * `presentCapitalAmount`. There is deliberately no function that returns a
 * bare amount string.
 */
export function presentRollup(rollup: CurrencyRollup): string {
  if (!rollup.presentable) return '—';
  return formatMinorUnits(rollup.minorUnits, rollup.currency);
}
