import type { CatalogStore } from '../catalog/store.js'
import type { CustomerStore } from '../customer/store.js'
import type { InvoiceStore } from '../invoice/store.js'
import type { Order } from '../order/types.js'
import type { ShippingStore } from '../shipping/store.js'

/**
 * What the order screens need next to an order, resolved on the server so the
 * admin never has to guess a name from an id: who the customer is, which
 * *product* each line is a variant of, what the shipping method is called.
 *
 * Kept out of `router.ts` so the router stays a table of routes.
 */

/** The few fields of a customer a list or a header ever shows. */
export interface CustomerSummary {
  readonly id: string
  readonly name: string | null
  readonly email: string
  readonly anonymized: boolean
}

/** A line's product, looked up through its variant — an order line only copies the variant's own title. */
export interface LineProduct {
  readonly productId: string
  readonly productTitle: string
  readonly imageMediaId: string | null
}

export interface OrderViewDependencies {
  readonly catalog: CatalogStore
  readonly customers: CustomerStore
  readonly shipping: ShippingStore
  readonly invoices?: InvoiceStore
}

/** The customers of a page of orders, keyed by id — one read per distinct customer. */
export async function customersOf(
  dependencies: Pick<OrderViewDependencies, 'customers'>,
  orders: readonly Order[],
): Promise<Record<string, CustomerSummary>> {
  const summaries: Record<string, CustomerSummary> = {}
  for (const order of orders) {
    if (order.customerId === null || summaries[order.customerId] !== undefined) continue
    const customer = await dependencies.customers.read(order.customerId)
    if (customer === null) continue
    summaries[customer.id] = {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      anonymized: customer.anonymized,
    }
  }
  return summaries
}

/** Each line's product, keyed by the line's variant id. A variant deleted since is simply absent. */
export async function productsOfLines(
  dependencies: Pick<OrderViewDependencies, 'catalog'>,
  order: Order,
): Promise<Record<string, LineProduct>> {
  const products: Record<string, LineProduct> = {}
  for (const line of order.lines) {
    if (products[line.variantId] !== undefined) continue
    const variant = await dependencies.catalog.readVariant(line.variantId)
    if (variant === null) continue
    const product = await dependencies.catalog.readProduct(variant.productId)
    if (product === null) continue
    products[line.variantId] = {
      productId: product.id,
      productTitle: product.title,
      imageMediaId: variant.imageMediaId ?? product.imageMediaIds[0] ?? null,
    }
  }
  return products
}

/** The shipping method's name: the one copied onto the order, else the live method it points at. */
export async function shippingMethodOf(
  dependencies: Pick<OrderViewDependencies, 'shipping'>,
  order: Order,
): Promise<{ readonly id: string; readonly label: string } | null> {
  if (order.shippingMethodId === null) return null
  if (order.shippingMethodLabel !== null) {
    return { id: order.shippingMethodId, label: order.shippingMethodLabel }
  }
  const methods = await dependencies.shipping.listMethods()
  const found = methods.find((method) => method.id === order.shippingMethodId)
  return found === undefined ? null : { id: found.id, label: found.label }
}
