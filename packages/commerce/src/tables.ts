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
  payments: 'cogenta_commerce_payments',
  refunds: 'cogenta_commerce_refunds',
  taxRules: 'cogenta_commerce_tax_rules',
  shippingMethods: 'cogenta_commerce_shipping_methods',
  coupons: 'cogenta_commerce_coupons',
  couponRedemptions: 'cogenta_commerce_coupon_redemptions',
  invoices: 'cogenta_commerce_invoices',
  invoiceSequences: 'cogenta_commerce_invoice_sequences',
  subscriptions: 'cogenta_commerce_subscriptions',
  subscriptionCycles: 'cogenta_commerce_subscription_cycles',
  /** A product's link to a term of a taxonomy the *site* declares (ADR-0022,
   * fiche 51 task 3) — not a foreign key for the same reason `content_ref` on
   * `products` is not one: the term table is named after a taxonomy this
   * package cannot know. A join row rather than a column on `products` because
   * a product may carry more than one term, the same "many" a `f.taxonomy`
   * field defaults to on a collection. */
  productTerms: 'cogenta_commerce_product_terms',
  /** Append-only. Every write that moves `on_hand` — a sale, a restock, a
   * stock take — leaves one row here and never edits or removes an earlier
   * one; the row is the audit trail, not a cache of the current count. */
  stockMovements: 'cogenta_commerce_stock_movements',
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
      active ${bool} not null,
      created_at ${t64} not null
    )`)

  await db.query(sql`
    create table if not exists ${identifier(TABLES.couponRedemptions, d)} (
      id ${t64} not null primary key,
      code ${t64} not null,
      order_id ${t64} not null unique,
      customer_id ${t64},
      at ${t64} not null
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

  await db.query(sql`
    create table if not exists ${identifier(TABLES.productTerms, d)} (
      id ${t64} not null primary key,
      product_id ${t64} not null,
      -- Names a taxonomy the *site* declares (ADR-0022) and a term inside it —
      -- neither is a foreign key here, for the same reason content_ref is not
      -- one on products: the term table belongs to a schema this package
      -- cannot know.
      taxonomy ${t64} not null,
      term_id ${t64} not null,
      created_at ${t64} not null
    )`)

  await db.query(sql`
    create table if not exists ${identifier(TABLES.stockMovements, d)} (
      id ${t64} not null primary key,
      variant_id ${t64} not null,
      -- Positive for stock added, negative for stock taken. Never rewritten:
      -- a mistake is corrected by a further movement, never by editing this
      -- row (fiche 51 task 4's "append-only, jamais modifiable").
      delta ${int} not null,
      -- The absolute count this movement left the variant at — read back
      -- without summing the whole history for a variant that has moved many
      -- times.
      balance_after ${int} not null,
      reason ${t64} not null,
      actor_id ${t64},
      -- Names what caused the movement (an order id, most often), when there
      -- is one. Free-form on purpose: a movement caused by a stock take has
      -- no such thing.
      reference_id ${t64},
      note ${t1024},
      created_at ${t64} not null
    )`)

  await ensureIndexes(db)
  await ensureColumns(db)
}

/**
 * Columns added after this package's first release, on tables that already
 * existed (fiche 51 tasks 4 and 5) — same pattern as `menu-tables.ts`'s own
 * `location` column: `create table if not exists` above is a no-op on a
 * database that already has `variants`, so the column is added here instead,
 * and a failure is swallowed because the only realistic cause on a table this
 * function has already run against is "the column is already there".
 */
async function ensureColumns(db: DatabaseHandle): Promise<void> {
  const d = db.dialect
  const variants = identifier(TABLES.variants, d)
  const int = integerColumn()

  const statements: SqlFragment[] = [
    // Task 4: a variant with no threshold set (the default, and every
    // variant created before this column existed) is never "low stock" —
    // absence means "not watched", not "watched at zero".
    sql`alter table ${variants} add column ${identifier('low_stock_threshold', d)} ${int}`,
    // Task 5: the "was" price shown struck through, and the window during
    // which it applies. All three null together means "no promotion" — the
    // state every variant is already in.
    sql`alter table ${variants} add column ${identifier('compare_at_price_minor', d)} ${int}`,
    sql`alter table ${variants} add column ${identifier('sale_starts_at', d)} ${textColumn(d, 64)}`,
    sql`alter table ${variants} add column ${identifier('sale_ends_at', d)} ${textColumn(d, 64)}`,
    // Task 5: physical dimensions, in millimetres — integers for the same
    // reason weight_grams already is (no decimal column means the same thing
    // on all three dialects, ADR-0006).
    sql`alter table ${variants} add column ${identifier('width_mm', d)} ${int}`,
    sql`alter table ${variants} add column ${identifier('height_mm', d)} ${int}`,
    sql`alter table ${variants} add column ${identifier('depth_mm', d)} ${int}`,
  ]

  for (const statement of statements) {
    await db.query(statement).catch(() => undefined)
  }
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
    ['cogenta_commerce_product_terms_product', TABLES.productTerms, 'product_id'],
    ['cogenta_commerce_stock_movements_variant', TABLES.stockMovements, 'variant_id'],
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

  // A product cannot carry the same term twice — the write side (`setProductTerms`)
  // already guarantees this by replacing the whole set, but the constraint is
  // what actually protects the data on a caller this package does not control.
  const productTermsUnique = identifier('cogenta_commerce_product_terms_unique', d)
  const productTermsTable = identifier(TABLES.productTerms, d)
  try {
    await db.query(
      d === 'mysql'
        ? sql`create unique index ${productTermsUnique} on ${productTermsTable} (${identifier('product_id', d)}, ${identifier('taxonomy', d)}, ${identifier('term_id', d)})`
        : sql`create unique index if not exists ${productTermsUnique} on ${productTermsTable} (${identifier('product_id', d)}, ${identifier('taxonomy', d)}, ${identifier('term_id', d)})`,
    )
  } catch {
    // Already there.
  }
}
