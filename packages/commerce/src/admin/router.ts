import { CogentaError, type DriverRegistry, isCogentaError } from '@cogenta/core'
import {
  applyProductsImport,
  exportProductsCsv,
  previewProductsImport,
  productsCsvTemplate,
} from '../catalog/csv.js'
import type { CatalogStore } from '../catalog/store.js'
import type { CouponStore } from '../coupon/store.js'
import { type Customer, type CustomerStore, encodeCustomerCursor } from '../customer/store.js'
import type { CreditNoteStore } from '../invoice/credit-note.js'
import type { InvoiceStore } from '../invoice/store.js'
import { type OrderExportRow, ordersToAccountingCsv, ordersToCsv } from '../order/csv.js'
import type { OrderEmailQueue } from '../order/notify.js'
import {
  encodeOrderCursor,
  type OrderStore,
  type PlaceManualOrderLineInput,
} from '../order/store.js'
import { ORDER_STATUSES, type OrderStatus, type ShippingAddress } from '../order/types.js'
import {
  MANUAL_PAYMENT_METHODS,
  type ManualPaymentMethod,
  type PaymentStore,
} from '../payment/store.js'
import type { PaymentConfig, PaymentGateway } from '../payment/types.js'
import { SHIPPING_KINDS, type ShippingKind, type ShippingStore } from '../shipping/store.js'
import {
  type IntervalUnit,
  SUBSCRIPTION_STATUSES,
  type Subscription,
  type SubscriptionStatus,
  type SubscriptionStore,
} from '../subscription/store.js'
import { type TaxStore, taxFor } from '../tax/store.js'
import { isUniqueViolation } from '../unique.js'
import { readCouponFields, readCouponKind } from './coupon-input.js'
import { customersOf, productsOfLines, shippingMethodOf } from './order-views.js'
import type { CommerceActor, CommercePermissionLayer } from './permissions.js'
import { COMMERCE_ANONYMOUS, COMMERCE_PERMISSIONS } from './permissions.js'

/**
 * The shop's back office, as a transport-free router.
 *
 * The same shape `@cogenta/api` uses: a request is a plain value in, a plain
 * value out, with nothing that listens on a port. That is what makes every
 * route testable without starting a server, and it keeps a Node adapter a
 * translation rather than a second implementation.
 *
 * Every route names the permission it needs and the layer decides (R4). No
 * route contains its own access check, and no store does either — a store that
 * decided who may call it would be a second, divergent policy.
 */
export interface CommerceRequest {
  readonly method: string
  readonly path: string
  readonly query?: Readonly<Record<string, string | undefined>>
  readonly body?: unknown
  /** Provider signature headers for the public payment notification route. */
  readonly headers?: Readonly<Record<string, string>>
}

export interface CommerceResponse {
  readonly status: number
  /**
   * JSON-serialisable for every route but two: `GET /invoices/{id}/pdf`
   * answers with a `Uint8Array`, and `GET /orders/export.csv` (fiche 52 task
   * 7) answers with a plain `string` of CSV text — no route ever answers
   * with a bare string otherwise. The transport adapter (`cogenta serve`)
   * checks for either shape and sends bytes/text rather than JSON — this
   * router does not know or care how its caller transports a response.
   */
  readonly body: unknown
}

/**
 * What the payment-drivers screen (fiche 34 task 3) needs to answer "which
 * gateway is active, is a key present, and does it actually work" — never the
 * key itself. `registry` is the same shape `cogenta doctor` already reads
 * from for cache/queue/storage; `config` is the resolved (never file-literal)
 * `PaymentConfig` so `available()`/`init()` can be asked for real, and
 * `testMode` is shown as-is: whether the shop is in production is a fact the
 * screen states, never infers from the shape of a key.
 */
export interface CommercePaymentAdminOptions {
  readonly registry: DriverRegistry<PaymentGateway, PaymentConfig>
  readonly config: PaymentConfig
  readonly testMode: boolean
  /** The public endpoint to register in the provider's dashboard. */
  readonly webhookUrl: string
}

export interface CommerceAdminRouterOptions {
  readonly catalog: CatalogStore
  readonly orders: OrderStore
  readonly customers: CustomerStore
  readonly payments: PaymentStore
  readonly coupons: CouponStore
  readonly invoices?: InvoiceStore
  /**
   * Credit notes (fiche 52 task 6) — absent exactly when `invoices` is,
   * since both need the same seller details and a shop without one has no
   * accounting document numbering to hand out for the other either.
   */
  readonly creditNotes?: CreditNoteStore
  /**
   * The transactional e-mail queue (fiche 52 task 2) — absent on a site that
   * never configured an e-mail transport (R1/R2): orders still place and
   * ship, nobody is ever notified.
   */
  readonly orderEmails?: OrderEmailQueue
  /** Absent on a site that never wires subscriptions — the routes then answer 404. */
  readonly subscriptions?: SubscriptionStore
  /** Tax zones/rates (fiche 34 task 1) — reuses the already-tested resolver, never a second implementation. */
  readonly tax: TaxStore
  /** Shipping zones/methods (fiche 34 task 2). */
  readonly shipping: ShippingStore
  /** Absent only in a test that does not care about the payment-drivers screen. */
  readonly payment?: CommercePaymentAdminOptions
  readonly permissions: CommercePermissionLayer
  readonly basePath?: string
}

export interface CommerceAdminRouter {
  handle(request: CommerceRequest, actor?: CommerceActor): Promise<CommerceResponse>
}

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  COMMERCE_PRODUCT_NOT_FOUND: 404,
  COMMERCE_VARIANT_NOT_FOUND: 404,
  COMMERCE_ORDER_NOT_FOUND: 404,
  COMMERCE_CART_NOT_FOUND: 404,
  COMMERCE_PAYMENT_NOT_FOUND: 404,
  COMMERCE_COUPON_NOT_FOUND: 404,
  COMMERCE_INVOICE_NOT_FOUND: 404,
  COMMERCE_SUBSCRIPTION_NOT_FOUND: 404,
  COMMERCE_SHIPPING_METHOD_UNKNOWN: 404,
  COMMERCE_TAX_RULE_UNKNOWN: 404,
  COMMERCE_CUSTOMER_NOT_FOUND: 404,
  COMMERCE_CREDIT_NOTE_NOT_FOUND: 404,
  COMMERCE_PRODUCT_INVALID: 400,
  COMMERCE_TRACKING_INVALID: 400,
  COMMERCE_CONFLICT: 409,
  COMMERCE_SKU_TAKEN: 409,
  COMMERCE_PRODUCT_HANDLE_TAKEN: 409,
  COMMERCE_COUPON_CODE_TAKEN: 409,
  COMMERCE_REFUND_NO_PAYMENT: 409,
  COMMERCE_PAYMENT_ALREADY_RECORDED: 409,
  COMMERCE_INVOICE_NOT_CONFIGURED: 409,
  COMMERCE_PAYMENT_NOT_CONFIGURED: 409,
  COMMERCE_REQUEST_INVALID: 400,
  COMMERCE_CUSTOMER_EMAIL_INVALID: 400,
  COMMERCE_INVOICE_ALREADY_ISSUED: 409,
  COMMERCE_CART_CLOSED: 409,
  COMMERCE_ORDER_TRANSITION_INVALID: 409,
  COMMERCE_ORDER_LOCKED: 409,
  COMMERCE_INVOICE_SEQUENCE_CONFLICT: 409,
  COMMERCE_AMOUNT_INVALID: 400,
  QUERY_INVALID: 400,
  COMMERCE_CURRENCY_INVALID: 400,
  COMMERCE_CURRENCY_MISMATCH: 400,
  COMMERCE_QUANTITY_INVALID: 400,
  COMMERCE_COUPON_INVALID: 400,
  COMMERCE_COUPON_EXHAUSTED: 409,
  COMMERCE_COUPON_CUSTOMER_EXHAUSTED: 409,
  COMMERCE_COUPON_NOT_APPLICABLE: 400,
  COMMERCE_TAX_RULE_INVALID: 400,
  COMMERCE_SHIPPING_UNAVAILABLE: 400,
  COMMERCE_SUBSCRIPTION_INVALID: 400,
  COMMERCE_REFUND_EXCEEDS_PAYMENT: 400,
  COMMERCE_PAYMENT_UNSUPPORTED: 400,
  COMMERCE_PAYMENT_SIGNATURE_INVALID: 403,
  COMMERCE_PAYMENT_FAILED: 400,
  // The driver registry's own vocabulary (fiche 34 task 3's "tester la
  // connexion") — a bad gateway on the far side, never this server's fault.
  DRIVER_UNAVAILABLE: 502,
  DRIVER_UNKNOWN: 502,
  DRIVER_INIT_FAILED: 502,
}

function errorResponse(error: unknown): CommerceResponse {
  // Safety net for any UNIQUE constraint a store did not pre-check: the person
  // gets a clear conflict, never a 500 carrying a SQL message. (The stores
  // report the ones they know — handle, SKU, coupon code — by their own codes.)
  if ((!isCogentaError(error) || error.code.startsWith('DB_')) && isUniqueViolation(error)) {
    return {
      status: 409,
      body: {
        error: {
          code: 'COMMERCE_CONFLICT',
          message: 'A record with the same unique value already exists.',
          hint: 'Choose a different value.',
        },
      },
    }
  }
  // A database failure carries the failing driver's own words ("UNIQUE
  // constraint failed: …table.column"). That is for the log, never for the
  // person at the screen — a known conflict is reported by its own code before
  // it ever gets here, and anything else is a fixed sentence.
  if (isCogentaError(error) && !error.code.startsWith('DB_')) {
    return {
      status: STATUS_BY_CODE[error.code] ?? 500,
      body: {
        error:
          error.hint === undefined
            ? { code: error.code, message: error.message }
            : { code: error.code, message: error.message, hint: error.hint },
      },
    }
  }
  // `details` is never serialised and an unexpected error is reduced to a
  // fixed sentence: an unplanned message can contain anything at all,
  // including a connection string.
  return {
    status: 500,
    body: { error: { code: 'INTERNAL', message: 'Something went wrong in the shop.' } },
  }
}

function readObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new CogentaError({
      code: 'COMMERCE_REQUEST_INVALID',
      message: 'This request needs a JSON object as its body.',
      hint: 'Send an object, not an array or a bare value.',
    })
  }
  return body as Record<string, unknown>
}

function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CogentaError({
      code: 'COMMERCE_REQUEST_INVALID',
      message: `"${key}" is required and must be a non-empty string.`,
      hint: `Add "${key}" to the request body.`,
    })
  }
  return value
}

function readOptionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key]
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function readOptionalInt(body: Record<string, unknown>, key: string): number | undefined {
  const value = body[key]
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined
}

function readOptionalBool(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = body[key]
  return typeof value === 'boolean' ? value : undefined
}

/**
 * Reads a field that is legitimately nullable — a threshold, a compare-at
 * price, a dimension — and tells "absent" (leave the current value alone)
 * from "explicitly null" (clear it) from "a real value" (set it), the same
 * three-way distinction `CatalogStore.updateVariant` itself already needs
 * (its own `input.x === undefined ? current.x : input.x` guards).
 */
function optionalField<T>(
  body: Record<string, unknown>,
  key: string,
  parse: (value: unknown) => T,
): Partial<Record<string, T>> {
  if (!(key in body)) return {}
  return { [key]: parse(body[key]) }
}

function nullableInt(value: unknown): number | null {
  if (value === null) return null
  if (typeof value === 'number' && Number.isInteger(value)) return value
  throw new CogentaError({
    code: 'COMMERCE_QUANTITY_INVALID',
    message: 'This field must be a whole number, or null to clear it.',
    hint: 'Send an integer, or null.',
  })
}

/** A variant's weight is a whole, non-negative number of grams — the shipping-by-weight arithmetic is integer. */
function wholeGrams(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new CogentaError({
      code: 'COMMERCE_QUANTITY_INVALID',
      message: 'The weight must be a whole, non-negative number of grams.',
      hint: 'Send grams as an integer, such as 250.',
    })
  }
  return value
}

function nullableContentRef(value: unknown): { collection: string; entryId: string } | null {
  if (value === null) return null
  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).collection === 'string' &&
    typeof (value as Record<string, unknown>).entryId === 'string'
  ) {
    const record = value as Record<string, unknown>
    return { collection: record.collection as string, entryId: record.entryId as string }
  }
  throw new CogentaError({
    code: 'COMMERCE_PRODUCT_INVALID',
    message: '"contentRef" must be { collection, entryId }, or null to unlink.',
    hint: 'Send { "collection": "…", "entryId": "…" }, or null.',
  })
}

/** A product's gallery — an array of media ids, or absent (left alone). */
function mediaIdArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    throw new CogentaError({
      code: 'COMMERCE_PRODUCT_INVALID',
      message: '"imageMediaIds" must be an array of media ids.',
      hint: 'Send an array of strings, in the order the gallery should show them.',
    })
  }
  return value.filter((item): item is string => typeof item === 'string')
}

/** A variant's own single photo — a media id, or `null` to clear it. */
function nullableMediaId(value: unknown): string | null {
  if (value === null) return null
  if (typeof value === 'string') return value
  throw new CogentaError({
    code: 'COMMERCE_PRODUCT_INVALID',
    message: '"imageMediaId" must be a media id, or null to clear it.',
    hint: 'Send a media library id, or null.',
  })
}

function nullableIsoString(value: unknown): string | null {
  if (value === null) return null
  if (typeof value === 'string' && value.trim() !== '') return value
  throw new CogentaError({
    code: 'COMMERCE_PRODUCT_INVALID',
    message: 'This field must be an ISO date string, or null to clear it.',
    hint: 'Send a date such as "2026-09-01T00:00:00.000Z", or null.',
  })
}

/** A query-string integer, or `undefined` for anything that is not a positive whole number. */
/** Orders/customers are bounded pages, rather than a truncated full list. */
function readListPageLimit(value: string | undefined): number {
  if (value === undefined) return 20
  const parsed = Number(value)
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: 'The commerce page size is invalid.',
      hint: 'Choose an integer limit between 1 and 100, or omit it for 20 rows.',
    })
  }
  return parsed
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

/** Same cap `@cogenta/api`'s redirect router uses for its own CSV import/export (fiche 51 task 6). */
const MAX_CSV_ROWS = 5000

function readInt(body: Record<string, unknown>, key: string): number {
  const value = body[key]
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new CogentaError({
      code: 'COMMERCE_AMOUNT_INVALID',
      message: `"${key}" is required and must be a whole number.`,
      hint: 'Money is sent in minor units — 19.99 euros is 1999.',
    })
  }
  return value
}

/**
 * Reads `body.shippingAddress` (fiche 52 task 1), if present. `undefined`
 * means "this request said nothing about the address" (leave it alone on an
 * update); an explicit `null` on the wire is honoured too, by returning
 * `null` — "clear the address" — rather than being swallowed by `undefined`.
 */
function readShippingAddress(body: Record<string, unknown>): ShippingAddress | null | undefined {
  const value = body.shippingAddress
  if (value === undefined) return undefined
  if (value === null) return null
  const address = readObject(value)
  return {
    line1: readString(address, 'line1'),
    city: readString(address, 'city'),
    postalCode: readString(address, 'postalCode'),
    line2: readOptionalString(address, 'line2') ?? null,
    recipient: readOptionalString(address, 'recipient') ?? null,
    phone: readOptionalString(address, 'phone') ?? null,
  }
}

/**
 * An optional integer that must be an integer when present — unlike
 * `readOptionalInt`, which silently ignores `12.5`. A float where whole units
 * were expected is a caller bug worth refusing out loud.
 */
function strictOptionalInt(body: Record<string, unknown>, key: string): number | undefined {
  if (!(key in body) || body[key] === undefined || body[key] === null) return undefined
  const value = body[key]
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new CogentaError({
      code: 'COMMERCE_REQUEST_INVALID',
      message: `"${key}" must be a whole number.`,
      hint: 'Money is sent in minor units — 19.99 euros is 1999.',
      details: { field: key },
    })
  }
  return value
}

/** `2026-11-01` becomes the ISO instant at the start of that day (UTC); anything else is passed through for the store to judge. */
function dateOnlyToIso(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? `${value}T00:00:00.000Z` : value
}

export function createCommerceAdminRouter(
  options: CommerceAdminRouterOptions,
): CommerceAdminRouter {
  const basePath = (options.basePath ?? '/api/commerce').replace(/(?<!\/)\/+$/u, '')
  const { permissions } = options

  /**
   * A customer's own fiche (fiche 52 task 3): their record plus every order
   * they placed and what they spent on it. `orders.list({ customerId })`
   * already exists and is already permission-agnostic at the store layer, so
   * this is aggregation, not a new query engine.
   */
  async function customerDetail(customer: Customer): Promise<{
    readonly customer: Customer
    readonly orders: Awaited<ReturnType<OrderStore['list']>>
    readonly totalSpentMinor: number
    readonly currency: string | null
    readonly subscriptions: Awaited<ReturnType<SubscriptionStore['list']>>
  }> {
    const orders = await options.orders.list({ customerId: customer.id, limit: 500 })
    const spendable = orders.filter(
      (order) => order.status !== 'cancelled' && order.status !== 'refunded',
    )
    const totalSpentMinor = spendable.reduce((sum, order) => sum + order.totalMinor, 0)
    const subscriptions =
      options.subscriptions === undefined
        ? []
        : (await options.subscriptions.list()).filter(
            (subscription) => subscription.customerId === customer.id,
          )
    return {
      customer,
      orders,
      totalSpentMinor,
      currency: spendable[0]?.currency ?? orders[0]?.currency ?? null,
      subscriptions,
    }
  }

  /**
   * The people and products behind a set of subscriptions, by id — so a list
   * can say "Marie Durand · T-shirt bleu (TSH-BL)" instead of two UUIDs.
   */
  async function describeSubscriptions(list: readonly Subscription[]): Promise<{
    readonly customers: Record<string, { id: string; email: string; name: string | null }>
    readonly variants: Record<
      string,
      {
        id: string
        sku: string
        title: string
        productId: string
        productTitle: string
        priceMinor: number
        currency: string
        imageMediaId: string | null
      }
    >
  }> {
    const customers: Record<string, { id: string; email: string; name: string | null }> = {}
    const variants: Record<
      string,
      {
        id: string
        sku: string
        title: string
        productId: string
        productTitle: string
        priceMinor: number
        currency: string
        imageMediaId: string | null
      }
    > = {}
    for (const customerId of new Set(list.map((subscription) => subscription.customerId))) {
      const customer = await options.customers.read(customerId)
      if (customer !== null) {
        customers[customerId] = { id: customer.id, email: customer.email, name: customer.name }
      }
    }
    for (const variantId of new Set(list.map((subscription) => subscription.variantId))) {
      const variant = await options.catalog.readVariant(variantId)
      if (variant === null) continue
      const product = await options.catalog.readProduct(variant.productId)
      variants[variantId] = {
        id: variant.id,
        sku: variant.sku,
        title: variant.title,
        productId: variant.productId,
        productTitle: product?.title ?? variant.title,
        priceMinor: variant.priceMinor,
        currency: variant.currency,
        imageMediaId: variant.imageMediaId ?? product?.imageMediaIds[0] ?? null,
      }
    }
    return { customers, variants }
  }

  /**
   * A payment that just landed may open subscriptions (a recurring variant in
   * the order). Idempotent, and never allowed to fail the payment that
   * triggered it: the scheduler's sweep (`openFromPaidOrders`) retries.
   */
  async function openSubscriptionsFor(orderId: string): Promise<void> {
    if (options.subscriptions === undefined) return
    try {
      await options.subscriptions.createFromOrder(orderId)
    } catch {
      // Left to the scheduler's sweep.
    }
  }

  return {
    handle: async (request, actor = COMMERCE_ANONYMOUS) => {
      try {
        if (!request.path.startsWith(basePath)) {
          return { status: 404, body: { error: { code: 'COMMERCE_ORDER_NOT_FOUND' } } }
        }

        const segments = request.path
          .slice(basePath.length)
          .split('/')
          .filter((segment) => segment !== '')
        const method = request.method.toUpperCase()

        // Provider authentication replaces a CMS session on this one public
        // write route. PaymentStore verifies the untouched body before any DB write.
        if (segments[0] === 'payments' && segments[1] === 'webhook' && segments.length === 2) {
          if (method !== 'POST')
            return { status: 405, body: { error: { code: 'METHOD_NOT_ALLOWED' } } }
          if (typeof request.body !== 'string') {
            throw new CogentaError({
              code: 'COMMERCE_PAYMENT_SIGNATURE_INVALID',
              message: 'The payment notification body could not be verified.',
              hint: 'Send the original provider request body and its signature headers.',
            })
          }
          await options.payments.handleWebhook(request.body, request.headers ?? {})
          // No payment/customer details on an endpoint without a CMS session.
          return { status: 200, body: { received: true } }
        }

        // ---- permissions ----------------------------------------------------
        // Read-only, and deliberately not gated behind a write permission: it
        // describes the vocabulary and the role grants this very layer
        // enforces (fiche 19's permission matrix), never anything that could
        // itself move money or edit the catalogue.
        if (segments.length === 1 && segments[0] === 'permissions') {
          if (method === 'GET') {
            permissions.assert('commerce.read', actor)
            return {
              status: 200,
              body: { permissions: COMMERCE_PERMISSIONS, roles: permissions.roles },
            }
          }
        }

        // ---- products -----------------------------------------------------
        if (segments[0] === 'products' && segments.length === 1) {
          if (method === 'GET') {
            permissions.assert('commerce.read', actor)
            const query = request.query ?? {}
            // One row over the requested page: `hasMore` is then simply
            // "did the extra row show up", never a second `count(*)` query
            // (fiche 51 task 2 — the same technique `media-client.ts`'s
            // cursor pagination already uses, adapted to this offset-based
            // list rather than inventing a cursor for it).
            const requestedLimit = parsePositiveInt(query.limit) ?? 25
            const offset = parsePositiveInt(query.offset) ?? 0
            const sort =
              query.sort === 'title' || query.sort === 'handle' ? query.sort : 'createdAt'
            const direction = query.direction === 'asc' ? 'asc' : 'desc'

            const page = await options.catalog.listProducts({
              ...(query.status === 'active' || query.status === 'archived'
                ? { status: query.status }
                : {}),
              ...(query.q === undefined || query.q === '' ? {} : { search: query.q }),
              sort,
              direction,
              limit: requestedLimit + 1,
              offset,
            })
            const hasMore = page.length > requestedLimit
            return {
              status: 200,
              body: { products: hasMore ? page.slice(0, requestedLimit) : page, hasMore },
            }
          }
          if (method === 'POST') {
            permissions.assert('commerce.catalog.write', actor)
            const body = readObject(request.body)
            return {
              status: 201,
              body: await options.catalog.createProduct({
                handle: readString(body, 'handle'),
                title: readString(body, 'title'),
                ...optionalField(body, 'imageMediaIds', mediaIdArray),
              }),
            }
          }
        }

        // The catalogue's CSV export (fiche 51 task 6) — checked ahead of the
        // generic `/products/:id` route below, the same way `export`/`import`
        // are ordered ahead of `:id` on `@cogenta/api`'s redirect router.
        if (segments[0] === 'products' && segments[1] === 'export' && segments.length === 2) {
          if (method === 'GET') {
            permissions.assert('commerce.read', actor)
            // A file to start from: the header and one worked example.
            if (request.query?.template === '1') {
              return {
                status: 200,
                body: { csv: productsCsvTemplate(), filename: 'products-template.csv' },
              }
            }
            const products = await options.catalog.listProducts({ limit: MAX_CSV_ROWS })
            const variantsByProduct = new Map(
              await Promise.all(
                products.map(
                  async (product) =>
                    [product.id, await options.catalog.listVariants(product.id)] as const,
                ),
              ),
            )
            return {
              status: 200,
              body: {
                csv: exportProductsCsv(products, variantsByProduct),
                filename: 'products.csv',
              },
            }
          }
        }

        if (segments[0] === 'products' && segments[1] === 'import' && segments.length === 2) {
          if (method === 'POST') {
            permissions.assert('commerce.catalog.write', actor)
            const body = readObject(request.body)
            const csv = readString(body, 'csv')
            const apply = body.apply === true
            return {
              status: 200,
              body: apply
                ? await applyProductsImport(csv, options.catalog, MAX_CSV_ROWS)
                : await previewProductsImport(csv, options.catalog, MAX_CSV_ROWS),
            }
          }
        }

        // The reverse of `contentRef` — what the content editor's own
        // cross-link (fiche 51 task 1) asks to find "is there a commercial
        // record for the entry I am looking at right now".
        if (segments[0] === 'products' && segments[1] === 'by-content' && segments.length === 2) {
          if (method === 'GET') {
            permissions.assert('commerce.read', actor)
            const collection = request.query?.collection
            const entryId = request.query?.entryId
            if (collection === undefined || entryId === undefined) {
              return { status: 200, body: { product: null } }
            }
            return {
              status: 200,
              body: { product: await options.catalog.readProductByContentRef(collection, entryId) },
            }
          }
        }

        if (segments[0] === 'products' && segments.length === 2) {
          const id = segments[1] ?? ''
          if (method === 'GET') {
            permissions.assert('commerce.read', actor)
            const product = await options.catalog.readProduct(id)
            if (product === null) return notFound('product')
            return {
              status: 200,
              body: {
                product,
                variants: await options.catalog.listVariants(id),
                terms: await options.catalog.listProductTerms(id),
              },
            }
          }
          if (method === 'PATCH') {
            permissions.assert('commerce.catalog.write', actor)
            const body = readObject(request.body)
            return {
              status: 200,
              body: await options.catalog.updateProduct(id, {
                ...(typeof body.handle === 'string' ? { handle: body.handle } : {}),
                ...(typeof body.title === 'string' ? { title: body.title } : {}),
                ...(body.status === 'active' || body.status === 'archived'
                  ? { status: body.status }
                  : {}),
                // Fiche 51 task 1: `null` unlinks, an object links, absence
                // leaves it alone — the same three-way distinction the
                // nullable variant fields above already need.
                ...optionalField(body, 'contentRef', nullableContentRef),
                ...optionalField(body, 'imageMediaIds', mediaIdArray),
              }),
            }
          }
          if (method === 'DELETE') {
            permissions.assert('commerce.catalog.write', actor)
            await options.catalog.archiveProduct(id)
            return { status: 204, body: null }
          }
        }

        // A product's classification against a taxonomy the site declares
        // (fiche 51 task 3, ADR-0022). Governed by `commerce.catalog.write`
        // — the same permission as every other catalogue edit — rather than
        // contract A's `canTerm`: categorising a product is catalogue work,
        // and reusing contract A's term permission here would couple this
        // router to a second, unrelated permission layer for one field.
        if (segments[0] === 'products' && segments[2] === 'terms' && segments.length === 3) {
          if (method === 'PUT') {
            permissions.assert('commerce.catalog.write', actor)
            const body = readObject(request.body)
            const taxonomy = readString(body, 'taxonomy')
            const termIds = Array.isArray(body.termIds)
              ? body.termIds.filter((value): value is string => typeof value === 'string')
              : []
            return {
              status: 200,
              body: {
                terms: await options.catalog.setProductTerms(segments[1] ?? '', taxonomy, termIds),
              },
            }
          }
        }

        // ---- variants -----------------------------------------------------
        // Checked ahead of the generic `/variants/:id` route below, the same
        // ordering discipline as `products/export` above.
        if (segments[0] === 'variants' && segments[1] === 'low-stock' && segments.length === 2) {
          if (method === 'GET') {
            permissions.assert('commerce.read', actor)
            return { status: 200, body: { variants: await options.catalog.listLowStock() } }
          }
        }

        // "Pick a product" by typing a SKU or a name (the manual-order and
        // subscription screens) — nobody should ever have to paste an internal id.
        if (segments[0] === 'variants' && segments[1] === 'search' && segments.length === 2) {
          if (method === 'GET') {
            permissions.assert('commerce.read', actor)
            const q = request.query?.q ?? ''
            if (q.trim() === '') return { status: 200, body: { hits: [] } }
            return {
              status: 200,
              body: {
                hits: await options.catalog.searchVariants(q, {
                  limit: parsePositiveInt(request.query?.limit) ?? 10,
                }),
              },
            }
          }
        }

        if (
          segments[0] === 'variants' &&
          segments[2] === 'stock-movements' &&
          segments.length === 3
        ) {
          if (method === 'GET') {
            permissions.assert('commerce.read', actor)
            return {
              status: 200,
              body: { movements: await options.catalog.listStockMovements(segments[1] ?? '') },
            }
          }
        }

        if (segments[0] === 'products' && segments[2] === 'variants' && segments.length === 3) {
          if (method === 'POST') {
            permissions.assert('commerce.catalog.write', actor)
            const body = readObject(request.body)
            return {
              status: 201,
              body: await options.catalog.createVariant({
                productId: segments[1] ?? '',
                sku: readString(body, 'sku'),
                title: readString(body, 'title'),
                priceMinor: readInt(body, 'priceMinor'),
                currency: readString(body, 'currency'),
                ...(typeof body.onHand === 'number' ? { onHand: body.onHand } : {}),
                ...(typeof body.allowBackorder === 'boolean'
                  ? { allowBackorder: body.allowBackorder }
                  : {}),
                ...(typeof body.weightGrams === 'number'
                  ? { weightGrams: wholeGrams(body.weightGrams) }
                  : {}),
                ...(typeof body.taxCategory === 'string' ? { taxCategory: body.taxCategory } : {}),
                ...optionalField(body, 'lowStockThreshold', nullableInt),
                ...optionalField(body, 'compareAtPriceMinor', nullableInt),
                ...optionalField(body, 'saleStartsAt', nullableIsoString),
                ...optionalField(body, 'saleEndsAt', nullableIsoString),
                ...optionalField(body, 'widthMm', nullableInt),
                ...optionalField(body, 'heightMm', nullableInt),
                ...optionalField(body, 'depthMm', nullableInt),
                ...optionalField(body, 'imageMediaId', nullableMediaId),
              }),
            }
          }
        }

        if (segments[0] === 'variants' && segments.length === 2) {
          const id = segments[1] ?? ''
          if (method === 'PATCH') {
            permissions.assert('commerce.catalog.write', actor)
            const body = readObject(request.body)
            return {
              status: 200,
              body: await options.catalog.updateVariant(id, {
                ...(typeof body.sku === 'string' ? { sku: body.sku } : {}),
                ...(typeof body.title === 'string' ? { title: body.title } : {}),
                ...(typeof body.priceMinor === 'number' ? { priceMinor: body.priceMinor } : {}),
                ...(typeof body.allowBackorder === 'boolean'
                  ? { allowBackorder: body.allowBackorder }
                  : {}),
                ...(typeof body.weightGrams === 'number'
                  ? { weightGrams: wholeGrams(body.weightGrams) }
                  : {}),
                ...(typeof body.taxCategory === 'string' ? { taxCategory: body.taxCategory } : {}),
                ...(typeof body.position === 'number' ? { position: body.position } : {}),
                ...optionalField(body, 'lowStockThreshold', nullableInt),
                ...optionalField(body, 'compareAtPriceMinor', nullableInt),
                ...optionalField(body, 'saleStartsAt', nullableIsoString),
                ...optionalField(body, 'saleEndsAt', nullableIsoString),
                ...optionalField(body, 'widthMm', nullableInt),
                ...optionalField(body, 'heightMm', nullableInt),
                ...optionalField(body, 'depthMm', nullableInt),
                ...optionalField(body, 'imageMediaId', nullableMediaId),
              }),
            }
          }
          if (method === 'DELETE') {
            permissions.assert('commerce.catalog.write', actor)
            await options.catalog.deleteVariant(id)
            return { status: 204, body: null }
          }
        }

        // Stock is its own route, never a field on the variant PATCH. A form
        // rendered a minute ago must not be able to overwrite a sale that
        // happened since.
        if (segments[0] === 'variants' && segments[2] === 'stock' && segments.length === 3) {
          if (method === 'PUT') {
            permissions.assert('commerce.catalog.write', actor)
            const body = readObject(request.body)
            return {
              status: 200,
              body: await options.catalog.setStock(segments[1] ?? '', readInt(body, 'onHand'), {
                actorId: actor.id,
              }),
            }
          }
        }

        // ---- orders -------------------------------------------------------
        // Checked before the generic list/detail routes below, since both
        // share the `orders`/length-1 or length-2 shape: an accounting CSV
        // export (fiche 52 task 7) is not an order whose id happens to be
        // "export.csv".
        if (segments[0] === 'orders' && segments[1] === 'export.csv' && segments.length === 2) {
          if (method === 'GET') {
            permissions.assert('commerce.read', actor)
            const query = request.query ?? {}
            const status = query.status
            const q = query.q
            const orders = await options.orders.list({
              ...((ORDER_STATUSES as readonly string[]).includes(status ?? '')
                ? { status: status as OrderStatus }
                : {}),
              // Audit T-COM-03: `q` already narrows `GET /orders` (the list
              // route above) by reference/e-mail — the export ignored it
              // entirely, so a search that found three orders on screen
              // still exported all of them.
              ...(q === undefined || q === '' ? {} : { search: q }),
              ...(query.from === undefined ? {} : { placedFrom: query.from }),
              ...(query.to === undefined ? {} : { placedTo: query.to }),
              limit: 5000,
            })
            const customerNames = await customersOf(options, orders)
            const rows: OrderExportRow[] = []
            for (const order of orders) {
              const invoice = await options.invoices?.readByOrder(order.id)
              rows.push({
                order,
                invoiceNumber: invoice?.number ?? null,
                customerName:
                  order.customerId === null
                    ? null
                    : (customerNames[order.customerId]?.name ?? null),
              })
            }
            // `?format=accounting`: the French spreadsheet layout. Without it
            // the stable machine format (minor units, English) is unchanged.
            return {
              status: 200,
              body: query.format === 'accounting' ? ordersToAccountingCsv(rows) : ordersToCsv(rows),
            }
          }
        }

        if (segments[0] === 'orders' && segments.length === 1 && method === 'GET') {
          permissions.assert('commerce.read', actor)
          const query = request.query ?? {}
          const status = query.status
          const q = query.q
          const pageLimit = readListPageLimit(query.limit)
          const result = await options.orders.list({
            ...((ORDER_STATUSES as readonly string[]).includes(status ?? '')
              ? { status: status as OrderStatus }
              : {}),
            ...(q === undefined || q === '' ? {} : { search: q }),
            ...(query.from === undefined ? {} : { placedFrom: query.from }),
            ...(query.to === undefined ? {} : { placedTo: query.to }),
            ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
            limit: pageLimit + 1,
          })
          const orders = result.slice(0, pageLimit)
          const last = orders.at(-1)
          const hasMore = result.length > pageLimit
          return {
            status: 200,
            body: {
              orders,
              // Who each order belongs to, by customer id — so a list shows a
              // name rather than only an e-mail.
              customers: await customersOf(options, orders),
              page: {
                limit: pageLimit,
                hasMore,
                nextCursor: hasMore && last !== undefined ? encodeOrderCursor(last) : null,
              },
            },
          }
        }

        // A shopkeeper-entered order (fiche 52 task 5) — a phone order, a
        // trade-show sale, or a correction. `placeManual` reuses `place()`
        // internally (see `order/store.ts`), so this route never duplicates
        // stock-taking, pricing or coupon logic.
        if (segments[0] === 'orders' && segments.length === 1 && method === 'POST') {
          permissions.assert('commerce.order.write', actor)
          const body = readObject(request.body)
          const rawLines = body.lines
          if (!Array.isArray(rawLines) || rawLines.length === 0) {
            throw new CogentaError({
              code: 'COMMERCE_AMOUNT_INVALID',
              message: '"lines" is required and must be a non-empty array.',
              hint: 'Each line needs { variantId, quantity }.',
            })
          }
          const lines: PlaceManualOrderLineInput[] = rawLines.map((entry) => {
            const line = readObject(entry)
            return { variantId: readString(line, 'variantId'), quantity: readInt(line, 'quantity') }
          })
          const customerName = readOptionalString(body, 'customerName')
          const shippingAddress = readShippingAddress(body)
          const country = readOptionalString(body, 'shippingCountry')
          const region = readOptionalString(body, 'shippingRegion')
          const shippingMethodId = readOptionalString(body, 'shippingMethodId')
          const couponCode = readOptionalString(body, 'couponCode')
          // Read before anything is placed, so a bad `paid` block refuses the
          // whole request rather than leaving an order half-recorded.
          const paid = readManualPayment(body.paid)
          const outcome = await options.orders.placeManual({
            email: readString(body, 'email'),
            currency: readString(body, 'currency'),
            lines,
            actorId: actor.id,
            ...(customerName === undefined ? {} : { customerName }),
            ...(shippingAddress === undefined ? {} : { shippingAddress }),
            ...(country === undefined ? {} : { shippingCountry: country }),
            ...(region === undefined ? {} : { shippingRegion: region }),
            ...(shippingMethodId === undefined ? {} : { shippingMethodId }),
            ...(couponCode === undefined ? {} : { couponCode }),
          })
          if (outcome.kind === 'placed') {
            if (paid !== null) {
              permissions.assert('commerce.payment.settle', actor)
              await options.payments.recordManual(outcome.order.id, {
                method: paid.method,
                ...(paid.note === undefined ? {} : { note: paid.note }),
                actorId: actor.id,
              })
              await openSubscriptionsFor(outcome.order.id)
            }
            if (options.orderEmails !== undefined) {
              await options.orderEmails.enqueue(outcome.order.id, 'confirmation')
            }
            // Re-read: recording the payment moved the order to `paid`.
            const placed = (await options.orders.read(outcome.order.id)) ?? outcome.order
            return { status: 201, body: { kind: 'placed', order: placed } }
          }
          return { status: 200, body: outcome }
        }

        if (segments[0] === 'orders' && segments.length === 2 && method === 'GET') {
          permissions.assert('commerce.read', actor)
          const order = await options.orders.read(segments[1] ?? '')
          if (order === null) return notFound('order')
          const [customer] = Object.values(await customersOf(options, [order]))
          return {
            status: 200,
            body: {
              order,
              history: await options.orders.history(order.id),
              payments: await options.payments.listForOrder(order.id),
              customer: customer ?? null,
              products: await productsOfLines(options, order),
              shippingMethod: await shippingMethodOf(options, order),
              // Carried here so opening an order does not need a second call
              // that answers 404 for every order without an invoice.
              invoice: (await options.invoices?.readByOrder(order.id)) ?? null,
              invoicing: {
                available: options.invoices !== undefined,
                configured: (await options.invoices?.configured()) ?? false,
              },
            },
          }
        }

        // Corrects the e-mail/address before payment (fiche 52 task 5,
        // "modification pré-paiement") — locked by `OrderStore.update` once
        // the order is no longer `pending`.
        if (segments[0] === 'orders' && segments.length === 2 && method === 'PATCH') {
          permissions.assert('commerce.order.write', actor)
          const body = readObject(request.body)
          const email = readOptionalString(body, 'email')
          const shippingAddress = readShippingAddress(body)
          return {
            status: 200,
            body: await options.orders.update(
              segments[1] ?? '',
              {
                ...(email === undefined ? {} : { email }),
                ...(shippingAddress === undefined ? {} : { shippingAddress }),
              },
              { actorId: actor.id },
            ),
          }
        }

        if (segments[0] === 'orders' && segments[2] === 'status' && segments.length === 3) {
          if (method === 'PUT') {
            permissions.assert('commerce.order.write', actor)
            const body = readObject(request.body)
            const to = readString(body, 'status')
            if (!(ORDER_STATUSES as readonly string[]).includes(to)) {
              throw new CogentaError({
                code: 'COMMERCE_ORDER_TRANSITION_INVALID',
                message: `"${to}" is not an order status.`,
                hint: `Use one of: ${ORDER_STATUSES.join(', ')}.`,
              })
            }
            const orderId = segments[1] ?? ''
            const note = typeof body.note === 'string' ? body.note : undefined

            // "Paid" is a payment, not a label: marking an order paid records
            // the money (as a manual payment) so the order, its payments and
            // its invoice can never disagree about whether it was paid.
            if (to === 'paid') {
              const current = await options.orders.read(orderId)
              if (current?.status === 'pending') {
                permissions.assert('commerce.payment.settle', actor)
                await options.payments.recordManual(orderId, {
                  method: 'other',
                  ...(note === undefined ? {} : { note }),
                  actorId: actor.id,
                })
                await openSubscriptionsFor(orderId)
                const paidOrder = await options.orders.read(orderId)
                return { status: 200, body: paidOrder }
              }
            }

            // "Refunded" is money going back, so it is only reachable through
            // a collected payment: the remaining amount is refunded in full.
            // (A partial refund goes through `POST /payments/{id}/refund`.)
            if (to === 'refunded') {
              permissions.assert('commerce.order.refund', actor)
              const current = await options.orders.read(orderId)
              if (current === null) return notFound('order')
              const refundable = await refundablePayment(options.payments, orderId)
              if (refundable === null) {
                throw new CogentaError({
                  code: 'COMMERCE_REFUND_NO_PAYMENT',
                  message: 'This order has no collected payment, so there is nothing to refund.',
                  hint: 'Record the payment first, or cancel the order instead.',
                })
              }
              await issueRefund(options, actor, refundable.payment.id, refundable.remainingMinor, {
                reason: note ?? 'Refund of the whole order',
              })
              return { status: 200, body: await options.orders.read(orderId) }
            }

            const updated = await options.orders.transition(orderId, to as OrderStatus, {
              actorId: actor.id,
              ...(note === undefined ? {} : { note }),
            })
            return { status: 200, body: updated }
          }
        }

        // Shipment tracking (fiche 52 task 4). Setting it on a paid order
        // also moves the order to `shipped` (see `OrderStore.setTracking`),
        // which is what fires the shipment e-mail below.
        if (segments[0] === 'orders' && segments[2] === 'tracking' && segments.length === 3) {
          if (method === 'PUT') {
            permissions.assert('commerce.order.write', actor)
            const body = readObject(request.body)
            const url = readOptionalString(body, 'url')
            const before = await options.orders.read(segments[1] ?? '')
            const updated = await options.orders.setTracking(
              segments[1] ?? '',
              {
                carrier: readString(body, 'carrier'),
                number: readString(body, 'number'),
                ...(url === undefined ? {} : { url }),
              },
              { actorId: actor.id },
            )
            if (before?.status === 'paid' && updated.status === 'shipped' && options.orderEmails) {
              await options.orderEmails.enqueue(updated.id, 'shipment')
            }
            return { status: 200, body: updated }
          }
        }

        if (segments[0] === 'orders' && segments[2] === 'emails' && segments.length === 3) {
          if (method === 'GET') {
            permissions.assert('commerce.read', actor)
            if (options.orderEmails === undefined) return { status: 200, body: { emails: [] } }
            return {
              status: 200,
              body: { emails: await options.orderEmails.listForOrder(segments[1] ?? '') },
            }
          }
        }

        if (segments[0] === 'orders' && segments[2] === 'credit-notes' && segments.length === 3) {
          if (method === 'GET') {
            permissions.assert('commerce.read', actor)
            if (options.creditNotes === undefined) return { status: 200, body: { creditNotes: [] } }
            return {
              status: 200,
              body: { creditNotes: await options.creditNotes.listForOrder(segments[1] ?? '') },
            }
          }
        }

        // ---- payments -----------------------------------------------------
        // "The money arrived" by a means this shop cannot see (bank transfer,
        // cash, cheque, card terminal) — records the payment and moves the
        // order to `paid`. Money in: the same permission as `settle`.
        if (segments[0] === 'orders' && segments[2] === 'payments' && segments.length === 3) {
          if (method === 'POST') {
            permissions.assert('commerce.payment.settle', actor)
            const body = request.body === undefined ? {} : readObject(request.body)
            const paid = readManualPayment(body) ?? { method: 'other' as const }
            const payment = await options.payments.recordManual(segments[1] ?? '', {
              method: paid.method,
              ...('note' in paid && paid.note !== undefined ? { note: paid.note } : {}),
              actorId: actor.id,
            })
            await openSubscriptionsFor(payment.orderId)
            return {
              status: 201,
              body: { payment, order: await options.orders.read(payment.orderId) },
            }
          }
        }

        if (segments[0] === 'payments' && segments[2] === 'settle' && segments.length === 3) {
          if (method === 'POST') {
            // Money in. Held apart from moving an order along, because "mark
            // this bank transfer received" is the one action a packer should
            // not be able to take on their own say-so.
            permissions.assert('commerce.payment.settle', actor)
            const body = request.body === undefined ? {} : readObject(request.body)
            const settled = await options.payments.settle(segments[1] ?? '', {
              actorId: actor.id,
              ...(typeof body.note === 'string' ? { note: body.note } : {}),
            })
            await openSubscriptionsFor(settled.orderId)
            return { status: 200, body: settled }
          }
        }

        if (segments[0] === 'payments' && segments[2] === 'refund' && segments.length === 3) {
          if (method === 'POST') {
            permissions.assert('commerce.order.refund', actor)
            const body = readObject(request.body)
            // "Motif obligatoire" (fiche 52 task 6) — a real reason, not an
            // optional courtesy, for money leaving the business.
            const reason = readString(body, 'reason')
            return {
              status: 200,
              body: await issueRefund(
                options,
                actor,
                segments[1] ?? '',
                readInt(body, 'amountMinor'),
                { reason },
              ),
            }
          }
        }

        // So the screen can show what is left to refund (fiche 52 task 6) —
        // reads the exact list `PaymentStore.refund`'s own over-refund guard
        // sums, never a second computation of "how much was already
        // refunded".
        if (segments[0] === 'payments' && segments[2] === 'refunds' && segments.length === 3) {
          if (method === 'GET') {
            permissions.assert('commerce.read', actor)
            return {
              status: 200,
              body: { refunds: await options.payments.listRefunds(segments[1] ?? '') },
            }
          }
        }

        // ---- customers ----------------------------------------------------
        if (segments[0] === 'customers' && segments.length === 1 && method === 'GET') {
          permissions.assert('commerce.read', actor)
          const query = request.query ?? {}
          const pageLimit = readListPageLimit(query.limit)
          const result = await options.customers.list({
            ...(query.q === undefined ? {} : { search: query.q }),
            ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
            limit: pageLimit + 1,
          })
          const customers = result.slice(0, pageLimit)
          const last = customers.at(-1)
          const hasMore = result.length > pageLimit
          const stats = await options.customers.stats(customers.map((customer) => customer.id))
          return {
            status: 200,
            body: {
              customers,
              // Order count, spend and last order per customer, for the list.
              stats: Object.fromEntries(stats),
              page: {
                limit: pageLimit,
                hasMore,
                nextCursor: hasMore && last !== undefined ? encodeCustomerCursor(last) : null,
              },
            },
          }
        }

        // A customer's own fiche (fiche 52 task 3): the record plus its
        // orders and spend, aggregated here rather than inside
        // `CustomerStore` — `CustomerStore` knows nothing about orders, and
        // it should stay that way (a customer without a single sale is still
        // a valid customer record).
        if (segments[0] === 'customers' && segments.length === 2 && method === 'GET') {
          permissions.assert('commerce.read', actor)
          const customer = await options.customers.read(segments[1] ?? '')
          if (customer === null) return notFound('customer')
          return { status: 200, body: await customerDetail(customer) }
        }

        // GDPR export (fiche 52 task 3) — the same read permission as the
        // rest of the back office already exposes this data through, bundled
        // into one downloadable record rather than requiring several calls.
        if (segments[0] === 'customers' && segments[2] === 'export' && segments.length === 3) {
          if (method === 'POST' || method === 'GET') {
            permissions.assert('commerce.read', actor)
            const customer = await options.customers.read(segments[1] ?? '')
            if (customer === null) return notFound('customer')
            return { status: 200, body: await customerDetail(customer) }
          }
        }

        // GDPR erasure of the customer record (fiche 52 task 3) — see
        // `CustomerStore.anonymize`'s own comment on why orders themselves
        // are left untouched. Gated behind the same permission as any other
        // action on a customer's order data.
        if (segments[0] === 'customers' && segments[2] === 'anonymize' && segments.length === 3) {
          if (method === 'POST') {
            permissions.assert('commerce.order.write', actor)
            return { status: 200, body: await options.customers.anonymize(segments[1] ?? '') }
          }
        }

        // ---- invoices -----------------------------------------------------
        // The PDF, checked before the metadata route below since both start
        // with the same three segments. Its body is the raw bytes, not JSON —
        // the one response in this router that is not: the Node adapter
        // (`cogenta serve`) writes it with `application/pdf` when it sees a
        // `Uint8Array` body instead of serialising it.
        if (
          segments[0] === 'orders' &&
          segments[2] === 'invoice' &&
          segments[3] === 'pdf' &&
          segments.length === 4
        ) {
          if (method === 'GET') {
            permissions.assert('commerce.read', actor)
            if (options.invoices === undefined) return notFound('invoice')
            const invoice = await options.invoices.readByOrder(segments[1] ?? '')
            if (invoice === null) return notFound('invoice')
            return { status: 200, body: await options.invoices.pdf(invoice.id) }
          }
        }

        // A real preview PDF for an order that may never be invoiced (fiche
        // 54 task 2) — same shape and same `application/pdf` handling as the
        // route above, checked first for the same reason: both start with
        // the same three segments. `commerce.read`, not
        // `commerce.invoice.issue`, because nothing here claims a number or
        // writes a row (see `InvoiceStore.preview`'s own comment).
        if (
          segments[0] === 'orders' &&
          segments[2] === 'invoice' &&
          segments[3] === 'preview' &&
          segments.length === 4
        ) {
          if (method === 'GET') {
            permissions.assert('commerce.read', actor)
            if (options.invoices === undefined) return notFound('invoice')
            // The order's own reference works as well as its id: nobody
            // should have to dig an internal id out of the database.
            const reference = segments[1] ?? ''
            const target =
              (await options.orders.read(reference)) ??
              (await options.orders.readByReference(reference))
            if (target === null) return notFound('order')
            return { status: 200, body: await options.invoices.preview(target.id) }
          }
        }

        if (segments[0] === 'orders' && segments[2] === 'invoice' && segments.length === 3) {
          if (method === 'GET') {
            permissions.assert('commerce.read', actor)
            if (options.invoices === undefined) return notFound('invoice')
            const invoice = await options.invoices.readByOrder(segments[1] ?? '')
            if (invoice === null) return notFound('invoice')
            return { status: 200, body: invoice }
          }
          if (method === 'POST') {
            permissions.assert('commerce.invoice.issue', actor)
            if (options.invoices === undefined) {
              throw new CogentaError({
                code: 'COMMERCE_INVOICE_NOT_FOUND',
                message: 'Invoicing is not configured on this site.',
                hint: 'Provide seller details to createInvoiceStore and pass it to the router.',
              })
            }
            const body = request.body === undefined ? {} : readObject(request.body)
            return {
              status: 201,
              body: await options.invoices.issue({
                orderId: segments[1] ?? '',
                actorId: actor.id,
                ...(typeof body.series === 'string' ? { series: body.series } : {}),
              }),
            }
          }
        }

        // ---- coupons --------------------------------------------------------
        if (segments[0] === 'coupons' && segments.length === 1) {
          if (method === 'GET') {
            permissions.assert('commerce.read', actor)
            return { status: 200, body: { coupons: await options.coupons.list() } }
          }
          if (method === 'POST') {
            permissions.assert('commerce.catalog.write', actor)
            const body = readObject(request.body)
            const fields = readCouponFields(body)
            return {
              status: 201,
              body: await options.coupons.create({
                ...fields,
                code: readString(body, 'code'),
                kind: readCouponKind(body.kind),
              }),
            }
          }
        }

        // Read before the generic /coupons/{code}/deactivate route below —
        // "metrics" is not a coupon code, but the two paths share a shape.
        if (segments[0] === 'coupons' && segments[1] === 'metrics' && segments.length === 2) {
          if (method === 'GET') {
            permissions.assert('commerce.read', actor)
            return { status: 200, body: await options.coupons.metrics() }
          }
        }

        if (segments[0] === 'coupons' && segments[2] === 'deactivate' && segments.length === 3) {
          if (method === 'POST') {
            permissions.assert('commerce.catalog.write', actor)
            await options.coupons.deactivate(segments[1] ?? '')
            return { status: 204, body: null }
          }
        }

        if (segments[0] === 'coupons' && segments[2] === 'activate' && segments.length === 3) {
          if (method === 'POST') {
            permissions.assert('commerce.catalog.write', actor)
            await options.coupons.activate(segments[1] ?? '')
            return { status: 204, body: null }
          }
        }

        // Edit and delete one coupon. Checked after `metrics` above, which
        // shares the two-segment shape.
        if (segments[0] === 'coupons' && segments.length === 2) {
          const code = segments[1] ?? ''
          if (method === 'PATCH') {
            permissions.assert('commerce.catalog.write', actor)
            return {
              status: 200,
              body: await options.coupons.update(code, readCouponFields(readObject(request.body))),
            }
          }
          if (method === 'DELETE') {
            permissions.assert('commerce.catalog.write', actor)
            await options.coupons.remove(code)
            return { status: 204, body: null }
          }
        }

        // ---- subscriptions --------------------------------------------------
        // One guard for the whole family: a site that never wired the store
        // answers 404 on every subscription route, never a half-working one.
        const subscriptionsRoute =
          segments[0] === 'subscriptions' ||
          (segments[0] === 'orders' && segments[2] === 'subscriptions')
        const subscriptionStore = options.subscriptions
        if (subscriptionsRoute && subscriptionStore === undefined) {
          return {
            status: 404,
            body: {
              error: {
                code: 'COMMERCE_SUBSCRIPTION_NOT_FOUND',
                message: 'Subscriptions are not configured on this site.',
              },
            },
          }
        }

        if (
          subscriptionStore !== undefined &&
          segments[0] === 'orders' &&
          segments[2] === 'subscriptions' &&
          segments.length === 3
        ) {
          if (method === 'POST') {
            // Opens the subscriptions a paid order's recurring lines call for
            // (idempotent per order and variant).
            permissions.assert('commerce.order.write', actor)
            const subscriptions = await subscriptionStore.createFromOrder(segments[1] ?? '')
            return { status: 200, body: { subscriptions } }
          }
        }

        if (
          subscriptionStore !== undefined &&
          segments[0] === 'subscriptions' &&
          segments.length === 1
        ) {
          if (method === 'GET') {
            permissions.assert('commerce.read', actor)
            const status = request.query?.status
            const subscriptions = await subscriptionStore.list(
              (SUBSCRIPTION_STATUSES as readonly string[]).includes(status ?? '')
                ? { status: status as SubscriptionStatus }
                : {},
            )
            return {
              status: 200,
              body: { subscriptions, ...(await describeSubscriptions(subscriptions)) },
            }
          }
          if (method === 'POST') {
            permissions.assert('commerce.order.write', actor)
            const body = readObject(request.body)
            const customerBody = body.customer === undefined ? undefined : readObject(body.customer)
            const customerId = readOptionalString(body, 'customerId')
            const startAt = readOptionalString(body, 'startAt')
            const priceMinor = strictOptionalInt(body, 'priceMinor')
            const quantity = strictOptionalInt(body, 'quantity')
            const intervalCount = strictOptionalInt(body, 'intervalCount')
            const country = readOptionalString(body, 'shippingCountry')
            const paymentDriver = readOptionalString(body, 'paymentDriver')
            return {
              status: 201,
              body: await subscriptionStore.create({
                ...(customerId === undefined ? {} : { customerId }),
                ...(customerBody === undefined
                  ? {}
                  : {
                      customer: {
                        email: readString(customerBody, 'email'),
                        name: readOptionalString(customerBody, 'name') ?? null,
                      },
                    }),
                variantId: readString(body, 'variantId'),
                intervalUnit: readString(body, 'intervalUnit') as IntervalUnit,
                ...(intervalCount === undefined ? {} : { intervalCount }),
                ...(quantity === undefined ? {} : { quantity }),
                ...(priceMinor === undefined ? {} : { priceMinor }),
                ...(startAt === undefined ? {} : { startAt: dateOnlyToIso(startAt) }),
                ...(country === undefined ? {} : { shippingCountry: country }),
                ...(paymentDriver === undefined ? {} : { paymentDriver }),
              }),
            }
          }
        }

        // Read before the generic /subscriptions/{id} route below — "metrics"
        // is not a subscription id, but the two paths share a shape.
        if (
          subscriptionStore !== undefined &&
          segments[0] === 'subscriptions' &&
          segments[1] === 'metrics' &&
          segments.length === 2
        ) {
          if (method === 'GET') {
            permissions.assert('commerce.read', actor)
            return { status: 200, body: await subscriptionStore.metrics() }
          }
        }

        // A subscription's own billing history (`cycles`) and open dunning
        // cycle, if any, with the names of the people and products involved —
        // the screen never has to show an internal id.
        if (
          subscriptionStore !== undefined &&
          segments[0] === 'subscriptions' &&
          segments.length === 2
        ) {
          if (method === 'GET') {
            permissions.assert('commerce.read', actor)
            const id = segments[1] ?? ''
            const subscription = await subscriptionStore.read(id)
            if (subscription === null) return notFound('subscription')
            const cycles = await subscriptionStore.cycles(id)
            const orderRefs: Record<string, { id: string; reference: string }> = {}
            const orderIds = new Set(
              [subscription.originOrderId, ...cycles.map((cycle) => cycle.orderId)].filter(
                (value): value is string => value !== null,
              ),
            )
            for (const orderId of orderIds) {
              const order = await options.orders.read(orderId)
              if (order !== null) orderRefs[orderId] = { id: order.id, reference: order.reference }
            }
            return {
              status: 200,
              body: {
                subscription,
                cycles,
                dunning: await subscriptionStore.dunning(id),
                orders: orderRefs,
                ...(await describeSubscriptions([subscription])),
              },
            }
          }
        }

        if (
          subscriptionStore !== undefined &&
          segments[0] === 'subscriptions' &&
          segments.length === 3 &&
          (segments[2] === 'pause' || segments[2] === 'resume' || segments[2] === 'cancel')
        ) {
          if (method === 'POST') {
            permissions.assert('commerce.order.write', actor)
            const id = segments[1] ?? ''
            const action = segments[2]
            const updated =
              action === 'pause'
                ? await subscriptionStore.pause(id)
                : action === 'resume'
                  ? await subscriptionStore.resume(id)
                  : await subscriptionStore.cancel(id)
            return { status: 200, body: updated }
          }
        }

        if (
          subscriptionStore !== undefined &&
          segments[0] === 'subscriptions' &&
          segments[2] === 'next-billing' &&
          segments.length === 3
        ) {
          if (method === 'POST') {
            permissions.assert('commerce.order.write', actor)
            const body = readObject(request.body)
            return {
              status: 200,
              body: await subscriptionStore.setNextBilling(
                segments[1] ?? '',
                dateOnlyToIso(readString(body, 'nextBillingAt')),
              ),
            }
          }
        }

        if (
          subscriptionStore !== undefined &&
          segments[0] === 'subscriptions' &&
          segments[2] === 'change-plan' &&
          segments.length === 3
        ) {
          if (method === 'POST') {
            permissions.assert('commerce.order.write', actor)
            const body = readObject(request.body)
            const quantity = strictOptionalInt(body, 'quantity')
            const prorate = readOptionalBool(body, 'prorate')
            const dryRun = readOptionalBool(body, 'dryRun')
            return {
              status: 200,
              body: await subscriptionStore.changePlan(
                segments[1] ?? '',
                readString(body, 'variantId'),
                {
                  ...(quantity === undefined ? {} : { quantity }),
                  ...(prorate === undefined ? {} : { prorate }),
                  ...(dryRun === undefined ? {} : { dryRun }),
                },
              ),
            }
          }
        }

        // ---- tax (fiche 34 task 1) ------------------------------------------
        if (segments[0] === 'tax' && segments[1] === 'rules' && segments.length === 2) {
          if (method === 'GET') {
            permissions.assert('commerce.read', actor)
            return { status: 200, body: { rules: await options.tax.listRules() } }
          }
          if (method === 'POST') {
            permissions.assert('commerce.catalog.write', actor)
            const body = readObject(request.body)
            const taxCategory = readOptionalString(body, 'taxCategory')
            const includedInPrice = readOptionalBool(body, 'includedInPrice')
            const priority = readOptionalInt(body, 'priority')
            const active = readOptionalBool(body, 'active')
            return {
              status: 201,
              body: await options.tax.createRule({
                name: readString(body, 'name'),
                rateBp: readInt(body, 'rateBp'),
                country: readOptionalString(body, 'country') ?? null,
                region: readOptionalString(body, 'region') ?? null,
                ...(taxCategory === undefined ? {} : { taxCategory }),
                ...(includedInPrice === undefined ? {} : { includedInPrice }),
                ...(priority === undefined ? {} : { priority }),
                ...(active === undefined ? {} : { active }),
              }),
            }
          }
        }

        // The categories a rule or a variant can name — what a picker offers
        // instead of free text (checked before the generic rule routes).
        if (segments[0] === 'tax' && segments[1] === 'categories' && segments.length === 2) {
          if (method === 'GET') {
            permissions.assert('commerce.read', actor)
            return { status: 200, body: { categories: await options.tax.listCategories() } }
          }
        }

        if (segments[0] === 'tax' && segments[1] === 'rules' && segments.length === 3) {
          if (method === 'PATCH') {
            permissions.assert('commerce.catalog.write', actor)
            const body = readObject(request.body)
            const country = readOptionalString(body, 'country')
            const region = readOptionalString(body, 'region')
            const taxCategory = readOptionalString(body, 'taxCategory')
            const name = readOptionalString(body, 'name')
            const rateBp = readOptionalInt(body, 'rateBp')
            const includedInPrice = readOptionalBool(body, 'includedInPrice')
            const priority = readOptionalInt(body, 'priority')
            const active = readOptionalBool(body, 'active')
            return {
              status: 200,
              body: await options.tax.updateRule(segments[2] ?? '', {
                // `readOptionalString`/`readOptionalBool`/`readOptionalInt`
                // return `undefined` for an absent key, matching this
                // patch's own "leave unchanged" — an explicit `null` in the
                // request body (to clear country/region) is read directly
                // below rather than through those helpers, which cannot
                // tell "absent" and "null" apart.
                ...(country === undefined
                  ? body.country === null
                    ? { country: null }
                    : {}
                  : { country }),
                ...(region === undefined
                  ? body.region === null
                    ? { region: null }
                    : {}
                  : { region }),
                ...(taxCategory === undefined ? {} : { taxCategory }),
                ...(name === undefined ? {} : { name }),
                ...(rateBp === undefined ? {} : { rateBp }),
                ...(includedInPrice === undefined ? {} : { includedInPrice }),
                ...(priority === undefined ? {} : { priority }),
                ...(active === undefined ? {} : { active }),
              }),
            }
          }
          if (method === 'DELETE') {
            permissions.assert('commerce.catalog.write', actor)
            await options.tax.deleteRule(segments[2] ?? '')
            return { status: 204, body: null }
          }
        }

        // A simulator that calls the exact resolver the checkout uses, never a
        // second implementation of "which rule wins" (fiche 34 § pièges) — the
        // whole point is that the screen can never show a different answer
        // than the one an order actually gets.
        if (segments[0] === 'tax' && segments[1] === 'simulate' && segments.length === 2) {
          if (method === 'POST') {
            permissions.assert('commerce.read', actor)
            const body = readObject(request.body)
            const country = readOptionalString(body, 'country')?.trim().toUpperCase()
            const zone =
              country === undefined
                ? null
                : { country, region: readOptionalString(body, 'region') ?? null }
            const rule = await options.tax.resolve(
              zone,
              readOptionalString(body, 'taxCategory') ?? 'standard',
            )
            const outcome = taxFor(readInt(body, 'amountMinor'), rule)
            return { status: 200, body: { rule, outcome } }
          }
        }

        // ---- shipping (fiche 34 task 2) --------------------------------------
        if (segments[0] === 'shipping' && segments[1] === 'methods' && segments.length === 2) {
          if (method === 'GET') {
            permissions.assert('commerce.read', actor)
            return { status: 200, body: { methods: await options.shipping.listMethods() } }
          }
          if (method === 'POST') {
            permissions.assert('commerce.catalog.write', actor)
            const body = readObject(request.body)
            const kind = readOptionalString(body, 'kind')
            if (kind !== undefined && !(SHIPPING_KINDS as readonly string[]).includes(kind)) {
              throw new CogentaError({
                code: 'COMMERCE_SHIPPING_METHOD_UNKNOWN',
                message: `"${kind}" is not a shipping kind.`,
                hint: `Use one of: ${SHIPPING_KINDS.join(', ')}.`,
              })
            }
            const amountMinor = readOptionalInt(body, 'amountMinor')
            const perKgMinor = readOptionalInt(body, 'perKgMinor')
            const position = readOptionalInt(body, 'position')
            const active = readOptionalBool(body, 'active')
            return {
              status: 201,
              body: await options.shipping.createMethod({
                label: readString(body, 'label'),
                currency: readString(body, 'currency'),
                ...(kind === undefined ? {} : { kind: kind as ShippingKind }),
                country: readOptionalString(body, 'country') ?? null,
                region: readOptionalString(body, 'region') ?? null,
                ...(amountMinor === undefined ? {} : { amountMinor }),
                ...(perKgMinor === undefined ? {} : { perKgMinor }),
                freeOverMinor: readOptionalInt(body, 'freeOverMinor') ?? null,
                carrier: readOptionalString(body, 'carrier') ?? null,
                ...(position === undefined ? {} : { position }),
                ...(active === undefined ? {} : { active }),
              }),
            }
          }
        }

        if (segments[0] === 'shipping' && segments[1] === 'methods' && segments.length === 3) {
          if (method === 'PATCH') {
            permissions.assert('commerce.catalog.write', actor)
            const body = readObject(request.body)
            const label = readOptionalString(body, 'label')
            const country = readOptionalString(body, 'country')
            const region = readOptionalString(body, 'region')
            const kind = readOptionalString(body, 'kind')
            if (kind !== undefined && !(SHIPPING_KINDS as readonly string[]).includes(kind)) {
              throw new CogentaError({
                code: 'COMMERCE_SHIPPING_METHOD_UNKNOWN',
                message: `"${kind}" is not a shipping kind.`,
                hint: `Use one of: ${SHIPPING_KINDS.join(', ')}.`,
              })
            }
            const currency = readOptionalString(body, 'currency')
            const amountMinor = readOptionalInt(body, 'amountMinor')
            const perKgMinor = readOptionalInt(body, 'perKgMinor')
            const freeOverMinor = readOptionalInt(body, 'freeOverMinor')
            const carrier = readOptionalString(body, 'carrier')
            const position = readOptionalInt(body, 'position')
            const active = readOptionalBool(body, 'active')
            return {
              status: 200,
              body: await options.shipping.updateMethod(segments[2] ?? '', {
                ...(label === undefined ? {} : { label }),
                ...(country === undefined
                  ? body.country === null
                    ? { country: null }
                    : {}
                  : { country }),
                ...(region === undefined
                  ? body.region === null
                    ? { region: null }
                    : {}
                  : { region }),
                ...(kind === undefined ? {} : { kind: kind as ShippingKind }),
                ...(currency === undefined ? {} : { currency }),
                ...(amountMinor === undefined ? {} : { amountMinor }),
                ...(perKgMinor === undefined ? {} : { perKgMinor }),
                ...(freeOverMinor === undefined
                  ? body.freeOverMinor === null
                    ? { freeOverMinor: null }
                    : {}
                  : { freeOverMinor }),
                ...(carrier === undefined
                  ? body.carrier === null
                    ? { carrier: null }
                    : {}
                  : { carrier }),
                ...(position === undefined ? {} : { position }),
                ...(active === undefined ? {} : { active }),
              }),
            }
          }
          if (method === 'DELETE') {
            permissions.assert('commerce.catalog.write', actor)
            await options.shipping.deleteMethod(segments[2] ?? '')
            return { status: 204, body: null }
          }
        }

        // Same discipline as the tax simulator: calls `available()`, the exact
        // function checkout uses to price and offer methods, never a
        // reimplementation. A method naming a carrier always reports it, so
        // the screen can say "carrier rate, falls back to the stored rate if
        // the courier's API does not answer" without guessing at runtime
        // whether the fallback fired for *this* simulated shipment.
        if (segments[0] === 'shipping' && segments[1] === 'simulate' && segments.length === 2) {
          if (method === 'POST') {
            permissions.assert('commerce.read', actor)
            const body = readObject(request.body)
            const country = readOptionalString(body, 'country')?.trim().toUpperCase()
            const zone =
              country === undefined
                ? null
                : { country, region: readOptionalString(body, 'region') ?? null }
            const basis = {
              weightGrams: readOptionalInt(body, 'weightGrams') ?? 0,
              subtotalMinor: readOptionalInt(body, 'subtotalMinor') ?? 0,
              currency: readString(body, 'currency'),
            }
            return { status: 200, body: { quotes: await options.shipping.available(zone, basis) } }
          }
        }

        // ---- payment (fiche 34 task 3) ---------------------------------------
        // Presence and health only, never a key's value (fiche 34 § pièges:
        // "un écran de paiement est une fuite de clé en puissance").
        if (segments[0] === 'payment' && segments[1] === 'drivers' && segments.length === 2) {
          if (method === 'GET') {
            permissions.assert('commerce.read', actor)
            if (options.payment === undefined) {
              return { status: 200, body: { drivers: [], testMode: true, webhookUrl: null } }
            }
            const { registry, config } = options.payment
            const drivers = await Promise.all(
              registry.list().map(async (driver) => ({
                name: driver.name,
                tier: driver.tier,
                settlesOffline: driver.name === 'manual',
                // "Configured" never means "reachable" — a key can be present
                // and wrong. `available()` is the same probe the registry uses
                // to choose a driver at startup, called again here on demand.
                configured: await driver.available(config).catch(() => false),
                selected:
                  (config.driver ?? 'auto') === 'auto' ? undefined : config.driver === driver.name,
              })),
            )
            return {
              status: 200,
              body: {
                drivers,
                testMode: options.payment.testMode,
                webhookUrl: options.payment.webhookUrl,
              },
            }
          }
        }

        // "Bouton tester la connexion" — actually calls the driver, and
        // returns whatever it says, error included, rather than a boolean.
        // fiche feedback: this used to gate on `commerce.read` — meaning any
        // signed-in `viewer` could trigger a real `driver.init()`/`health()`
        // probe against the site's live payment credentials. No key value
        // ever leaks (the response is only `ok`/`message`), but *probing* a
        // payment gateway on demand is a money-adjacent action, not a read;
        // `commerce.payment.settle` is the closest of the six permissions
        // (deliberately coarse, see permissions.ts) that already gates
        // money-touching operations, so it's reused here rather than adding
        // a seventh permission for one button.
        if (
          segments[0] === 'payment' &&
          segments[1] === 'drivers' &&
          segments[3] === 'test-connection' &&
          segments.length === 4
        ) {
          if (method === 'POST') {
            permissions.assert('commerce.payment.settle', actor)
            if (options.payment === undefined) {
              throw new CogentaError({
                code: 'COMMERCE_PAYMENT_NOT_CONFIGURED',
                message: 'Payment is not configured on this site.',
                hint: 'Pass a `payment` option to createCommerceAdminRouter.',
              })
            }
            const name = segments[2] ?? ''
            const driver = options.payment.registry.list().find((entry) => entry.name === name)
            if (driver === undefined) {
              throw new CogentaError({
                code: 'DRIVER_UNKNOWN',
                message: `No payment driver named "${name}".`,
                hint: `Available: ${options.payment.registry
                  .list()
                  .map((entry) => entry.name)
                  .join(', ')}.`,
              })
            }
            // Stable codes the admin translates (`message` stays English, for
            // API clients and logs): `ok`, `not_configured` (no credentials to
            // try), `unreachable` (credentials present, provider refused or
            // down) and `error`.
            const reachable = await driver.available(options.payment.config)
            if (!reachable) {
              // A driver that needs no credentials is always reachable, so this
              // is a gateway with missing or refused credentials. Whether the
              // credentials are absent or wrong is never revealed here.
              return {
                status: 200,
                body: {
                  ok: false,
                  driver: name,
                  code: 'not_configured',
                  message: `${name} is not reachable with the credentials configured on this server.`,
                },
              }
            }
            try {
              // `health()` reports on whatever `init()` last set up — see
              // `stripePaymentDriver`'s own comment — so the two are always
              // called back to back, never `health()` alone.
              await driver.init(options.payment.config)
              const health = await driver.health()
              return {
                status: 200,
                body: {
                  ok: health.status === 'ok',
                  driver: name,
                  code: health.status === 'ok' ? 'ok' : 'unreachable',
                  message: health.message ?? null,
                },
              }
            } catch (error) {
              return {
                status: 200,
                body: {
                  ok: false,
                  driver: name,
                  code: 'error',
                  message: error instanceof Error ? error.message : String(error),
                },
              }
            }
          }
        }

        return { status: 405, body: { error: { code: 'INTERNAL', message: 'No such route.' } } }
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}

/** A payment's collected amount less what was already given back — `null` when nothing was ever collected. */
async function refundablePayment(
  payments: PaymentStore,
  orderId: string,
): Promise<{
  readonly payment: Awaited<ReturnType<PaymentStore['listForOrder']>>[number]
  readonly remainingMinor: number
} | null> {
  const collected = (await payments.listForOrder(orderId)).find(
    (payment) => payment.status === 'paid',
  )
  if (collected === undefined) return null
  const refunded = (await payments.listRefunds(collected.id))
    .filter((refund) => refund.status !== 'failed')
    .reduce((sum, refund) => sum + refund.amountMinor, 0)
  const remainingMinor = collected.amountMinor - refunded
  return remainingMinor > 0 ? { payment: collected, remainingMinor } : null
}

/**
 * Gives money back — and, when invoicing is configured, writes the credit
 * note for it. The credit note is skipped (never half-done) while the seller
 * details are missing: a credit note without a seller address is not a usable
 * accounting document, and failing it *after* the money moved would be worse
 * than not issuing it.
 */
async function issueRefund(
  options: CommerceAdminRouterOptions,
  actor: CommerceActor,
  paymentId: string,
  amountMinor: number,
  details: { readonly reason: string },
): Promise<{
  readonly refund: Awaited<ReturnType<PaymentStore['refund']>>
  readonly creditNote: Awaited<
    ReturnType<NonNullable<CommerceAdminRouterOptions['creditNotes']>['issue']>
  > | null
}> {
  const refund = await options.payments.refund(paymentId, amountMinor, {
    actorId: actor.id,
    reason: details.reason,
  })
  const creditNote =
    options.creditNotes === undefined || !(await options.creditNotes.configured())
      ? null
      : await options.creditNotes.issue({
          orderId: refund.orderId,
          refundId: refund.id,
          amountMinor: refund.amountMinor,
          reason: details.reason,
          actorId: actor.id,
        })
  return { refund, creditNote }
}

/** `body.paid` / a payment body: `{ method, note? }`, or `null` when absent. */
function readManualPayment(
  value: unknown,
): { readonly method: ManualPaymentMethod; readonly note?: string } | null {
  if (value === undefined || value === null) return null
  const body = readObject(value)
  const method = readString(body, 'method')
  if (!(MANUAL_PAYMENT_METHODS as readonly string[]).includes(method)) {
    throw new CogentaError({
      code: 'COMMERCE_REQUEST_INVALID',
      message: `"${method}" is not a payment method.`,
      hint: `Use one of: ${MANUAL_PAYMENT_METHODS.join(', ')}.`,
    })
  }
  const note = readOptionalString(body, 'note')
  return { method: method as ManualPaymentMethod, ...(note === undefined ? {} : { note }) }
}

const NOT_FOUND_CODES: Readonly<Record<string, string>> = {
  product: 'COMMERCE_PRODUCT_NOT_FOUND',
  order: 'COMMERCE_ORDER_NOT_FOUND',
  invoice: 'COMMERCE_INVOICE_NOT_FOUND',
  subscription: 'COMMERCE_SUBSCRIPTION_NOT_FOUND',
  customer: 'COMMERCE_CUSTOMER_NOT_FOUND',
}

function notFound(what: string): CommerceResponse {
  return {
    status: 404,
    body: {
      error: {
        code: NOT_FOUND_CODES[what] ?? 'COMMERCE_ORDER_NOT_FOUND',
        message: `This ${what} does not exist.`,
      },
    },
  }
}
