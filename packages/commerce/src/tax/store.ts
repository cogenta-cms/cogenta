import { CogentaError, type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import { applyBasisPoints } from '../money.js'
import { fromBool, toBool, toInt, toNullableText, toText } from '../rows.js'
import { TABLES } from '../tables.js'

/**
 * Where a shopper is, as far as tax is concerned.
 *
 * Country and an optional region, and nothing else. Not a postcode: postcode
 * tax (US local sales tax) is a database problem, not a rules problem, and
 * pretending to solve it with three stored rows would be worse than saying so.
 * A site that needs it registers a carrier-style rule source of its own.
 */
export interface TaxZone {
  /** ISO 3166-1 alpha-2, upper case. */
  readonly country: string
  /** A state, province or county code. Free text, matched exactly. */
  readonly region?: string | null
}

export interface TaxRule {
  readonly id: string
  readonly country: string | null
  readonly region: string | null
  readonly taxCategory: string
  readonly name: string
  readonly rateBp: number
  /**
   * True when the catalogue price already contains this tax — the European
   * convention. The order then shows the tax it *contains*; it never adds it.
   */
  readonly includedInPrice: boolean
  readonly priority: number
  readonly active: boolean
  readonly createdAt: string
}

export interface CreateTaxRuleInput {
  readonly country?: string | null
  readonly region?: string | null
  readonly taxCategory?: string
  readonly name: string
  readonly rateBp: number
  readonly includedInPrice?: boolean
  readonly priority?: number
  readonly active?: boolean
}

/** What one line owes. */
export interface TaxOutcome {
  readonly rateBp: number
  readonly taxMinor: number
  readonly includedInPrice: boolean
  readonly ruleName: string | null
}

export interface TaxStore {
  createRule(input: CreateTaxRuleInput): Promise<TaxRule>
  deleteRule(id: string): Promise<void>
  listRules(): Promise<readonly TaxRule[]>
  /** The one rule that applies, or null when nothing does. */
  resolve(zone: TaxZone | null, taxCategory: string): Promise<TaxRule | null>
}

interface TaxRuleRow {
  id: unknown
  country: unknown
  region: unknown
  tax_category: unknown
  name: unknown
  rate_bp: unknown
  included_in_price: unknown
  priority: unknown
  active: unknown
  created_at: unknown
}

function decode(row: TaxRuleRow): TaxRule {
  return {
    id: toText(row.id, 'tax_rule.id'),
    country: toNullableText(row.country),
    region: toNullableText(row.region),
    taxCategory: toText(row.tax_category, 'tax_rule.tax_category'),
    name: toText(row.name, 'tax_rule.name'),
    rateBp: toInt(row.rate_bp, 'tax_rule.rate_bp'),
    includedInPrice: toBool(row.included_in_price),
    priority: toInt(row.priority, 'tax_rule.priority'),
    active: toBool(row.active),
    createdAt: toText(row.created_at, 'tax_rule.created_at'),
  }
}

/**
 * How specific a rule is for a given zone, or null when it does not apply.
 *
 * Specificity, not order in the table: "France, Corsica" must beat "France",
 * which must beat "anywhere". Resolving by insertion order would make the
 * answer depend on the sequence an operator happened to type the rules in,
 * which is exactly the kind of invisible dependency a shop discovers at the
 * worst moment.
 */
function specificity(rule: TaxRule, zone: TaxZone | null): number | null {
  if (rule.country !== null) {
    if (zone === null) return null
    if (rule.country !== zone.country) return null
  }
  if (rule.region !== null) {
    const region = zone?.region ?? null
    if (region === null || rule.region !== region) return null
    return 2
  }
  return rule.country === null ? 0 : 1
}

export function createTaxStore(db: DatabaseHandle, now: () => number = Date.now): TaxStore {
  const d = db.dialect
  const table = identifier(TABLES.taxRules, d)

  return {
    createRule: async (input) => {
      if (!Number.isInteger(input.rateBp) || input.rateBp < 0 || input.rateBp > 100_000) {
        throw new CogentaError({
          code: 'COMMERCE_TAX_RULE_INVALID',
          message: `A tax rate must be a whole number of basis points between 0 and 100000, got ${String(input.rateBp)}.`,
          hint: '20 % is 2000 basis points. 5.5 % is 550.',
        })
      }

      const id = newId(now)
      await db.query(sql`
        insert into ${table} (id, country, region, tax_category, name, rate_bp, included_in_price, priority, active, created_at)
        values (${id}, ${input.country?.toUpperCase() ?? null}, ${input.region ?? null},
                ${input.taxCategory ?? 'standard'}, ${input.name}, ${input.rateBp},
                ${fromBool(input.includedInPrice ?? true, d)}, ${input.priority ?? 0},
                ${fromBool(input.active ?? true, d)}, ${new Date(now()).toISOString()})`)

      const result = await db.query<TaxRuleRow>(sql`select * from ${table} where id = ${id}`)
      const row = result.rows[0]
      if (row === undefined) {
        throw new CogentaError({
          code: 'COMMERCE_TAX_RULE_INVALID',
          message: 'The tax rule was not stored.',
          hint: 'Check that the commerce tables exist (ensureCommerceTables).',
        })
      }
      return decode(row)
    },

    deleteRule: async (id) => {
      await db.query(sql`delete from ${table} where id = ${id}`)
    },

    listRules: async () => {
      const result = await db.query<TaxRuleRow>(
        sql`select * from ${table} order by priority desc, created_at asc`,
      )
      return result.rows.map(decode)
    },

    resolve: async (zone, taxCategory) => {
      const result = await db.query<TaxRuleRow>(
        sql`select * from ${table} where tax_category = ${taxCategory}`,
      )

      let best: TaxRule | null = null
      let bestScore = -1
      for (const rule of result.rows.map(decode)) {
        if (!rule.active) continue
        const score = specificity(rule, zone)
        if (score === null) continue
        // Priority first, then specificity, then oldest — a total order, so
        // two equally good rules always resolve the same way.
        const combined = rule.priority * 10 + score
        if (combined > bestScore) {
          best = rule
          bestScore = combined
        }
      }
      return best
    },
  }
}

/**
 * What one taxable amount owes under a rule.
 *
 * Two arithmetics, and getting them the wrong way round is the classic
 * European VAT bug. When tax is **added**, it is `amount × rate`. When it is
 * **included**, the amount already contains it, so the tax is
 * `amount − amount / (1 + rate)`, computed in integers as
 * `amount × rate / (10000 + rate)`. Applying the first formula to a
 * tax-inclusive price overcharges by the tax on the tax.
 */
export function taxFor(amountMinor: number, rule: TaxRule | null): TaxOutcome {
  if (rule === null) {
    return { rateBp: 0, taxMinor: 0, includedInPrice: false, ruleName: null }
  }

  const taxMinor = rule.includedInPrice
    ? Math.floor((amountMinor * rule.rateBp + (10_000 + rule.rateBp) / 2) / (10_000 + rule.rateBp))
    : applyBasisPoints(amountMinor, rule.rateBp)

  return {
    rateBp: rule.rateBp,
    taxMinor,
    includedInPrice: rule.includedInPrice,
    ruleName: rule.name,
  }
}
