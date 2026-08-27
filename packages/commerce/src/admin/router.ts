import { CogentaError, type DriverRegistry, isCogentaError } from '@cogenta/core'
import { applyProductsImport, exportProductsCsv, previewProductsImport } from '../catalog/csv.js'
import type { CatalogStore } from '../catalog/store.js'
import { COUPON_KINDS, type CouponKind, type CouponStore } from '../coupon/store.js'
import type { CustomerStore } from '../customer/store.js'
import type { InvoiceStore } from '../invoice/store.js'
import type { OrderStore } from '../order/store.js'
import { ORDER_STATUSES, type OrderStatus } from '../order/types.js'
import type { PaymentStore } from '../payment/store.js'
import type { PaymentConfig, PaymentGateway } from '../payment/types.js'
import { SHIPPING_KINDS, type ShippingKind, type ShippingStore } from '../shipping/store.js'
import type { SubscriptionStore } from '../subscription/store.js'
import { type TaxStore, taxFor } from '../tax/store.js'
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
}

export interface CommerceResponse {
  readonly status: number
  /**
   * JSON-serialisable for every route but one: `GET /invoices/{id}/pdf`
   * answers with a `Uint8Array` instead. The transport adapter (`cogenta
   * serve`) checks for that one shape and sends bytes rather than JSON —
   * this router does not know or care how its caller transports a response.
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
  /** Where a caller would point the provider's dashboard, informational until a real inbound endpoint exists. */
  readonly webhookUrl: string
}

export interface CommerceAdminRouterOptions {
  readonly catalog: CatalogStore
  readonly orders: OrderStore
  readonly customers: CustomerStore
  readonly payments: PaymentStore
  readonly coupons: CouponStore
  readonly invoices?: InvoiceStore
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
  COMMERCE_PRODUCT_INVALID: 400,
  COMMERCE_SKU_TAKEN: 409,
  COMMERCE_INVOICE_ALREADY_ISSUED: 409,
  COMMERCE_CART_CLOSED: 409,
  COMMERCE_ORDER_TRANSITION_INVALID: 409,
  COMMERCE_INVOICE_SEQUENCE_CONFLICT: 409,
  COMMERCE_AMOUNT_INVALID: 400,
  COMMERCE_CURRENCY_INVALID: 400,
  COMMERCE_CURRENCY_MISMATCH: 400,
  COMMERCE_QUANTITY_INVALID: 400,
  COMMERCE_COUPON_INVALID: 400,
  COMMERCE_COUPON_EXHAUSTED: 409,
  COMMERCE_TAX_RULE_INVALID: 400,
  COMMERCE_SHIPPING_UNAVAILABLE: 400,
  COMMERCE_SUBSCRIPTION_INVALID: 400,
  COMMERCE_REFUND_EXCEEDS_PAYMENT: 400,
  COMMERCE_PAYMENT_UNSUPPORTED: 400,
  COMMERCE_PAYMENT_SIGNATURE_INVALID: 403,
  // The driver registry's own vocabulary (fiche 34 task 3's "tester la
  // connexion") — a bad gateway on the far side, never this server's fault.
  DRIVER_UNAVAILABLE: 502,
  DRIVER_UNKNOWN: 502,
  DRIVER_INIT_FAILED: 502,
}

function errorResponse(error: unknown): CommerceResponse {
  if (isCogentaError(error)) {
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
      code: 'COMMERCE_AMOUNT_INVALID',
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
      code: 'COMMERCE_AMOUNT_INVALID',
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

export function createCommerceAdminRouter(
  options: CommerceAdminRouterOptions,
): CommerceAdminRouter {
  const basePath = (options.basePath ?? '/api/commerce').replace(/\/+$/u, '')
  const { permissions } = options

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
                ...(typeof body.weightGrams === 'number' ? { weightGrams: body.weightGrams } : {}),
                ...(typeof body.taxCategory === 'string' ? { taxCategory: body.taxCategory } : {}),
                ...optionalField(body, 'lowStockThreshold', nullableInt),
                ...optionalField(body, 'compareAtPriceMinor', nullableInt),
                ...optionalField(body, 'saleStartsAt', nullableIsoString),
                ...optionalField(body, 'saleEndsAt', nullableIsoString),
                ...optionalField(body, 'widthMm', nullableInt),
                ...optionalField(body, 'heightMm', nullableInt),
                ...optionalField(body, 'depthMm', nullableInt),
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
                ...(typeof body.weightGrams === 'number' ? { weightGrams: body.weightGrams } : {}),
                ...(typeof body.taxCategory === 'string' ? { taxCategory: body.taxCategory } : {}),
                ...(typeof body.position === 'number' ? { position: body.position } : {}),
                ...optionalField(body, 'lowStockThreshold', nullableInt),
                ...optionalField(body, 'compareAtPriceMinor', nullableInt),
                ...optionalField(body, 'saleStartsAt', nullableIsoString),
                ...optionalField(body, 'saleEndsAt', nullableIsoString),
                ...optionalField(body, 'widthMm', nullableInt),
                ...optionalField(body, 'heightMm', nullableInt),
                ...optionalField(body, 'depthMm', nullableInt),
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
              body: await options.catalog.setStock(segments[1] ?? '', readInt(body, 'onHand')),
            }
          }
        }

        // ---- orders -------------------------------------------------------
        if (segments[0] === 'orders' && segments.length === 1 && method === 'GET') {
          permissions.assert('commerce.read', actor)
          const status = request.query?.status
          const q = request.query?.q
          return {
            status: 200,
            body: {
              orders: await options.orders.list({
                ...((ORDER_STATUSES as readonly string[]).includes(status ?? '')
                  ? { status: status as OrderStatus }
                  : {}),
                ...(q === undefined || q === '' ? {} : { search: q }),
              }),
            },
          }
        }

        if (segments[0] === 'orders' && segments.length === 2 && method === 'GET') {
          permissions.assert('commerce.read', actor)
          const order = await options.orders.read(segments[1] ?? '')
          if (order === null) return notFound('order')
          return {
            status: 200,
            body: {
              order,
              history: await options.orders.history(order.id),
              payments: await options.payments.listForOrder(order.id),
            },
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
            return {
              status: 200,
              body: await options.orders.transition(segments[1] ?? '', to as OrderStatus, {
                actorId: actor.id,
                ...(typeof body.note === 'string' ? { note: body.note } : {}),
              }),
            }
          }
        }

        // ---- payments -----------------------------------------------------
        if (segments[0] === 'payments' && segments[2] === 'settle' && segments.length === 3) {
          if (method === 'POST') {
            // Money in. Held apart from moving an order along, because "mark
            // this bank transfer received" is the one action a packer should
            // not be able to take on their own say-so.
            permissions.assert('commerce.payment.settle', actor)
            const body = request.body === undefined ? {} : readObject(request.body)
            return {
              status: 200,
              body: await options.payments.settle(segments[1] ?? '', {
                actorId: actor.id,
                ...(typeof body.note === 'string' ? { note: body.note } : {}),
              }),
            }
          }
        }

        if (segments[0] === 'payments' && segments[2] === 'refund' && segments.length === 3) {
          if (method === 'POST') {
            permissions.assert('commerce.order.refund', actor)
            const body = readObject(request.body)
            return {
              status: 200,
              body: await options.payments.refund(segments[1] ?? '', readInt(body, 'amountMinor'), {
                actorId: actor.id,
                ...(typeof body.reason === 'string' ? { reason: body.reason } : {}),
              }),
            }
          }
        }

        // ---- customers ----------------------------------------------------
        if (segments[0] === 'customers' && segments.length === 1 && method === 'GET') {
          permissions.assert('commerce.read', actor)
          return {
            status: 200,
            body: {
              customers: await options.customers.list({
                ...(request.query?.q === undefined ? {} : { search: request.query.q }),
              }),
            },
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
            const kind = readString(body, 'kind')
            if (!(COUPON_KINDS as readonly string[]).includes(kind)) {
              throw new CogentaError({
                code: 'COMMERCE_COUPON_INVALID',
                message: `"${kind}" is not a coupon kind.`,
                hint: `Use one of: ${COUPON_KINDS.join(', ')}.`,
              })
            }
            return {
              status: 201,
              body: await options.coupons.create({
                code: readString(body, 'code'),
                kind: kind as CouponKind,
                ...(typeof body.value === 'number' ? { value: body.value } : {}),
                ...(typeof body.currency === 'string' ? { currency: body.currency } : {}),
                ...(typeof body.minSubtotalMinor === 'number'
                  ? { minSubtotalMinor: body.minSubtotalMinor }
                  : {}),
                ...(typeof body.startsAt === 'string' ? { startsAt: body.startsAt } : {}),
                ...(typeof body.endsAt === 'string' ? { endsAt: body.endsAt } : {}),
                ...(typeof body.maxRedemptions === 'number'
                  ? { maxRedemptions: body.maxRedemptions }
                  : {}),
              }),
            }
          }
        }

        if (segments[0] === 'coupons' && segments[2] === 'deactivate' && segments.length === 3) {
          if (method === 'POST') {
            permissions.assert('commerce.catalog.write', actor)
            await options.coupons.deactivate(segments[1] ?? '')
            return { status: 204, body: null }
          }
        }

        // ---- subscriptions --------------------------------------------------
        if (segments[0] === 'subscriptions' && segments.length === 1) {
          if (options.subscriptions === undefined) {
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
          if (method === 'GET') {
            permissions.assert('commerce.read', actor)
            const status = request.query?.status
            return {
              status: 200,
              body: {
                subscriptions: await options.subscriptions.list(
                  status === 'active' || status === 'paused' || status === 'cancelled'
                    ? { status }
                    : {},
                ),
              },
            }
          }
        }

        if (
          segments[0] === 'subscriptions' &&
          segments.length === 3 &&
          (segments[2] === 'pause' || segments[2] === 'resume' || segments[2] === 'cancel')
        ) {
          if (options.subscriptions === undefined) {
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
          if (method === 'POST') {
            permissions.assert('commerce.order.write', actor)
            const id = segments[1] ?? ''
            const subscriptions = options.subscriptions
            const action = segments[2]
            const updated =
              action === 'pause'
                ? await subscriptions.pause(id)
                : action === 'resume'
                  ? await subscriptions.resume(id)
                  : await subscriptions.cancel(id)
            return { status: 200, body: updated }
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

        if (segments[0] === 'tax' && segments[1] === 'rules' && segments.length === 3) {
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
            const country = readOptionalString(body, 'country')
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
            const country = readOptionalString(body, 'country')
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
        if (
          segments[0] === 'payment' &&
          segments[1] === 'drivers' &&
          segments[3] === 'test-connection' &&
          segments.length === 4
        ) {
          if (method === 'POST') {
            permissions.assert('commerce.read', actor)
            if (options.payment === undefined) {
              throw new CogentaError({
                code: 'COMMERCE_PAYMENT_UNSUPPORTED',
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
            const reachable = await driver.available(options.payment.config)
            if (!reachable) {
              return {
                status: 200,
                body: {
                  ok: false,
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
                body: { ok: health.status === 'ok', message: health.message ?? null },
              }
            } catch (error) {
              return {
                status: 200,
                body: {
                  ok: false,
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

const NOT_FOUND_CODES: Readonly<Record<string, string>> = {
  product: 'COMMERCE_PRODUCT_NOT_FOUND',
  order: 'COMMERCE_ORDER_NOT_FOUND',
  invoice: 'COMMERCE_INVOICE_NOT_FOUND',
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
