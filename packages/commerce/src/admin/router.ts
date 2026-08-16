import { CogentaError, isCogentaError } from '@cogenta/core'
import type { CatalogStore } from '../catalog/store.js'
import type { CustomerStore } from '../customer/store.js'
import type { InvoiceStore } from '../invoice/store.js'
import type { OrderStore } from '../order/store.js'
import { ORDER_STATUSES, type OrderStatus } from '../order/types.js'
import type { PaymentStore } from '../payment/store.js'
import type { CommerceActor, CommercePermissionLayer } from './permissions.js'
import { COMMERCE_ANONYMOUS } from './permissions.js'

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
  readonly body: unknown
}

export interface CommerceAdminRouterOptions {
  readonly catalog: CatalogStore
  readonly orders: OrderStore
  readonly customers: CustomerStore
  readonly payments: PaymentStore
  readonly invoices?: InvoiceStore
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

        // ---- products -----------------------------------------------------
        if (segments[0] === 'products' && segments.length === 1) {
          if (method === 'GET') {
            permissions.assert('commerce.read', actor)
            const query = request.query ?? {}
            return {
              status: 200,
              body: {
                products: await options.catalog.listProducts({
                  ...(query['status'] === 'active' || query['status'] === 'archived'
                    ? { status: query['status'] }
                    : {}),
                  ...(query['q'] === undefined ? {} : { search: query['q'] }),
                }),
              },
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

        if (segments[0] === 'products' && segments.length === 2) {
          const id = segments[1] ?? ''
          if (method === 'GET') {
            permissions.assert('commerce.read', actor)
            const product = await options.catalog.readProduct(id)
            if (product === null) return notFound('product')
            return {
              status: 200,
              body: { product, variants: await options.catalog.listVariants(id) },
            }
          }
          if (method === 'PATCH') {
            permissions.assert('commerce.catalog.write', actor)
            const body = readObject(request.body)
            return {
              status: 200,
              body: await options.catalog.updateProduct(id, {
                ...(typeof body['handle'] === 'string' ? { handle: body['handle'] } : {}),
                ...(typeof body['title'] === 'string' ? { title: body['title'] } : {}),
                ...(body['status'] === 'active' || body['status'] === 'archived'
                  ? { status: body['status'] }
                  : {}),
              }),
            }
          }
          if (method === 'DELETE') {
            permissions.assert('commerce.catalog.write', actor)
            await options.catalog.archiveProduct(id)
            return { status: 204, body: null }
          }
        }

        // ---- variants -----------------------------------------------------
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
                ...(typeof body['onHand'] === 'number' ? { onHand: body['onHand'] } : {}),
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
                ...(typeof body['sku'] === 'string' ? { sku: body['sku'] } : {}),
                ...(typeof body['title'] === 'string' ? { title: body['title'] } : {}),
                ...(typeof body['priceMinor'] === 'number'
                  ? { priceMinor: body['priceMinor'] }
                  : {}),
              }),
            }
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
          const status = request.query?.['status']
          return {
            status: 200,
            body: {
              orders: await options.orders.list(
                (ORDER_STATUSES as readonly string[]).includes(status ?? '')
                  ? { status: status as OrderStatus }
                  : {},
              ),
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
                ...(typeof body['note'] === 'string' ? { note: body['note'] } : {}),
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
                ...(typeof body['note'] === 'string' ? { note: body['note'] } : {}),
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
                ...(typeof body['reason'] === 'string' ? { reason: body['reason'] } : {}),
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
                ...(request.query?.['q'] === undefined ? {} : { search: request.query['q'] }),
              }),
            },
          }
        }

        // ---- invoices -----------------------------------------------------
        if (segments[0] === 'orders' && segments[2] === 'invoice' && segments.length === 3) {
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
                ...(typeof body['series'] === 'string' ? { series: body['series'] } : {}),
              }),
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

function notFound(what: string): CommerceResponse {
  return {
    status: 404,
    body: {
      error: {
        code: what === 'product' ? 'COMMERCE_PRODUCT_NOT_FOUND' : 'COMMERCE_ORDER_NOT_FOUND',
        message: `This ${what} does not exist.`,
      },
    },
  }
}
