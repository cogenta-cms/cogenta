import type { Coupon } from '../coupon/store.js'
import { discountFor } from '../coupon/store.js'
import { assertSameCurrency, distribute } from '../money.js'
import type { TaxRule } from '../tax/store.js'
import { taxFor } from '../tax/store.js'

/**
 * The one place an order total is computed.
 *
 * Deliberately a pure function over plain values, with no database handle and
 * no store: the totals a cart shows and the totals an order is placed with
 * must be produced by the same code, or the number on the confirmation page
 * and the number charged to the card drift apart. Everything that varies —
 * prices, rules, coupon — is passed in.
 *
 * The order of operations is the part worth being explicit about, because
 * every ordering is defensible and only one is conventional:
 *
 *   1. line subtotal = unit price × quantity
 *   2. the order discount is spread across lines in proportion to subtotal
 *   3. tax is computed **per line, after discount** — a discount reduces the
 *      tax owed, and a per-line rate is needed because two lines can sit in
 *      different tax categories
 *   4. shipping is added, and taxed under its own category
 *   5. total = subtotal − discount + shipping + tax added (tax *included* is
 *      already inside the subtotal and is never added again)
 *
 * Step 3 after step 2 is what an invoice has to show. Taxing before the
 * discount overstates the tax and is, in most of Europe, simply wrong.
 */

export interface TotalsLineInput {
  readonly variantId: string
  readonly sku: string
  readonly title: string
  readonly quantity: number
  readonly unitPriceMinor: number
  readonly taxCategory: string
  readonly weightGrams: number
}

export interface TotalsLine {
  readonly variantId: string
  readonly sku: string
  readonly title: string
  readonly quantity: number
  readonly unitPriceMinor: number
  readonly subtotalMinor: number
  readonly discountMinor: number
  readonly taxMinor: number
  readonly taxRateBp: number
  /** What this line contributes to the order total. */
  readonly totalMinor: number
}

export interface TotalsInput {
  readonly currency: string
  readonly lines: readonly TotalsLineInput[]
  /** Resolved tax rule per tax category. A missing category means no tax. */
  readonly taxRules: ReadonlyMap<string, TaxRule | null>
  readonly coupon?: Coupon | null
  readonly shippingMinor?: number
  /** The category the shipping line is taxed under. */
  readonly shippingTaxCategory?: string
}

export interface Totals {
  readonly currency: string
  readonly lines: readonly TotalsLine[]
  readonly subtotalMinor: number
  readonly discountMinor: number
  readonly shippingMinor: number
  /** Tax **added** on top. Tax already included in prices is not counted here. */
  readonly taxMinor: number
  /** Tax already contained in the prices shown. Reported, never added. */
  readonly taxIncludedMinor: number
  readonly totalMinor: number
  readonly weightGrams: number
}

export function computeTotals(input: TotalsInput): Totals {
  const currency = assertSameCurrency(input.currency, input.currency)

  const subtotals = input.lines.map((line) => line.unitPriceMinor * line.quantity)
  const subtotalMinor = subtotals.reduce((sum, value) => sum + value, 0)
  const weightGrams = input.lines.reduce((sum, line) => sum + line.weightGrams * line.quantity, 0)

  const couponOutcome =
    input.coupon == null
      ? { discountMinor: 0, freeShipping: false }
      : discountFor(input.coupon, subtotalMinor)

  const discountMinor = couponOutcome.discountMinor
  const shippingMinor = couponOutcome.freeShipping ? 0 : (input.shippingMinor ?? 0)

  // The order-level discount attributed to lines, exactly — `distribute`
  // hands out the remainder so the parts sum to the whole. Rounding each
  // line independently would lose or invent up to one minor unit per line,
  // and an invoice whose lines do not add up to its total is not an invoice.
  const lineDiscounts = distribute(discountMinor, subtotals)

  let taxMinor = 0
  let taxIncludedMinor = 0

  const lines: TotalsLine[] = input.lines.map((line, index) => {
    const lineSubtotal = subtotals[index] ?? 0
    const lineDiscount = lineDiscounts[index] ?? 0
    const taxable = lineSubtotal - lineDiscount

    const rule = input.taxRules.get(line.taxCategory) ?? null
    const outcome = taxFor(taxable, rule)

    if (outcome.includedInPrice) taxIncludedMinor += outcome.taxMinor
    else taxMinor += outcome.taxMinor

    return {
      variantId: line.variantId,
      sku: line.sku,
      title: line.title,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      subtotalMinor: lineSubtotal,
      discountMinor: lineDiscount,
      taxMinor: outcome.taxMinor,
      taxRateBp: outcome.rateBp,
      totalMinor: taxable + (outcome.includedInPrice ? 0 : outcome.taxMinor),
    }
  })

  if (shippingMinor > 0) {
    const shippingRule = input.taxRules.get(input.shippingTaxCategory ?? 'shipping') ?? null
    const shippingTax = taxFor(shippingMinor, shippingRule)
    if (shippingTax.includedInPrice) taxIncludedMinor += shippingTax.taxMinor
    else taxMinor += shippingTax.taxMinor
  }

  const totalMinor = subtotalMinor - discountMinor + shippingMinor + taxMinor

  return {
    currency,
    lines,
    subtotalMinor,
    discountMinor,
    shippingMinor,
    taxMinor,
    taxIncludedMinor,
    totalMinor,
    weightGrams,
  }
}
