import {
  CogentaError,
  type DatabaseHandle,
  identifier,
  newId,
  type SqlExecutor,
  sql,
} from '@cogenta/core'
import type { CatalogStore } from '../catalog/store.js'
import type { CustomerStore } from '../customer/store.js'
import { assertCurrency, assertMinor } from '../money.js'
import { type OrderStore, referenceFrom } from '../order/store.js'
import type { PaymentStore } from '../payment/store.js'
import { toInt, toNullableText, toText } from '../rows.js'
import { TABLES } from '../tables.js'

export const SUBSCRIPTION_STATUSES = ['active', 'paused', 'cancelled'] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

export const INTERVAL_UNITS = ['day', 'week', 'month', 'year'] as const
export type IntervalUnit = (typeof INTERVAL_UNITS)[number]

export interface Subscription {
  readonly id: string
  readonly customerId: string
  readonly variantId: string
  readonly quantity: number
  readonly status: SubscriptionStatus
  readonly intervalUnit: IntervalUnit
  readonly intervalCount: number
  /** The price agreed when the subscription started. It does not follow the
   * catalogue: a subscriber is entitled to the price they signed up at until
   * somebody explicitly changes it. */
  readonly priceMinor: number
  readonly currency: string
  readonly paymentDriver: string
  readonly currentPeriodStart: string
  readonly currentPeriodEnd: string
  readonly nextBillingAt: string
  readonly shippingCountry: string | null
  readonly shippingRegion: string | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly cancelledAt: string | null
}

export interface SubscriptionCycle {
  readonly id: string
  readonly subscriptionId: string
  readonly periodStart: string
  readonly periodEnd: string
  readonly orderId: string | null
  readonly status: 'billed' | 'skipped_out_of_stock' | 'failed'
  readonly createdAt: string
}

export interface CreateSubscriptionInput {
  readonly customerId: string
  readonly variantId: string
  readonly quantity?: number
  readonly intervalUnit: IntervalUnit
  readonly intervalCount?: number
  readonly priceMinor?: number
  readonly currency?: string
  readonly paymentDriver?: string
  readonly startAt?: string
  readonly shippingCountry?: string | null
  readonly shippingRegion?: string | null
}

/** What one billing run did. Nothing here is a surprise to the operator. */
export interface BillingRunResult {
  readonly billed: readonly { readonly subscriptionId: string; readonly orderId: string }[]
  readonly skipped: readonly { readonly subscriptionId: string; readonly reason: string }[]
}

export interface SubscriptionStoreDependencies {
  readonly catalog: CatalogStore
  readonly customers: CustomerStore
  readonly orders: OrderStore
  readonly payments: PaymentStore
}

export interface SubscriptionStore {
  create(input: CreateSubscriptionInput): Promise<Subscription>
  read(id: string): Promise<Subscription | null>
  list(options?: {
    readonly customerId?: string
    readonly status?: SubscriptionStatus
  }): Promise<readonly Subscription[]>
  pause(id: string): Promise<Subscription>
  resume(id: string): Promise<Subscription>
  cancel(id: string): Promise<Subscription>
  cycles(id: string): Promise<readonly SubscriptionCycle[]>
  /**
   * Bills every subscription whose next date has arrived.
   *
   * Called by a scheduler, a cron, or a person clicking a button — this
   * package does not own a clock, which is why `now` is injected and why the
   * run is safe to call twice.
   */
  runBilling(options?: { readonly limit?: number }): Promise<BillingRunResult>
}

interface SubscriptionRow {
  id: unknown
  customer_id: unknown
  variant_id: unknown
  quantity: unknown
  status: unknown
  interval_unit: unknown
  interval_count: unknown
  price_minor: unknown
  currency: unknown
  payment_driver: unknown
  current_period_start: unknown
  current_period_end: unknown
  next_billing_at: unknown
  shipping_country: unknown
  shipping_region: unknown
  created_at: unknown
  updated_at: unknown
  cancelled_at: unknown
}

interface CycleRow {
  id: unknown
  subscription_id: unknown
  period_start: unknown
  period_end: unknown
  order_id: unknown
  status: unknown
  created_at: unknown
}

function decode(row: SubscriptionRow): Subscription {
  return {
    id: toText(row.id, 'subscription.id'),
    customerId: toText(row.customer_id, 'subscription.customer_id'),
    variantId: toText(row.variant_id, 'subscription.variant_id'),
    quantity: toInt(row.quantity, 'subscription.quantity'),
    status: toText(row.status, 'subscription.status') as SubscriptionStatus,
    intervalUnit: toText(row.interval_unit, 'subscription.interval_unit') as IntervalUnit,
    intervalCount: toInt(row.interval_count, 'subscription.interval_count'),
    priceMinor: toInt(row.price_minor, 'subscription.price_minor'),
    currency: toText(row.currency, 'subscription.currency'),
    paymentDriver: toText(row.payment_driver, 'subscription.payment_driver'),
    currentPeriodStart: toText(row.current_period_start, 'subscription.current_period_start'),
    currentPeriodEnd: toText(row.current_period_end, 'subscription.current_period_end'),
    nextBillingAt: toText(row.next_billing_at, 'subscription.next_billing_at'),
    shippingCountry: toNullableText(row.shipping_country),
    shippingRegion: toNullableText(row.shipping_region),
    createdAt: toText(row.created_at, 'subscription.created_at'),
    updatedAt: toText(row.updated_at, 'subscription.updated_at'),
    cancelledAt: toNullableText(row.cancelled_at),
  }
}

/**
 * The end of a billing period.
 *
 * Month and year arithmetic is where recurring billing goes wrong, so the rule
 * is stated rather than inherited from `Date`: adding a month to 31 January
 * gives **28 February** (or the 29th in a leap year), not 3 March. JavaScript's
 * `setMonth` overflows into the next month, which would silently move a
 * subscriber's billing day forward every short month until it drifted off the
 * end of the calendar.
 */
export function advancePeriod(from: string, unit: IntervalUnit, count: number): string {
  const start = new Date(from)
  if (Number.isNaN(start.getTime())) {
    throw new CogentaError({
      code: 'COMMERCE_SUBSCRIPTION_INVALID',
      message: `"${from}" is not a date a billing period can start on.`,
      hint: 'Use an ISO 8601 timestamp.',
    })
  }

  if (unit === 'day' || unit === 'week') {
    const days = count * (unit === 'week' ? 7 : 1)
    return new Date(start.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
  }

  const months = unit === 'year' ? count * 12 : count
  const year = start.getUTCFullYear()
  const month = start.getUTCMonth() + months
  const day = start.getUTCDate()

  const targetYear = year + Math.floor(month / 12)
  const targetMonth = ((month % 12) + 12) % 12
  // Day 0 of the following month is the last day of this one.
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      Math.min(day, lastDay),
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
      start.getUTCMilliseconds(),
    ),
  ).toISOString()
}

export function createSubscriptionStore(
  db: DatabaseHandle,
  dependencies: SubscriptionStoreDependencies,
  now: () => number = Date.now,
): SubscriptionStore {
  const d = db.dialect
  const subscriptions = identifier(TABLES.subscriptions, d)
  const cycles = identifier(TABLES.subscriptionCycles, d)
  const orders = identifier(TABLES.orders, d)
  const orderLines = identifier(TABLES.orderLines, d)
  const stamp = (): string => new Date(now()).toISOString()

  async function read(id: string, executor: SqlExecutor = db): Promise<Subscription | null> {
    const result = await executor.query<SubscriptionRow>(
      sql`select * from ${subscriptions} where id = ${id}`,
    )
    const row = result.rows[0]
    return row === undefined ? null : decode(row)
  }

  async function load(id: string): Promise<Subscription> {
    const found = await read(id)
    if (found === null) {
      throw new CogentaError({
        code: 'COMMERCE_SUBSCRIPTION_NOT_FOUND',
        message: 'This subscription does not exist.',
        hint: 'It may have been cancelled and removed.',
      })
    }
    return found
  }

  /**
   * Bills one period, in one transaction.
   *
   * `period_key` is unique, and it is claimed **first**. That is what makes
   * running the biller twice in a minute — a retried cron, two workers, an
   * impatient operator — charge once: the second attempt collides on the
   * unique key and unwinds before any stock is taken or any order is written.
   */
  async function billOne(
    subscription: Subscription,
  ): Promise<{ orderId: string } | { skipped: string }> {
    const periodStart = subscription.nextBillingAt
    const periodEnd = advancePeriod(
      periodStart,
      subscription.intervalUnit,
      subscription.intervalCount,
    )
    const periodKey = `${subscription.id}:${periodStart}`

    const variant = await dependencies.catalog.readVariant(subscription.variantId)
    if (variant === null) {
      return { skipped: 'The subscribed product no longer exists.' }
    }
    const customer = await dependencies.customers.read(subscription.customerId)
    if (customer === null) {
      return { skipped: 'The subscriber no longer exists.' }
    }

    const orderId = newId(now)
    const at = stamp()

    try {
      return await db.transaction<{ orderId: string } | { skipped: string }>(
        async (tx) => {
          await tx.query(sql`
            insert into ${cycles} (id, subscription_id, period_start, period_end, period_key, order_id, status, created_at)
            values (${newId(now)}, ${subscription.id}, ${periodStart}, ${periodEnd}, ${periodKey},
                    ${orderId}, ${'billed'}, ${at})`)

          const taken = await dependencies.catalog.takeStock(
            [{ variantId: subscription.variantId, quantity: subscription.quantity }],
            tx,
          )
          if (taken.kind === 'short') {
            throw new CycleRefused('The subscribed product is out of stock.')
          }

          const lineTotal = subscription.priceMinor * subscription.quantity
          // A renewal is not a basket, so it does not go through the cart. It
          // is priced at the agreed rate, which is the whole point of a
          // subscription — and it produces a real order, so it appears in the
          // same lists, history and invoicing as everything else.
          await tx.query(sql`
            insert into ${orders} (id, reference, customer_id, email, status, currency,
                                   subtotal_minor, discount_minor, shipping_minor, tax_minor, total_minor,
                                   coupon_code, shipping_country, shipping_region,
                                   shipping_method_id, shipping_method_label,
                                   placed_at, updated_at, subscription_id)
            values (${orderId}, ${referenceFrom(orderId)}, ${customer.id}, ${customer.email},
                    ${'pending'}, ${subscription.currency},
                    ${lineTotal}, ${0}, ${0}, ${0}, ${lineTotal},
                    ${null}, ${subscription.shippingCountry}, ${subscription.shippingRegion},
                    ${null}, ${null}, ${at}, ${at}, ${subscription.id})`)

          await tx.query(sql`
            insert into ${orderLines} (id, order_id, variant_id, sku, title, quantity,
                                       unit_price_minor, subtotal_minor, discount_minor,
                                       tax_minor, tax_rate_bp, total_minor, position)
            values (${newId(now)}, ${orderId}, ${variant.id}, ${variant.sku}, ${variant.title},
                    ${subscription.quantity}, ${subscription.priceMinor}, ${lineTotal},
                    ${0}, ${0}, ${0}, ${lineTotal}, ${0})`)

          await tx.query(sql`
            update ${subscriptions}
            set current_period_start = ${periodStart},
                current_period_end = ${periodEnd},
                next_billing_at = ${periodEnd},
                updated_at = ${at}
            where id = ${subscription.id}`)

          return { orderId }
        },
        { immediate: true },
      )
    } catch (error) {
      if (error instanceof CycleRefused) {
        // The period is still marked as attempted, so the next run does not
        // retry it forever — and the billing date still moves, because a
        // subscriber whose delivery was skipped is not owed two next month.
        await db.query(sql`
          insert into ${cycles} (id, subscription_id, period_start, period_end, period_key, order_id, status, created_at)
          values (${newId(now)}, ${subscription.id}, ${periodStart}, ${periodEnd}, ${`${periodKey}:skipped`},
                  ${null}, ${'skipped_out_of_stock'}, ${at})`)
        await db.query(sql`
          update ${subscriptions}
          set current_period_start = ${periodStart}, current_period_end = ${periodEnd},
              next_billing_at = ${periodEnd}, updated_at = ${at}
          where id = ${subscription.id}`)
        return { skipped: error.reason }
      }
      // A unique-key collision on period_key: somebody else billed this
      // period between the query and here. Not an error — the correct outcome.
      return { skipped: 'This period was already billed.' }
    }
  }

  return {
    create: async (input) => {
      const variant = await dependencies.catalog.readVariant(input.variantId)
      if (variant === null) {
        throw new CogentaError({
          code: 'COMMERCE_VARIANT_NOT_FOUND',
          message: 'This product variant does not exist.',
          hint: 'A subscription needs something to deliver.',
        })
      }
      const count = input.intervalCount ?? 1
      if (!Number.isInteger(count) || count < 1 || count > 36) {
        throw new CogentaError({
          code: 'COMMERCE_SUBSCRIPTION_INVALID',
          message: `A billing interval must be between 1 and 36, got ${String(count)}.`,
          hint: 'Every three months is intervalUnit "month", intervalCount 3.',
        })
      }

      const id = newId(now)
      const at = stamp()
      const start = input.startAt ?? at
      const end = advancePeriod(start, input.intervalUnit, count)

      await db.query(sql`
        insert into ${subscriptions} (id, customer_id, variant_id, quantity, status,
                                      interval_unit, interval_count, price_minor, currency,
                                      payment_driver, current_period_start, current_period_end,
                                      next_billing_at, shipping_country, shipping_region,
                                      created_at, updated_at, cancelled_at)
        values (${id}, ${input.customerId}, ${input.variantId}, ${input.quantity ?? 1}, ${'active'},
                ${input.intervalUnit}, ${count},
                ${assertMinor(input.priceMinor ?? variant.priceMinor, 'A subscription price')},
                ${assertCurrency(input.currency ?? variant.currency)},
                ${input.paymentDriver ?? 'manual'}, ${start}, ${end}, ${start},
                ${input.shippingCountry ?? null}, ${input.shippingRegion ?? null},
                ${at}, ${at}, ${null})`)

      return load(id)
    },

    read,

    list: async (options) => {
      let statement = sql`select * from ${subscriptions}`
      if (options?.customerId !== undefined && options.status !== undefined) {
        statement = sql`${statement} where customer_id = ${options.customerId} and status = ${options.status}`
      } else if (options?.customerId !== undefined) {
        statement = sql`${statement} where customer_id = ${options.customerId}`
      } else if (options?.status !== undefined) {
        statement = sql`${statement} where status = ${options.status}`
      }
      const result = await db.query<SubscriptionRow>(
        sql`${statement} order by created_at desc, id desc`,
      )
      return result.rows.map(decode)
    },

    pause: async (id) => {
      await load(id)
      await db.query(
        sql`update ${subscriptions} set status = ${'paused'}, updated_at = ${stamp()} where id = ${id} and status = ${'active'}`,
      )
      return load(id)
    },

    resume: async (id) => {
      const subscription = await load(id)
      if (subscription.status === 'cancelled') {
        throw new CogentaError({
          code: 'COMMERCE_SUBSCRIPTION_INVALID',
          message: 'A cancelled subscription cannot be resumed.',
          hint: 'Create a new subscription instead — the old one is a closed record.',
        })
      }
      // Billing resumes from now, not from where it was paused. Charging a
      // subscriber for the months they were paused is exactly what pausing was
      // supposed to prevent.
      const at = stamp()
      await db.query(sql`
        update ${subscriptions} set status = ${'active'}, next_billing_at = ${at}, updated_at = ${at}
        where id = ${id}`)
      return load(id)
    },

    cancel: async (id) => {
      await load(id)
      const at = stamp()
      await db.query(sql`
        update ${subscriptions} set status = ${'cancelled'}, cancelled_at = ${at}, updated_at = ${at}
        where id = ${id} and cancelled_at is null`)
      return load(id)
    },

    cycles: async (id) => {
      const result = await db.query<CycleRow>(
        sql`select * from ${cycles} where subscription_id = ${id} order by period_start asc, id asc`,
      )
      return result.rows.map((row) => ({
        id: toText(row.id, 'cycle.id'),
        subscriptionId: toText(row.subscription_id, 'cycle.subscription_id'),
        periodStart: toText(row.period_start, 'cycle.period_start'),
        periodEnd: toText(row.period_end, 'cycle.period_end'),
        orderId: toNullableText(row.order_id),
        status: toText(row.status, 'cycle.status') as SubscriptionCycle['status'],
        createdAt: toText(row.created_at, 'cycle.created_at'),
      }))
    },

    runBilling: async (options) => {
      const due = await db.query<SubscriptionRow>(sql`
        select * from ${subscriptions}
        where status = ${'active'} and next_billing_at <= ${stamp()}
        order by next_billing_at asc`)

      const billed: { subscriptionId: string; orderId: string }[] = []
      const skipped: { subscriptionId: string; reason: string }[] = []

      for (const row of due.rows.slice(0, options?.limit ?? 200)) {
        const subscription = decode(row)
        const outcome = await billOne(subscription)
        if ('orderId' in outcome) {
          billed.push({ subscriptionId: subscription.id, orderId: outcome.orderId })
          // The renewal starts a payment through the same store as any other
          // order, so a subscription with no gateway configured produces bank
          // transfer instructions rather than failing (R2).
          await dependencies.payments.start(outcome.orderId)
        } else {
          skipped.push({ subscriptionId: subscription.id, reason: outcome.skipped })
        }
      }

      return { billed, skipped }
    },
  }
}

/** Internal. Unwinds a billing transaction with a reason. */
class CycleRefused extends Error {
  readonly reason: string

  constructor(reason: string) {
    super(reason)
    this.name = 'CycleRefused'
    this.reason = reason
  }
}
