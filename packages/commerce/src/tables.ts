import {
  type DatabaseDialect,
  type DatabaseHandle,
  identifier,
  type SqlFragment,
  sql,
  unsafeRaw,
} from '@cogenta/core'

/**
 * Every table contract E owns.
 *
 * Prefixed `cogenta_commerce_` rather than `cogenta_`: a site's content tables
 * are named after the collections **it** declares, so a shop that also declares
 * a `product` collection for the storefront page must not collide with the
 * commercial record of the same product. The two are deliberately different
 * objects (ADR draft 0023) and they must be able to coexist in one database.
 */
export const TABLES = {
  products: 'cogenta_commerce_products',
  variants: 'cogenta_commerce_variants',
  customers: 'cogenta_commerce_customers',
  carts: 'cogenta_commerce_carts',
  cartLines: 'cogenta_commerce_cart_lines',
  orders: 'cogenta_commerce_orders',
  orderLines: 'cogenta_commerce_order_lines',
  orderEvents: 'cogenta_commerce_order_events',
  orderEmails: 'cogenta_commerce_order_emails',
  payments: 'cogenta_commerce_payments',
  refunds: 'cogenta_commerce_refunds',
  taxRules: 'cogenta_commerce_tax_rules',
  shippingMethods: 'cogenta_commerce_shipping_methods',
  coupons: 'cogenta_commerce_coupons',
  couponRedemptions: 'cogenta_commerce_coupon_redemptions',
  // Fiche 53 task 2: a coupon's own restriction and per-customer counters.
  couponRestrictions: 'cogenta_commerce_coupon_restrictions',
  couponCustomerRedemptions: 'cogenta_commerce_coupon_customer_redemptions',
  invoices: 'cogenta_commerce_invoices',
  invoiceSequences: 'cogenta_commerce_invoice_sequences',
  creditNotes: 'cogenta_commerce_credit_notes',
  subscriptions: 'cogenta_commerce_subscriptions',
  subscriptionCycles: 'cogenta_commerce_subscription_cycles',
  // Fiche 53 task 3: one open dunning cycle per subscription.
  subscriptionDunning: 'cogenta_commerce_subscription_dunning',
  // Fiche 53 task 5: which billing period a renewal notice was already sent
  // for, so a repeated run never sends the same notice twice.
  subscriptionRenewalNotices: 'cogenta_commerce_subscription_renewal_notices',
} as const

/** `varchar` on Postgres/MySQL, `text` on SQLite — encapsulated once, here. */
function textColumn(dialect: DatabaseDialect, length: number): SqlFragment {
  return unsafeRaw(dialect === 'sqlite' ? 'text' : `varchar(${length})`)
}

function booleanColumn(dialect: DatabaseDialect): SqlFragment {
  return unsafeRaw(dialect === 'postgres' ? 'boolean' : 'tinyint')
}

/**
 * Every amount and every quantity is a `bigint`.
 *
 * `integer` would hold any realistic price, and it is still the wrong choice:
 * the one place a 32-bit overflow shows up is a yearly turnover total in a
 * minor-unit currency, i.e. exactly the number an accountant looks at. Eight
 * bytes to never think about it again.
 */
function integerColumn(): SqlFragment {
  return unsafeRaw('bigint')
}

/**
 * Creates everything this package owns, idempotently.
 *
 * Same shape as `ensureAuthTables`: `create table if not exists`, run once at
 * startup, so a fresh install and an upgrade take the same path. Commerce is
 * **not** part of contract A's migration engine on purpose — a site that never
 * sells anything never creates these tables, which is the whole point of
 * putting commerce in its own contract rather than raising `schema` to 3.0.
 */
export async function ensureCommerceTables(db: DatabaseHandle): Promise<void> {
  const d = db.dialect
  const t1024 = textColumn(d, 1024)
  const t255 = textColumn(d, 255)
  const t64 = textColumn(d, 64)
  const t8 = textColumn(d, 8)
  const bool = booleanColumn(d)
  const int = integerColumn()

  await db.query(sql`
    create table if not exists ${identifier(TABLES.products, d)} (
      id ${t64} not null primary key,
      -- Stable, human-readable, used in URLs and in the admin. Unique.
      handle ${t255} not null unique,
      title ${t255} not null,
      status ${t64} not null,
      -- The optional link to the editorial face of this product (contract A).
      -- Deliberately NOT a foreign key: the entries table of a collection is
      -- created by contract A's migration engine from the schema the *site*
      -- declares, so its name is not known here. Checked in application code.
      content_collection ${t255},
      content_entry_id ${t64},
      created_at ${t64} not null,
      updated_at ${t64} not null
    )`)

  await db.query(sql`
    create table if not exists ${identifier(TABLES.variants, d)} (
      id ${t64} not null primary key,
      product_id ${t64} not null,
      sku ${t255} not null unique,
      title ${t255} not null,
      price_minor ${int} not null,
      currency ${t8} not null,
      -- Units physically available. Never negative: every write that lowers it
      -- carries its own "on_hand >= quantity" guard (see catalog/store.ts).
      on_hand ${int} not null,
      -- When true this variant sells past zero. The guard is then skipped, and
      -- that is the *only* way on_hand goes below zero — an explicit choice
      -- per variant, never an accident.
      allow_backorder ${bool} not null,
      -- Grams. Integers again, and for the same reason as money.
      weight_grams ${int} not null,
      tax_category ${t64} not null,
      position ${int} not null,
      created_at ${t64} not null,
      updated_at ${t64} not null
    )`)

  await db.query(sql`
    create table if not exists ${identifier(TABLES.customers, d)} (
      id ${t64} not null primary key,
      email ${t255} not null unique,
      name ${t255},
      -- Optional link to a @cogenta/auth account. A customer is not a user:
      -- most shops sell to people who never sign in to the admin.
      user_id ${t64},
      created_at ${t64} not null,
      updated_at ${t64} not null
    )`)

  await db.query(sql`
    create table if not exists ${identifier(TABLES.carts, d)} (
      id ${t64} not null primary key,
      customer_id ${t64},
      -- An anonymous shopper. Opaque, supplied by the transport, never a
      -- session token of @cogenta/auth: a cart must survive signing out.
      session_key ${t255},
      currency ${t8} not null,
      coupon_code ${t64},
      shipping_country ${t8},
      shipping_region ${t64},
      shipping_method_id ${t64},
      status ${t64} not null,
      order_id ${t64},
      created_at ${t64} not null,
      updated_at ${t64} not null,
      expires_at ${t64} not null
    )`)

  await db.query(sql`
    create table if not exists ${identifier(TABLES.cartLines, d)} (
      id ${t64} not null primary key,
      cart_id ${t64} not null,
      variant_id ${t64} not null,
      quantity ${int} not null,
      -- The price when the line was added. A cart shows what the shopper was
      -- told; the order re-reads the live price and says so if it moved.
      unit_price_minor ${int} not null,
      created_at ${t64} not null,
      updated_at ${t64} not null
    )`)

  await db.query(sql`
    create table if not exists ${identifier(TABLES.orders, d)} (
      id ${t64} not null primary key,
      -- Human-facing order reference. Unique, and unrelated to the invoice
      -- number: an order that is never invoiced still needs to be named.
      reference ${t64} not null unique,
      customer_id ${t64},
      email ${t255} not null,
      status ${t64} not null,
      currency ${t8} not null,
      subtotal_minor ${int} not null,
      discount_minor ${int} not null,
      shipping_minor ${int} not null,
      tax_minor ${int} not null,
      total_minor ${int} not null,
      coupon_code ${t64},
      shipping_country ${t8},
      shipping_region ${t64},
      shipping_method_id ${t64},
      shipping_method_label ${t255},
      -- Structured delivery address (fiche 52 task 1) — the constat that
      -- opened this fiche: shipping_country/shipping_region alone (above)
      -- were the tax/rate *zone*, never a real address a courier can print on
      -- a label. All six nullable: an order placed before this address ever
      -- existed, or one nobody ever filled in, still reads back fine.
      shipping_address_line1 ${t255},
      shipping_address_line2 ${t255},
      shipping_city ${t255},
      shipping_postal_code ${t64},
      shipping_recipient ${t255},
      shipping_phone ${t64},
      -- Shipment tracking (fiche 52 task 4). Set together, by setTracking(),
      -- once goods actually leave — never guessed from the status alone,
      -- because "shipped" and "we know how" are two different facts.
      tracking_carrier ${t64},
      tracking_number ${t255},
      tracking_url ${t1024},
      shipped_at ${t64},
      placed_at ${t64} not null,
      updated_at ${t64} not null,
      -- Set when a subscription cycle produced this order, null otherwise.
      subscription_id ${t64}
    )`)

  await db.query(sql`
    create table if not exists ${identifier(TABLES.orderLines, d)} (
      id ${t64} not null primary key,
      order_id ${t64} not null,
      variant_id ${t64} not null,
      -- Copied, not joined. A product renamed or deleted next year must not
      -- change what an order from last year says it sold.
      sku ${t255} not null,
      title ${t255} not null,
      quantity ${int} not null,
      unit_price_minor ${int} not null,
      subtotal_minor ${int} not null,
      discount_minor ${int} not null,
      tax_minor ${int} not null,
      tax_rate_bp ${int} not null,
      total_minor ${int} not null,
      position ${int} not null
    )`)

  await db.query(sql`
    create table if not exists ${identifier(TABLES.orderEvents, d)} (
      id ${t64} not null primary key,
      order_id ${t64} not null,
      at ${t64} not null,
      kind ${t64} not null,
      from_status ${t64},
      to_status ${t64},
      actor_id ${t64},
      note ${t1024}
    )`)

  await db.query(sql`
    create table if not exists ${identifier(TABLES.orderEmails, d)} (
      id ${t64} not null primary key,
      order_id ${t64} not null,
      -- 'confirmation' | 'shipment' (order/notify.ts's OrderEmailKind) — a
      -- closed vocabulary kept as free text, the same choice this whole
      -- package makes for every other status/kind column.
      kind ${t64} not null,
      to_email ${t255} not null,
      -- 'pending' | 'sent' | 'failed' — 'failed' is retried by flushDue()
      -- until MAX_ATTEMPTS, never resurrected after.
      status ${t64} not null,
      attempts ${int} not null,
      last_error ${t1024},
      created_at ${t64} not null,
      sent_at ${t64}
    )`)

  await db.query(sql`
    create table if not exists ${identifier(TABLES.payments, d)} (
      id ${t64} not null primary key,
      order_id ${t64} not null,
      driver ${t64} not null,
      -- The gateway's own id. Null for a driver that settles offline until a
      -- human records the transfer reference.
      external_id ${t255},
      status ${t64} not null,
      amount_minor ${int} not null,
      currency ${t8} not null,
      -- Free-form, driver-specific, shown to the shopper: bank details for a
      -- transfer, a redirect URL for a gateway.
      instructions ${t1024},
      created_at ${t64} not null,
      updated_at ${t64} not null
    )`)

  await db.query(sql`
    create table if not exists ${identifier(TABLES.refunds, d)} (
      id ${t64} not null primary key,
      payment_id ${t64} not null,
      order_id ${t64} not null,
      external_id ${t255},
      status ${t64} not null,
      amount_minor ${int} not null,
      currency ${t8} not null,
      reason ${t255},
      created_at ${t64} not null
    )`)

  await db.query(sql`
    create table if not exists ${identifier(TABLES.taxRules, d)} (
      id ${t64} not null primary key,
      -- Null country means "everywhere the more specific rules do not cover".
      country ${t8},
      region ${t64},
      tax_category ${t64} not null,
      name ${t255} not null,
      rate_bp ${int} not null,
      -- True when the catalogue price already contains this tax (the European
      -- convention). The order then shows the tax it *contains*, never adds it.
      included_in_price ${bool} not null,
      -- Higher wins. Makes "France, reduced rate" beat "anywhere, standard".
      priority ${int} not null,
      active ${bool} not null,
      created_at ${t64} not null
    )`)

  await db.query(sql`
    create table if not exists ${identifier(TABLES.shippingMethods, d)} (
      id ${t64} not null primary key,
      label ${t255} not null,
      country ${t8},
      region ${t64},
      kind ${t64} not null,
      currency ${t8} not null,
      amount_minor ${int} not null,
      per_kg_minor ${int} not null,
      free_over_minor ${int},
      -- Names a registered carrier driver, or null for a plain stored rate.
      carrier ${t64},
      position ${int} not null,
      active ${bool} not null,
      created_at ${t64} not null
    )`)

  await db.query(sql`
    create table if not exists ${identifier(TABLES.coupons, d)} (
      code ${t64} not null primary key,
      kind ${t64} not null,
      -- Basis points for a percentage coupon, minor units for a fixed one,
      -- ignored for free shipping. One column because a coupon has exactly
      -- one number, and three nullable ones would only invite two being set.
      value ${int} not null,
      currency ${t8},
      min_subtotal_minor ${int} not null,
      starts_at ${t64},
      ends_at ${t64},
      -- Null means unlimited. Zero means exhausted, not unlimited.
      max_redemptions ${int},
      redemptions ${int} not null,
      -- Fiche 53 task 2. Null means no per-customer cap. Enforced against
      -- ${identifier(TABLES.couponCustomerRedemptions, d)}, never against this
      -- column's own value — it only ever records the *limit*, never a count.
      max_redemptions_per_customer ${int},
      active ${bool} not null,
      created_at ${t64} not null
    )`)

  // A database whose `coupons` table predates the per-customer cap: `create
  // table if not exists` above is a no-op for it, so the column is added the
  // same way every other in-place table growth in this codebase is
  // (`menu-tables.ts`'s `location` column). Failure means the column already
  // exists — the only realistic cause once this function has already run
  // against this table — so it is swallowed exactly like the index
  // statements below.
  await db
    .query(
      sql`alter table ${identifier(TABLES.coupons, d)} add column ${identifier('max_redemptions_per_customer', d)} ${int}`,
    )
    .catch(() => undefined)

  await db.query(sql`
    create table if not exists ${identifier(TABLES.couponRedemptions, d)} (
      id ${t64} not null primary key,
      code ${t64} not null,
      order_id ${t64} not null unique,
      customer_id ${t64},
      at ${t64} not null
    )`)

  // One row per product a coupon is restricted to. No rows at all means
  // unrestricted — the common case, and the reason this is a join table
  // rather than a nullable column on `coupons` (a coupon can name several
  // products, and a nullable single column could only ever name one).
  await db.query(sql`
    create table if not exists ${identifier(TABLES.couponRestrictions, d)} (
      id ${t64} not null primary key,
      code ${t64} not null,
      product_id ${t64} not null,
      created_at ${t64} not null
    )`)

  // The atomic per-customer counter `redeem()` claims against (fiche 53 task
  // 2). Deliberately not a `count(*)` over `couponRedemptions` at redemption
  // time — a guarded single-row `UPDATE` is what stays atomic on Postgres,
  // MySQL/MariaDB and SQLite alike (the same reasoning as the stock guard in
  // `catalog/store.ts`), and an aggregate query is not a single row.
  await db.query(sql`
    create table if not exists ${identifier(TABLES.couponCustomerRedemptions, d)} (
      code ${t64} not null,
      customer_id ${t64} not null,
      count ${int} not null,
      created_at ${t64} not null,
      updated_at ${t64} not null,
      primary key (code, customer_id)
    )`)

  await db.query(sql`
    create table if not exists ${identifier(TABLES.invoices, d)} (
      id ${t64} not null primary key,
      -- One invoice per order. The unique constraint is the last line of
      -- defence behind the transaction: a double issue burns a number.
      order_id ${t64} not null unique,
      series ${t64} not null,
      seq ${int} not null,
      number ${t64} not null unique,
      issued_at ${t64} not null,
      currency ${t8} not null,
      total_minor ${int} not null,
      -- The whole document, frozen at issue. An invoice must say what it said
      -- the day it was issued, whatever the order becomes afterwards.
      document text not null
    )`)

  await db.query(sql`
    create table if not exists ${identifier(TABLES.invoiceSequences, d)} (
      series ${t64} not null primary key,
      next_seq ${int} not null
    )`)

  await db.query(sql`
    create table if not exists ${identifier(TABLES.creditNotes, d)} (
      id ${t64} not null primary key,
      order_id ${t64} not null,
      -- One credit note per refund, never per order: an order can be
      -- refunded in several instalments, and each one gets its own
      -- sequential, never-reused number (fiche 52 task 6).
      refund_id ${t64} not null unique,
      series ${t64} not null,
      seq ${int} not null,
      number ${t64} not null unique,
      issued_at ${t64} not null,
      currency ${t8} not null,
      amount_minor ${int} not null,
      reason ${t1024},
      document text not null
    )`)

  await db.query(sql`
    create table if not exists ${identifier(TABLES.subscriptions, d)} (
      id ${t64} not null primary key,
      customer_id ${t64} not null,
      variant_id ${t64} not null,
      quantity ${int} not null,
      status ${t64} not null,
      interval_unit ${t64} not null,
      interval_count ${int} not null,
      price_minor ${int} not null,
      currency ${t8} not null,
      payment_driver ${t64} not null,
      current_period_start ${t64} not null,
      current_period_end ${t64} not null,
      -- The clock this store reads to decide what is due. Kept as its own
      -- column rather than derived, so a paused subscription simply stops
      -- moving it forward.
      next_billing_at ${t64} not null,
      shipping_country ${t8},
      shipping_region ${t64},
      created_at ${t64} not null,
      updated_at ${t64} not null,
      cancelled_at ${t64}
    )`)

  await db.query(sql`
    create table if not exists ${identifier(TABLES.subscriptionCycles, d)} (
      id ${t64} not null primary key,
      subscription_id ${t64} not null,
      period_start ${t64} not null,
      period_end ${t64} not null,
      -- Unique per period: the guard that makes billing idempotent, so running
      -- the biller twice in one minute cannot charge twice.
      period_key ${t255} not null unique,
      order_id ${t64},
      status ${t64} not null,
      created_at ${t64} not null
    )`)

  // Fiche 53 task 3: at most one open dunning cycle per subscription — the
  // primary key is the whole guard against tracking two at once. `period_key`
  // is carried, not reinvented: it is the exact value `billOne` already
  // claimed for the order this cycle is trying to collect, so this table
  // never becomes a second source of truth about which period is which.
  // `next_retry_at` doubles as the compare-and-set field `runDunning` claims
  // against (same shape as `SCHEDULED_TASK_CLAIMS_TABLE` in
  // `@cogenta/schema`): null means either "claimed and being processed right
  // now" (transient) or "exhausted" (terminal, `suspended_at` tells the two
  // apart) — and either way the due-query (`next_retry_at <= now`) simply
  // never matches null, so a claimed-but-not-yet-resolved row can never be
  // picked up twice.
  await db.query(sql`
    create table if not exists ${identifier(TABLES.subscriptionDunning, d)} (
      subscription_id ${t64} not null primary key,
      order_id ${t64} not null,
      period_key ${t255} not null,
      failure_count ${int} not null,
      first_failed_at ${t64} not null,
      next_retry_at ${t64},
      last_reason ${t1024},
      suspended_at ${t64},
      created_at ${t64} not null,
      updated_at ${t64} not null
    )`)

  // Fiche 53 task 5: one row per (subscription, upcoming period) once a
  // renewal notice has actually been sent for it — the insert itself is the
  // claim (a duplicate insert hits the primary key and is swallowed by
  // `sendRenewalNotices`), so a rerun never notifies a subscriber twice for
  // the same renewal.
  await db.query(sql`
    create table if not exists ${identifier(TABLES.subscriptionRenewalNotices, d)} (
      subscription_id ${t64} not null,
      period_key ${t255} not null,
      sent_at ${t64} not null,
      primary key (subscription_id, period_key)
    )`)

  // Columns added to `orders` after it first shipped (fiche 52 tasks 1 and
  // 4). The `create table` above already declares them, which covers a fresh
  // install; a site whose `cogenta_commerce_orders` predates this fiche needs
  // them added in place. Same idiom as `menu-tables.ts`'s `location` column
  // and `theme-store.ts`'s `active_theme`: `alter table … add column`,
  // failure swallowed unconditionally. On a table this function already
  // created, the only realistic failure is "column already exists" — nothing
  // destructive is attempted, and every added column is nullable, so no
  // existing row is affected either way. This is deliberately outside
  // contract A's up/down migration engine (see this file's own header
  // comment) — there is no "down" for an additive, nullable column.
  const ordersTable = identifier(TABLES.orders, d)
  const orderColumnStatements: readonly SqlFragment[] = [
    sql`alter table ${ordersTable} add column shipping_address_line1 ${t255}`,
    sql`alter table ${ordersTable} add column shipping_address_line2 ${t255}`,
    sql`alter table ${ordersTable} add column shipping_city ${t255}`,
    sql`alter table ${ordersTable} add column shipping_postal_code ${t64}`,
    sql`alter table ${ordersTable} add column shipping_recipient ${t255}`,
    sql`alter table ${ordersTable} add column shipping_phone ${t64}`,
    sql`alter table ${ordersTable} add column tracking_carrier ${t64}`,
    sql`alter table ${ordersTable} add column tracking_number ${t255}`,
    sql`alter table ${ordersTable} add column tracking_url ${t1024}`,
    sql`alter table ${ordersTable} add column shipped_at ${t64}`,
  ]
  for (const statement of orderColumnStatements) {
    await db.query(statement).catch(() => undefined)
  }

  await ensureIndexes(db)
}

/**
 * Indexes for the reads this package actually performs.
 *
 * Created separately and after the tables, because `create index if not
 * exists` is the one piece of DDL the three dialects spell differently enough
 * to be worth isolating: MySQL before 8.0.29 has no `if not exists` for
 * indexes at all, so a duplicate-index error there is swallowed rather than
 * guarded against.
 */
async function ensureIndexes(db: DatabaseHandle): Promise<void> {
  const d = db.dialect
  const wanted: readonly (readonly [string, string, string])[] = [
    ['cogenta_commerce_variants_product', TABLES.variants, 'product_id'],
    ['cogenta_commerce_cart_lines_cart', TABLES.cartLines, 'cart_id'],
    ['cogenta_commerce_order_lines_order', TABLES.orderLines, 'order_id'],
    ['cogenta_commerce_order_events_order', TABLES.orderEvents, 'order_id'],
    ['cogenta_commerce_orders_customer', TABLES.orders, 'customer_id'],
    ['cogenta_commerce_payments_order', TABLES.payments, 'order_id'],
    ['cogenta_commerce_refunds_payment', TABLES.refunds, 'payment_id'],
    ['cogenta_commerce_cycles_subscription', TABLES.subscriptionCycles, 'subscription_id'],
    ['cogenta_commerce_coupon_restrictions_code', TABLES.couponRestrictions, 'code'],
    ['cogenta_commerce_dunning_next_retry', TABLES.subscriptionDunning, 'next_retry_at'],
    ['cogenta_commerce_order_emails_order', TABLES.orderEmails, 'order_id'],
    ['cogenta_commerce_credit_notes_order', TABLES.creditNotes, 'order_id'],
  ]

  for (const [name, table, column] of wanted) {
    const statement = sql`create index ${identifier(name, d)} on ${identifier(table, d)} (${identifier(column, d)})`
    try {
      await db.query(
        d === 'mysql'
          ? statement
          : sql`create index if not exists ${identifier(name, d)} on ${identifier(table, d)} (${identifier(column, d)})`,
      )
    } catch {
      // Already there. The only failure this swallows is "duplicate index",
      // and a genuinely broken schema fails loudly on the next real query
      // rather than here.
    }
  }
}
