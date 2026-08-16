import { CogentaError } from '@cogenta/core'

/**
 * Money, in the smallest unit of its currency, as an integer. Always.
 *
 * The three mandatory dialects (ADR-0006) do not agree on decimals: Postgres
 * has exact `numeric`, MySQL has `decimal`, and SQLite has only `REAL` — a
 * binary float where `0.1 + 0.2` is not `0.3`. A column that means something
 * different on one of the three supported databases is a bug waiting for its
 * first lost cent, so there is no decimal column anywhere in this package.
 *
 * One integer of minor units means the same thing everywhere, and
 * `Number.MAX_SAFE_INTEGER` holds ninety thousand billion cents — no shop this
 * CMS serves comes near it.
 */
export interface Money {
  /** Cents, pence, øre… Never a major unit, never a float. */
  readonly amountMinor: number
  /** ISO 4217, upper case. */
  readonly currency: string
}

/**
 * Currencies whose minor unit is not a hundredth.
 *
 * Only needed for display and for the amount handed to a payment gateway;
 * arithmetic never looks at it. Deliberately short — this is the list of
 * exceptions, not a currency database, and an unlisted currency gets the
 * two-digit default that fits the overwhelming majority.
 */
const EXPONENTS: ReadonlyMap<string, number> = new Map([
  ['JPY', 0],
  ['KRW', 0],
  ['VND', 0],
  ['CLP', 0],
  ['ISK', 0],
  ['XAF', 0],
  ['XOF', 0],
  ['XPF', 0],
  ['BHD', 3],
  ['IQD', 3],
  ['JOD', 3],
  ['KWD', 3],
  ['OMR', 3],
  ['TND', 3],
])

export function minorUnitExponent(currency: string): number {
  return EXPONENTS.get(normaliseCurrency(currency)) ?? 2
}

export function normaliseCurrency(currency: string): string {
  return currency.trim().toUpperCase()
}

export function assertCurrency(currency: string): string {
  const code = normaliseCurrency(currency)
  if (!/^[A-Z]{3}$/u.test(code)) {
    throw new CogentaError({
      code: 'COMMERCE_CURRENCY_INVALID',
      message: `"${currency}" is not a currency code.`,
      hint: 'Use a three-letter ISO 4217 code, such as EUR, USD or JPY.',
    })
  }
  return code
}

/**
 * Refuses anything that is not a whole, finite, non-negative number of minor
 * units — including the float that arrives when someone multiplies a price by
 * a tax rate and forgets to round.
 */
export function assertMinor(amount: number, what: string): number {
  if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
    throw new CogentaError({
      code: 'COMMERCE_AMOUNT_INVALID',
      message: `${what} must be a whole number of minor units, got ${String(amount)}.`,
      hint: 'Money is stored in cents (or the smallest unit of the currency), never as a decimal.',
    })
  }
  if (amount < 0) {
    throw new CogentaError({
      code: 'COMMERCE_AMOUNT_INVALID',
      message: `${what} cannot be negative (${String(amount)}).`,
      hint: 'A refund is a separate record with its own sign, not a negative amount on the original one.',
    })
  }
  if (amount > Number.MAX_SAFE_INTEGER) {
    throw new CogentaError({
      code: 'COMMERCE_AMOUNT_INVALID',
      message: `${what} is larger than integer arithmetic can carry exactly.`,
      hint: 'Check the amount: this is almost always a unit mistake (a major unit passed as a minor one).',
    })
  }
  return amount
}

/** Two amounts of the same currency, or a refusal. Never a silent conversion. */
export function assertSameCurrency(left: string, right: string): string {
  const a = normaliseCurrency(left)
  const b = normaliseCurrency(right)
  if (a !== b) {
    throw new CogentaError({
      code: 'COMMERCE_CURRENCY_MISMATCH',
      message: `Cannot combine ${a} with ${b}.`,
      hint: 'A cart, an order and every line in it are in one currency. There is no exchange rate in this package.',
    })
  }
  return a
}

/**
 * A percentage of an amount, in basis points, rounded half up.
 *
 * Basis points rather than a float rate: `0.2` is not representable in binary,
 * so a 20 % VAT expressed as a float already carries an error before the
 * multiplication. `2000` basis points does not.
 *
 * Half-up rather than banker's rounding: it is what every invoice a European
 * tax authority has ever accepted does, and matching the paper is worth more
 * here than a marginally better statistical distribution.
 */
export function applyBasisPoints(amountMinor: number, basisPoints: number): number {
  assertMinor(amountMinor, 'amount')
  if (!Number.isInteger(basisPoints) || basisPoints < 0) {
    throw new CogentaError({
      code: 'COMMERCE_AMOUNT_INVALID',
      message: `A rate must be a whole number of basis points, got ${String(basisPoints)}.`,
      hint: '20 % is 2000 basis points. 5.5 % is 550.',
    })
  }
  return Math.floor((amountMinor * basisPoints + 5000) / 10_000)
}

/**
 * Splits an amount over n shares so the parts add up to exactly the whole.
 *
 * Used when a cart-level discount has to be attributed to lines (an invoice
 * must show per-line tax, and tax is computed after discount). Dividing and
 * rounding each share independently loses or invents up to n-1 minor units;
 * the remainder is therefore handed out one unit at a time to the largest
 * weights first, which is both fair and exact.
 */
export function distribute(amountMinor: number, weights: readonly number[]): number[] {
  assertMinor(amountMinor, 'amount')
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (weights.length === 0 || total <= 0) return weights.map(() => 0)

  const shares = weights.map((weight) => Math.floor((amountMinor * weight) / total))
  let remainder = amountMinor - shares.reduce((sum, share) => sum + share, 0)

  const order = weights
    .map((weight, index) => ({ weight, index }))
    .sort((left, right) => right.weight - left.weight || left.index - right.index)

  for (const { index } of order) {
    if (remainder <= 0) break
    shares[index] = (shares[index] ?? 0) + 1
    remainder -= 1
  }

  return shares
}

/** For an invoice line or an admin screen. Never for arithmetic. */
export function formatMoney(money: Money, locale = 'en-US'): string {
  const currency = assertCurrency(money.currency)
  const exponent = minorUnitExponent(currency)
  const major = money.amountMinor / 10 ** exponent
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(major)
}
