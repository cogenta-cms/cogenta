import type { DatabaseHandle } from '@cogenta/core'
import { type CartStore, createCartStore } from '../../src/cart/store.js'
import { type CatalogStore, createCatalogStore } from '../../src/catalog/store.js'
import { type CouponStore, createCouponStore } from '../../src/coupon/store.js'
import { type CustomerStore, createCustomerStore } from '../../src/customer/store.js'
import { createOrderStore, type OrderStore } from '../../src/order/store.js'
import { createManualPaymentGateway } from '../../src/payment/manual.js'
import { createPaymentStore, type PaymentStore } from '../../src/payment/store.js'
import type { PaymentGateway } from '../../src/payment/types.js'
import { createShippingStore, type ShippingStore } from '../../src/shipping/store.js'
import { createTaxStore, type TaxStore } from '../../src/tax/store.js'

export interface Shop {
  readonly catalog: CatalogStore
  readonly tax: TaxStore
  readonly shipping: ShippingStore
  readonly coupons: CouponStore
  readonly carts: CartStore
  readonly customers: CustomerStore
  readonly orders: OrderStore
  readonly payments: PaymentStore
}

/**
 * A whole shop, wired the way a real site would wire it.
 *
 * The default gateway is the **degraded** one, with no configuration at all —
 * which is the point: every test that does not explicitly ask for Stripe is
 * therefore also a test that the shop works with no API key anywhere (R2).
 */
export function createShop(db: DatabaseHandle, gateway?: PaymentGateway): Shop {
  const catalog = createCatalogStore(db)
  const tax = createTaxStore(db)
  const shipping = createShippingStore(db)
  const coupons = createCouponStore(db)
  const customers = createCustomerStore(db)
  const carts = createCartStore(db, { catalog, tax, shipping, coupons })
  const orders = createOrderStore(db, { catalog, carts, customers, coupons })
  const payments = createPaymentStore(db, {
    gateway: gateway ?? createManualPaymentGateway(),
    orders,
  })

  return { catalog, tax, shipping, coupons, carts, customers, orders, payments }
}
