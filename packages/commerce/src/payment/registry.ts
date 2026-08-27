import { createDriverRegistry, type DriverRegistry, type Logger } from '@cogenta/core'
import { manualPaymentDriver } from './manual.js'
import { paypalPaymentDriver } from './paypal.js'
import { stripePaymentDriver } from './stripe.js'
import type { PaymentConfig, PaymentGateway } from './types.js'

export interface PaymentRegistryOptions {
  readonly logger?: Logger
}

/**
 * The payment gateways Cogenta ships.
 *
 * Registered in tier order, exactly like cache, queue, storage and database:
 * Stripe and PayPal are both `optimal` and answer only when real credentials
 * are configured and the gateway's own API accepts them; bank transfer is
 * `degraded` and always answers. So a site with no gateway account does not
 * fail to start and does not fall over at checkout — it takes bank transfers,
 * which is a real way to be paid, not a placeholder.
 *
 * This is also the concrete answer to "what if I want a payment method that
 * isn't Stripe?": `PaymentGateway` (`types.ts`) is a registered interface,
 * exactly like cache/queue/storage, and PayPal is a second, independent
 * implementation of it added without touching Stripe, `manual.ts`, the order
 * store, or the admin payment screen — that screen already renders whatever
 * `registry.list()` returns, so a third driver appears there for free.
 *
 * The registry's two rules apply here with more force than anywhere else in
 * the project. If the configuration **names** a driver, its outage is fatal
 * rather than a silent downgrade: quietly switching a shop that expects card
 * payments over to "please make a transfer" would change what customers are
 * asked to do without anybody deciding to. If the configuration names nothing,
 * the fall-through is the point — Stripe is tried before PayPal only because
 * it was registered first, not because of any ranking between the two.
 */
export function createPaymentRegistry(
  options: PaymentRegistryOptions = {},
): DriverRegistry<PaymentGateway, PaymentConfig> {
  const { logger } = options
  const registry = createDriverRegistry<PaymentGateway, PaymentConfig>({
    need: 'payment',
    ...(logger === undefined ? {} : { logger }),
  })

  registry.register(stripePaymentDriver())
  registry.register(paypalPaymentDriver())
  registry.register(manualPaymentDriver())

  return registry
}
