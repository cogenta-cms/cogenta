import {
  CogentaError,
  type DatabaseHandle,
  identifier,
  newId,
  type SqlExecutor,
  sql,
} from '@cogenta/core'
import type { CatalogStore } from '../catalog/store.js'
import type { Customer, CustomerStore } from '../customer/store.js'
import { assertCurrency, assertMinor } from '../money.js'
import { type OrderStore, referenceFrom } from '../order/store.js'
import type { PaymentStore } from '../payment/store.js'
import { toInt, toNullableText, toText } from '../rows.js'
import { TABLES } from '../tables.js'

/**
 * `past_due` (fiche 53 task 3) sits between `active` and `paused`: a
 * subscription lands there the instant a renewal's payment fails, and
 * `runBilling`'s own due-query (`status = 'active'`) then skips it for every
 * subsequent period until the dunning cycle resolves — never suspended on the
 * first failure, and never billed again mid-retry either.
 */
export const SUBSCRIPTION_STATUSES = ['active', 'past_due', 'paused', 'cancelled'] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

/**
 * The default dunning calendar (fiche 53 § "décision à trancher"): retry a
 * failed renewal payment 1, 3 and 7 days after the first failure, then
 * suspend. Proposed by the fiche itself and used as-is — documented here
 * rather than re-litigated, and configurable per store via
 * `SubscriptionStoreOptions.dunningScheduleDays`.
 */
export const DEFAULT_DUNNING_SCHEDULE_DAYS = [1, 3, 7] as const

/** How long a subscriber is warned before a renewal — fiche 53 task 5, configurable per store. */
export const DEFAULT_RENEWAL_NOTICE_DAYS = 3

const DAY_MS = 24 * 60 * 60 * 1000

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

/** The open dunning cycle for a subscription whose last renewal payment failed. `null` from `dunning()` means there is none. */
export interface DunningState {
  readonly subscriptionId: string
  readonly orderId: string
  /** The billing period this cycle is trying to collect for — `billOne`'s own `periodKey`, never a second one. */
  readonly periodKey: string
  readonly failureCount: number
  readonly firstFailedAt: string
  /** Null while a retry is in flight, or once the schedule is exhausted (see `suspendedAt`). */
  readonly nextRetryAt: string | null
  readonly lastReason: string | null
  /** Set once the schedule is exhausted and the subscription was auto-paused. Null while still retrying. */
  readonly suspendedAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

/** What one dunning run did — three disjoint outcomes, never inferred from the others. */
export interface DunningRunResult {
  readonly recovered: readonly { readonly subscriptionId: string; readonly orderId: string }[]
  readonly retried: readonly { readonly subscriptionId: string; readonly reason: string }[]
  readonly suspended: readonly { readonly subscriptionId: string; readonly reason: string }[]
}

export interface ChangePlanOptions {
  readonly quantity?: number
  /** Default `true`. A downgrade never produces a credit — this store has no credit-note mechanism — so a negative proration is reported, not applied. */
  readonly prorate?: boolean
}

export interface ChangePlanResult {
  readonly subscription: Subscription
  /** Positive: charged immediately via `prorationOrderId`. Zero: nothing was due. Negative: a downgrade's credit that this store cannot issue — surfaced, not silently dropped. */
  readonly prorationMinor: number
  readonly prorationOrderId: string | null
}

/** What a renewal-notice sender needs to know (fiche 53 task 5). Built on `@cogenta/channels` in `subscription/renewal-notifier.ts` — never required, see `SubscriptionStoreDependencies.notifyRenewal`. */
export interface RenewalNoticeInput {
  readonly subscription: Subscription
  readonly customer: Customer
  readonly daysUntilRenewal: number
}
export type RenewalNotifier = (input: RenewalNoticeInput) => Promise<void>

export interface SendRenewalNoticesResult {
  readonly notified: readonly { readonly subscriptionId: string }[]
}

/** Aggregate figures for the subscriptions screen (fiche 53 task 6) — read-only, no new data. */
export interface SubscriptionMetrics {
  readonly active: number
  readonly pastDue: number
  readonly paused: number
  readonly cancelled: number
  /** Monthly recurring revenue: every active/past-due subscription's price normalised to a monthly cadence, grouped by currency. */
  readonly mrrMinor: readonly { readonly currency: string; readonly amountMinor: number }[]
  /** Cancelled ÷ (active + past_due + paused + cancelled), or 0 with no subscriptions at all. */
  readonly churnRate: number
}

export interface SubscriptionStoreDependencies {
  readonly catalog: CatalogStore
  readonly customers: CustomerStore
  readonly orders: OrderStore
  readonly payments: PaymentStore
  /** Sends the renewal notice built by `sendRenewalNotices` (fiche 53 task 5). Absent means the method is a safe no-op (R2) — a site with no channel configured just never calls `createEmailRenewalNotifier`. */
  readonly notifyRenewal?: RenewalNotifier
}

export interface SubscriptionStoreOptions {
  /** Days after the first failed renewal payment to retry: fiche 53's own default, `DEFAULT_DUNNING_SCHEDULE_DAYS`. One retry per entry, in order; suspension follows the last one. */
  readonly dunningScheduleDays?: readonly number[]
  /** Days before `nextBillingAt` a renewal notice is due. `DEFAULT_RENEWAL_NOTICE_DAYS` by default. */
  readonly renewalNoticeDays?: number
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
  /** The open dunning cycle for a subscription, or `null` if its last renewal was collected (or it was never in dunning). */
  dunning(id: string): Promise<DunningState | null>
  /**
   * Retries every renewal payment whose next scheduled attempt has arrived.
   *
   * Same idempotence discipline as `runBilling`: a rerun before the next
   * retry is due finds nothing (the row's own `next_retry_at` already moved
   * past `now`), and a genuinely concurrent rerun loses a compare-and-set on
   * that same field — either way, a replay never doubles a retry or a charge.
   */
  runDunning(options?: { readonly limit?: number }): Promise<DunningRunResult>
  /**
   * Switches a subscription to a different variant (and optionally quantity)
   * effective immediately, with an explicit, one-off prorated charge for the
   * remainder of the current period (fiche 53 task 4). Disallowed once
   * cancelled — there is no plan left to change.
   */
  changePlan(
    id: string,
    newVariantId: string,
    options?: ChangePlanOptions,
  ): Promise<ChangePlanResult>
  /**
   * Sends a renewal reminder for every active subscription whose next charge
   * falls within `renewalNoticeDays` — at most once per billing period
   * (fiche 53 task 5). A safe no-op with no `notifyRenewal` dependency (R2).
   */
  sendRenewalNotices(options?: { readonly limit?: number }): Promise<SendRenewalNoticesResult>
  /** Aggregate figures for the subscriptions screen (fiche 53 task 6). */
  metrics(): Promise<SubscriptionMetrics>
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

interface DunningRow {
  subscription_id: unknown
  order_id: unknown
  period_key: unknown
  failure_count: unknown
  first_failed_at: unknown
  next_retry_at: unknown
  last_reason: unknown
  suspended_at: unknown
  created_at: unknown
  updated_at: unknown
}

function decodeDunning(row: DunningRow): DunningState {
  return {
    subscriptionId: toText(row.subscription_id, 'dunning.subscription_id'),
    orderId: toText(row.order_id, 'dunning.order_id'),
    periodKey: toText(row.period_key, 'dunning.period_key'),
    failureCount: toInt(row.failure_count, 'dunning.failure_count'),
    firstFailedAt: toText(row.first_failed_at, 'dunning.first_failed_at'),
    nextRetryAt: toNullableText(row.next_retry_at),
    lastReason: toNullableText(row.last_reason),
    suspendedAt: toNullableText(row.suspended_at),
    createdAt: toText(row.created_at, 'dunning.created_at'),
    updatedAt: toText(row.updated_at, 'dunning.updated_at'),
  }
}

/**
 * When the next dunning retry falls, given how many attempts have failed so
 * far (including the very first, at billing time). `null` means the
 * schedule is exhausted — the caller suspends rather than scheduling again.
 */
function nextRetryAfter(
  firstFailedAt: string,
  failureCount: number,
  scheduleDays: readonly number[],
): string | null {
  const index = failureCount - 1
  const offsetDays = scheduleDays[index]
  if (offsetDays === undefined) return null
  return new Date(Date.parse(firstFailedAt) + offsetDays * DAY_MS).toISOString()
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
  options: SubscriptionStoreOptions = {},
): SubscriptionStore {
  const d = db.dialect
  const subscriptions = identifier(TABLES.subscriptions, d)
  const cycles = identifier(TABLES.subscriptionCycles, d)
  const orders = identifier(TABLES.orders, d)
  const orderLines = identifier(TABLES.orderLines, d)
  const dunningTable = identifier(TABLES.subscriptionDunning, d)
  const renewalNotices = identifier(TABLES.subscriptionRenewalNotices, d)
  const scheduleDays = options.dunningScheduleDays ?? DEFAULT_DUNNING_SCHEDULE_DAYS
  const renewalNoticeDays = options.renewalNoticeDays ?? DEFAULT_RENEWAL_NOTICE_DAYS
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
  ): Promise<{ orderId: string; periodKey: string } | { skipped: string }> {
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
      return await db.transaction<{ orderId: string; periodKey: string } | { skipped: string }>(
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

          return { orderId, periodKey }
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
      // Everything else is either a unique-key collision on `period_key` —
      // somebody else billed this period between the query and here, which is
      // the correct outcome and not an error — or a genuine failure.
      //
      // Told apart by asking, rather than assumed. A blanket "already billed"
      // would turn a broken database into a silent no-op, and a biller that
      // reports success while charging nobody is the worst possible failure
      // mode for this file.
      const claimed = await db.query<{ id: unknown }>(
        sql`select id from ${cycles} where period_key = ${periodKey}`,
      )
      if (claimed.rows.length > 0) return { skipped: 'This period was already billed.' }
      throw error
    }
  }

  /**
   * Opens a dunning cycle for a renewal whose payment just failed.
   *
   * Keyed by `subscription_id`, the table's own primary key — at most one
   * open cycle per subscription, ever. Because this is only ever reached
   * right after `billOne` succeeds for a period (gated by that period's own
   * `period_key` uniqueness, claimed once), a duplicate call for the same
   * period cannot happen in ordinary operation; the `insert`'s own primary
   * key still refuses a genuine double-call rather than silently
   * overwriting an in-progress cycle's history.
   */
  async function beginDunning(
    subscriptionId: string,
    orderId: string,
    periodKey: string,
    reason: string,
  ): Promise<void> {
    const at = stamp()
    const firstRetry = nextRetryAfter(at, 1, scheduleDays)
    const inserted = await db
      .query(sql`
        insert into ${dunningTable} (subscription_id, order_id, period_key, failure_count,
                                     first_failed_at, next_retry_at, last_reason, suspended_at,
                                     created_at, updated_at)
        values (${subscriptionId}, ${orderId}, ${periodKey}, ${1}, ${at}, ${firstRetry}, ${reason},
                ${null}, ${at}, ${at})`)
      .then(() => true)
      .catch(() => false)
    if (!inserted) return

    await db.query(sql`
      update ${subscriptions} set status = ${'past_due'}, updated_at = ${at}
      where id = ${subscriptionId} and status = ${'active'}`)
    await dependencies.orders.record(orderId, 'payment_failed', { note: reason })
  }

  /** Never throws: a renewal that produced an order must not be lost because the gateway is unreachable. */
  async function attemptPayment(
    orderId: string,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    try {
      const payment = await dependencies.payments.start(orderId)
      if (payment.status === 'failed') {
        return { ok: false, reason: 'The payment was declined.' }
      }
      return { ok: true }
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : 'The payment attempt failed.',
      }
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
      const subscription = await load(id)
      // A subscriber in dunning can be paused too — stopping the retries is
      // exactly what a human pausing a past-due subscription means.
      await db.query(sql`
        update ${subscriptions} set status = ${'paused'}, updated_at = ${stamp()}
        where id = ${id} and status in (${'active'}, ${'past_due'})`)
      if (subscription.status === 'past_due') {
        await db.query(sql`delete from ${dunningTable} where subscription_id = ${id}`)
      }
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
      // supposed to prevent. A dunning cycle in progress is dropped for the
      // same reason: a resumed subscription starts a fresh period, not a
      // retry of the one that failed.
      const at = stamp()
      await db.query(sql`
        update ${subscriptions} set status = ${'active'}, next_billing_at = ${at}, updated_at = ${at}
        where id = ${id}`)
      await db.query(sql`delete from ${dunningTable} where subscription_id = ${id}`)
      return load(id)
    },

    cancel: async (id) => {
      await load(id)
      const at = stamp()
      await db.query(sql`
        update ${subscriptions} set status = ${'cancelled'}, cancelled_at = ${at}, updated_at = ${at}
        where id = ${id} and cancelled_at is null`)
      await db.query(sql`delete from ${dunningTable} where subscription_id = ${id}`)
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
          // transfer instructions rather than failing (R2). A failure here —
          // declined, or the gateway unreachable — opens a dunning cycle
          // rather than being silently dropped or thrown past the caller
          // (fiche 53 task 3): never a first-failure suspension, only ever
          // the start of the retry schedule.
          const attempt = await attemptPayment(outcome.orderId)
          if (!attempt.ok) {
            await beginDunning(subscription.id, outcome.orderId, outcome.periodKey, attempt.reason)
          }
        } else {
          skipped.push({ subscriptionId: subscription.id, reason: outcome.skipped })
        }
      }

      return { billed, skipped }
    },

    dunning: async (id) => {
      const result = await db.query<DunningRow>(
        sql`select * from ${dunningTable} where subscription_id = ${id}`,
      )
      const row = result.rows[0]
      return row === undefined ? null : decodeDunning(row)
    },

    runDunning: async (options) => {
      const due = await db.query<DunningRow>(sql`
        select * from ${dunningTable}
        where next_retry_at is not null and next_retry_at <= ${stamp()}
        order by next_retry_at asc`)

      const recovered: { subscriptionId: string; orderId: string }[] = []
      const retried: { subscriptionId: string; reason: string }[] = []
      const suspended: { subscriptionId: string; reason: string }[] = []

      for (const row of due.rows.slice(0, options?.limit ?? 200)) {
        const state = decodeDunning(row)

        // Compare-and-set claim: only one caller can move `next_retry_at`
        // away from the exact value just read. The loser's `rowsAffected`
        // comes back 0 and it moves on — the same shape as the scheduler
        // lock in `@cogenta/schema` (`SCHEDULED_TASK_CLAIMS_TABLE`).
        const claim = await db.query(sql`
          update ${dunningTable} set next_retry_at = ${null}, updated_at = ${stamp()}
          where subscription_id = ${state.subscriptionId} and next_retry_at = ${state.nextRetryAt}`)
        if (claim.rowsAffected === 0) continue

        const attempt = await attemptPayment(state.orderId)

        if (attempt.ok) {
          await db.query(
            sql`delete from ${dunningTable} where subscription_id = ${state.subscriptionId}`,
          )
          await db.query(sql`
            update ${subscriptions} set status = ${'active'}, updated_at = ${stamp()}
            where id = ${state.subscriptionId} and status = ${'past_due'}`)
          recovered.push({ subscriptionId: state.subscriptionId, orderId: state.orderId })
          continue
        }

        const failureCount = state.failureCount + 1
        const nextRetryAt = nextRetryAfter(state.firstFailedAt, failureCount, scheduleDays)

        if (nextRetryAt === null) {
          const at = stamp()
          await db.query(sql`
            update ${dunningTable}
            set failure_count = ${failureCount}, next_retry_at = ${null},
                last_reason = ${attempt.reason}, suspended_at = ${at}, updated_at = ${at}
            where subscription_id = ${state.subscriptionId}`)
          // Auto-suspended, never auto-cancelled: the schedule is exhausted,
          // not the relationship. A human decides what happens next.
          await db.query(sql`
            update ${subscriptions} set status = ${'paused'}, updated_at = ${at}
            where id = ${state.subscriptionId} and status = ${'past_due'}`)
          await dependencies.orders.record(state.orderId, 'note', {
            note: 'Subscription automatically suspended after exhausting the dunning schedule.',
          })
          suspended.push({ subscriptionId: state.subscriptionId, reason: attempt.reason })
        } else {
          await db.query(sql`
            update ${dunningTable}
            set failure_count = ${failureCount}, next_retry_at = ${nextRetryAt},
                last_reason = ${attempt.reason}, updated_at = ${stamp()}
            where subscription_id = ${state.subscriptionId}`)
          retried.push({ subscriptionId: state.subscriptionId, reason: attempt.reason })
        }
      }

      return { recovered, retried, suspended }
    },

    changePlan: async (id, newVariantId, changeOptions) => {
      const subscription = await load(id)
      if (subscription.status === 'cancelled') {
        throw new CogentaError({
          code: 'COMMERCE_SUBSCRIPTION_INVALID',
          message: 'A cancelled subscription has no plan left to change.',
          hint: 'Create a new subscription instead.',
        })
      }
      const variant = await dependencies.catalog.readVariant(newVariantId)
      if (variant === null) {
        throw new CogentaError({
          code: 'COMMERCE_VARIANT_NOT_FOUND',
          message: 'This product variant does not exist.',
          hint: 'A subscription needs something to deliver.',
        })
      }
      if (variant.currency !== subscription.currency) {
        throw new CogentaError({
          code: 'COMMERCE_CURRENCY_MISMATCH',
          message: `This subscription is billed in ${subscription.currency}; "${variant.title}" is priced in ${variant.currency}.`,
          hint: 'Changing currency mid-subscription is not supported — cancel and start a new one.',
        })
      }

      const quantity = changeOptions?.quantity ?? subscription.quantity
      const prorate = changeOptions?.prorate ?? true

      let prorationMinor = 0
      if (prorate) {
        const periodLengthMs =
          Date.parse(subscription.currentPeriodEnd) - Date.parse(subscription.currentPeriodStart)
        const remainingMs = Math.max(0, Date.parse(subscription.currentPeriodEnd) - now())
        if (periodLengthMs > 0) {
          const oldValue = subscription.priceMinor * subscription.quantity
          const newValue = variant.priceMinor * quantity
          prorationMinor = Math.round(((newValue - oldValue) * remainingMs) / periodLengthMs)
        }
      }

      let prorationOrderId: string | null = null
      if (prorationMinor > 0) {
        const customer = await dependencies.customers.read(subscription.customerId)
        if (customer !== null) {
          const orderId = newId(now)
          const at = stamp()
          await db.transaction(
            async (tx) => {
              await tx.query(sql`
              insert into ${orders} (id, reference, customer_id, email, status, currency,
                                     subtotal_minor, discount_minor, shipping_minor, tax_minor, total_minor,
                                     coupon_code, shipping_country, shipping_region,
                                     shipping_method_id, shipping_method_label,
                                     placed_at, updated_at, subscription_id)
              values (${orderId}, ${referenceFrom(orderId)}, ${customer.id}, ${customer.email},
                      ${'pending'}, ${subscription.currency},
                      ${prorationMinor}, ${0}, ${0}, ${0}, ${prorationMinor},
                      ${null}, ${subscription.shippingCountry}, ${subscription.shippingRegion},
                      ${null}, ${null}, ${at}, ${at}, ${subscription.id})`)
              await tx.query(sql`
              insert into ${orderLines} (id, order_id, variant_id, sku, title, quantity,
                                         unit_price_minor, subtotal_minor, discount_minor,
                                         tax_minor, tax_rate_bp, total_minor, position)
              values (${newId(now)}, ${orderId}, ${variant.id}, ${variant.sku},
                      ${'Plan change: prorated for the rest of the current period'}, ${1},
                      ${prorationMinor}, ${prorationMinor}, ${0}, ${0}, ${0}, ${prorationMinor}, ${0})`)
            },
            { immediate: true },
          )
          await dependencies.orders.record(orderId, 'placed', {
            note: 'Prorated charge for a mid-cycle plan change.',
          })
          // Attempted, never required to succeed synchronously: a failure
          // here leaves a real, visible `pending` order a human can settle or
          // retry from the orders screen — the plan change itself still
          // applies, exactly as an upgrade paid by invoice would.
          await attemptPayment(orderId)
          prorationOrderId = orderId
        }
      }

      await db.query(sql`
        update ${subscriptions}
        set variant_id = ${variant.id}, quantity = ${quantity}, price_minor = ${variant.priceMinor},
            currency = ${variant.currency}, updated_at = ${stamp()}
        where id = ${id}`)

      return { subscription: await load(id), prorationMinor, prorationOrderId }
    },

    sendRenewalNotices: async (renewalOptions) => {
      if (dependencies.notifyRenewal === undefined) return { notified: [] }

      const threshold = new Date(now() + renewalNoticeDays * DAY_MS).toISOString()
      const at = stamp()
      const due = await db.query<SubscriptionRow>(sql`
        select * from ${subscriptions}
        where status = ${'active'} and next_billing_at <= ${threshold} and next_billing_at > ${at}
        order by next_billing_at asc`)

      const notified: { subscriptionId: string }[] = []

      for (const row of due.rows.slice(0, renewalOptions?.limit ?? 200)) {
        const subscription = decode(row)
        const periodKey = `${subscription.id}:${subscription.nextBillingAt}`

        // The insert itself is the idempotency claim — a repeat run for the
        // same upcoming period hits the primary key and is swallowed.
        const claimed = await db
          .query(sql`
            insert into ${renewalNotices} (subscription_id, period_key, sent_at)
            values (${subscription.id}, ${periodKey}, ${at})`)
          .then(() => true)
          .catch(() => false)
        if (!claimed) continue

        const customer = await dependencies.customers.read(subscription.customerId)
        if (customer === null) continue

        const daysUntilRenewal = Math.max(
          0,
          Math.round((Date.parse(subscription.nextBillingAt) - now()) / DAY_MS),
        )
        await dependencies.notifyRenewal({ subscription, customer, daysUntilRenewal })
        notified.push({ subscriptionId: subscription.id })
      }

      return { notified }
    },

    metrics: async () => {
      const counts = await db.query<{ status: unknown; n: unknown }>(sql`
        select status, count(*) as n from ${subscriptions} group by status`)
      const byStatus: Record<string, number> = {}
      for (const row of counts.rows) {
        byStatus[toText(row.status, 'subscription_metrics.status')] = toInt(
          row.n,
          'subscription_metrics.n',
        )
      }
      const active = byStatus.active ?? 0
      const pastDue = byStatus.past_due ?? 0
      const paused = byStatus.paused ?? 0
      const cancelled = byStatus.cancelled ?? 0

      // MRR: every billable (active/past_due) subscription's price,
      // normalised to a monthly cadence. Weeks and days are approximated via
      // a 365.25-day year, which is accurate enough for a dashboard figure
      // and never used to charge anyone (billing itself always uses
      // `advancePeriod`'s calendar-exact arithmetic).
      const billable = await db.query<SubscriptionRow>(sql`
        select * from ${subscriptions} where status in (${'active'}, ${'past_due'})`)
      const mrrByCurrency = new Map<string, number>()
      for (const row of billable.rows) {
        const subscription = decode(row)
        const monthly = monthlyValueMinor(subscription)
        mrrByCurrency.set(
          subscription.currency,
          (mrrByCurrency.get(subscription.currency) ?? 0) + monthly,
        )
      }

      const totalEver = active + pastDue + paused + cancelled
      const churnRate = totalEver === 0 ? 0 : cancelled / totalEver

      return {
        active,
        pastDue,
        paused,
        cancelled,
        mrrMinor: [...mrrByCurrency.entries()].map(([currency, amountMinor]) => ({
          currency,
          amountMinor: Math.round(amountMinor),
        })),
        churnRate,
      }
    },
  }
}

/** A subscription's price normalised to a monthly cadence, for MRR. */
function monthlyValueMinor(subscription: Subscription): number {
  const value = subscription.priceMinor * subscription.quantity
  const daysPerMonth = 365.25 / 12
  switch (subscription.intervalUnit) {
    case 'day':
      return (value / subscription.intervalCount) * daysPerMonth
    case 'week':
      return (value / (subscription.intervalCount * 7)) * daysPerMonth
    case 'month':
      return value / subscription.intervalCount
    case 'year':
      return value / (subscription.intervalCount * 12)
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
