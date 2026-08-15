import { CogentaError, type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import { assertCurrency, assertMinor } from '../money.js'
import { fromBool, toBool, toInt, toNullableInt, toNullableText, toText } from '../rows.js'
import { TABLES } from '../tables.js'
import type { TaxZone } from '../tax/store.js'

/**
 * How a stored rate is computed.
 *
 * Three kinds, chosen because they are the three every small shop actually
 * uses. A fourth ("by number of items", "by volume") waits for a real second
 * user — the project forbids abstracting before three real uses, and this is
 * exactly the sort of table that grows a rule engine nobody asked for.
 */
export const SHIPPING_KINDS = ['flat', 'by_weight', 'free'] as const
export type ShippingKind = (typeof SHIPPING_KINDS)[number]

export interface ShippingMethod {
  readonly id: string
  readonly label: string
  readonly country: string | null
  readonly region: string | null
  readonly kind: ShippingKind
  readonly currency: string
  /** Flat part, in minor units. The base of a by-weight rate too. */
  readonly amountMinor: number
  /** Added per kilogram, rounded up to the next whole kilogram. */
  readonly perKgMinor: number
  /** Above this order subtotal, shipping is free. Null to never do that. */
  readonly freeOverMinor: number | null
  /** Names a registered carrier driver, or null for a plain stored rate. */
  readonly carrier: string | null
  readonly position: number
  readonly active: boolean
  readonly createdAt: string
}

export interface CreateShippingMethodInput {
  readonly label: string
  readonly country?: string | null
  readonly region?: string | null
  readonly kind?: ShippingKind
  readonly currency: string
  readonly amountMinor?: number
  readonly perKgMinor?: number
  readonly freeOverMinor?: number | null
  readonly carrier?: string | null
  readonly position?: number
  readonly active?: boolean
}

/** What a shipment weighs and costs, before shipping is worked out. */
export interface ShipmentBasis {
  readonly weightGrams: number
  readonly subtotalMinor: number
  readonly currency: string
}

export interface ShippingQuote {
  readonly methodId: string
  readonly label: string
  readonly amountMinor: number
  readonly currency: string
  readonly carrier: string | null
}

/**
 * A real-time rate from a carrier's API.
 *
 * Optional by construction (R1): a shop with no carrier account gets stored
 * rates, which is a complete way to ship. When a carrier driver *is*
 * registered and its call fails, `quote()` falls back to the method's stored
 * rate rather than refusing the order — a checkout that dies because a
 * courier's API is down is a worse outcome than a slightly wrong postage
 * estimate, and the stored rate is the operator's own number.
 */
export interface CarrierRateProvider {
  readonly name: string
  rate(method: ShippingMethod, basis: ShipmentBasis, zone: TaxZone | null): Promise<number | null>
}

export interface ShippingStore {
  createMethod(input: CreateShippingMethodInput): Promise<ShippingMethod>
  deleteMethod(id: string): Promise<void>
  listMethods(): Promise<readonly ShippingMethod[]>
  /** The methods that serve this zone, cheapest first. */
  available(zone: TaxZone | null, basis: ShipmentBasis): Promise<readonly ShippingQuote[]>
  /** One method by id, priced for this shipment. */
  quote(methodId: string, zone: TaxZone | null, basis: ShipmentBasis): Promise<ShippingQuote>
}

interface MethodRow {
  id: unknown
  label: unknown
  country: unknown
  region: unknown
  kind: unknown
  currency: unknown
  amount_minor: unknown
  per_kg_minor: unknown
  free_over_minor: unknown
  carrier: unknown
  position: unknown
  active: unknown
  created_at: unknown
}

function decode(row: MethodRow): ShippingMethod {
  return {
    id: toText(row.id, 'shipping_method.id'),
    label: toText(row.label, 'shipping_method.label'),
    country: toNullableText(row.country),
    region: toNullableText(row.region),
    kind: toText(row.kind, 'shipping_method.kind') as ShippingKind,
    currency: toText(row.currency, 'shipping_method.currency'),
    amountMinor: toInt(row.amount_minor, 'shipping_method.amount_minor'),
    perKgMinor: toInt(row.per_kg_minor, 'shipping_method.per_kg_minor'),
    freeOverMinor: toNullableInt(row.free_over_minor, 'shipping_method.free_over_minor'),
    carrier: toNullableText(row.carrier),
    position: toInt(row.position, 'shipping_method.position'),
    active: toBool(row.active),
    createdAt: toText(row.created_at, 'shipping_method.created_at'),
  }
}

function serves(method: ShippingMethod, zone: TaxZone | null): boolean {
  if (method.country !== null) {
    if (zone === null || method.country !== zone.country) return false
  }
  if (method.region !== null) {
    if (zone?.region == null || method.region !== zone.region) return false
  }
  return true
}

/** The stored rate. Never negative, and free over a threshold when set. */
export function storedRate(method: ShippingMethod, basis: ShipmentBasis): number {
  if (method.freeOverMinor !== null && basis.subtotalMinor >= method.freeOverMinor) return 0
  if (method.kind === 'free') return 0
  if (method.kind === 'flat') return method.amountMinor

  // Rounded up to the next whole kilogram, the way a carrier's price list
  // does: 1.1 kg is charged as two, never as 1.1.
  const kilograms = Math.ceil(Math.max(0, basis.weightGrams) / 1000)
  return method.amountMinor + method.perKgMinor * kilograms
}

export interface ShippingStoreOptions {
  /** Registered carrier drivers, by name. Empty is the normal case. */
  readonly carriers?: readonly CarrierRateProvider[]
}

export function createShippingStore(
  db: DatabaseHandle,
  options: ShippingStoreOptions = {},
  now: () => number = Date.now,
): ShippingStore {
  const d = db.dialect
  const table = identifier(TABLES.shippingMethods, d)
  const carriers = new Map((options.carriers ?? []).map((carrier) => [carrier.name, carrier]))

  async function priceOf(
    method: ShippingMethod,
    zone: TaxZone | null,
    basis: ShipmentBasis,
  ): Promise<number> {
    const fallback = storedRate(method, basis)
    if (method.carrier === null) return fallback

    const carrier = carriers.get(method.carrier)
    // A method naming a carrier that is not registered is not an error: it is
    // a site that turned the integration off. It ships at the stored rate.
    if (carrier === undefined) return fallback

    try {
      const live = await carrier.rate(method, basis, zone)
      if (live === null) return fallback
      return assertMinor(live, 'A carrier rate')
    } catch {
      // See CarrierRateProvider: a courier's outage must not close the till.
      return fallback
    }
  }

  async function allMethods(): Promise<readonly ShippingMethod[]> {
    const result = await db.query<MethodRow>(
      sql`select * from ${table} order by position asc, created_at asc`,
    )
    return result.rows.map(decode)
  }

  return {
    createMethod: async (input) => {
      const id = newId(now)
      await db.query(sql`
        insert into ${table} (id, label, country, region, kind, currency, amount_minor,
                              per_kg_minor, free_over_minor, carrier, position, active, created_at)
        values (${id}, ${input.label}, ${input.country?.toUpperCase() ?? null}, ${input.region ?? null},
                ${input.kind ?? 'flat'}, ${assertCurrency(input.currency)},
                ${assertMinor(input.amountMinor ?? 0, 'A shipping amount')},
                ${assertMinor(input.perKgMinor ?? 0, 'A per-kilogram shipping amount')},
                ${input.freeOverMinor ?? null}, ${input.carrier ?? null},
                ${input.position ?? 0}, ${fromBool(input.active ?? true, d)},
                ${new Date(now()).toISOString()})`)

      const result = await db.query<MethodRow>(sql`select * from ${table} where id = ${id}`)
      const row = result.rows[0]
      if (row === undefined) {
        throw new CogentaError({
          code: 'COMMERCE_SHIPPING_METHOD_UNKNOWN',
          message: 'The shipping method was not stored.',
          hint: 'Check that the commerce tables exist (ensureCommerceTables).',
        })
      }
      return decode(row)
    },

    deleteMethod: async (id) => {
      await db.query(sql`delete from ${table} where id = ${id}`)
    },

    listMethods: allMethods,

    available: async (zone, basis) => {
      const quotes: ShippingQuote[] = []
      for (const method of await allMethods()) {
        if (!method.active) continue
        if (!serves(method, zone)) continue
        if (method.currency !== basis.currency) continue
        quotes.push({
          methodId: method.id,
          label: method.label,
          amountMinor: await priceOf(method, zone, basis),
          currency: method.currency,
          carrier: method.carrier,
        })
      }
      return quotes.sort(
        (left, right) =>
          left.amountMinor - right.amountMinor || left.label.localeCompare(right.label),
      )
    },

    quote: async (methodId, zone, basis) => {
      const result = await db.query<MethodRow>(sql`select * from ${table} where id = ${methodId}`)
      const row = result.rows[0]
      if (row === undefined) {
        throw new CogentaError({
          code: 'COMMERCE_SHIPPING_METHOD_UNKNOWN',
          message: 'This shipping method does not exist.',
          hint: 'Choose one of the methods offered for the delivery address.',
        })
      }

      const method = decode(row)
      if (!method.active || !serves(method, zone)) {
        throw new CogentaError({
          code: 'COMMERCE_SHIPPING_UNAVAILABLE',
          message: `"${method.label}" does not ship to this address.`,
          hint: 'Choose another delivery method, or change the delivery country.',
        })
      }
      if (method.currency !== basis.currency) {
        throw new CogentaError({
          code: 'COMMERCE_CURRENCY_MISMATCH',
          message: `"${method.label}" is priced in ${method.currency}, and this order is in ${basis.currency}.`,
          hint: 'Add a shipping method priced in the order currency.',
        })
      }

      return {
        methodId: method.id,
        label: method.label,
        amountMinor: await priceOf(method, zone, basis),
        currency: method.currency,
        carrier: method.carrier,
      }
    },
  }
}
