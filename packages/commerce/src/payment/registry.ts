import { createDriverRegistry, type DriverRegistry, type Logger } from '@cogenta/core'
import { manualPaymentDriver } from './manual.js'
import { stripePaymentDriver } from './stripe.js'
import type { PaymentConfig, PaymentGateway } from './types.js'

export interface PaymentRegistryOptions {
  readonly logger?: Logger
}

/**
 * The payment gateways Cogenta ships.
 *
 * Registered in tier order, exactly like cache, queue, storage and database:
 * Stripe is `optimal` and answers only when a key is configured and the API
 * responds; bank transfer is `degraded` and always answers. So a site with no
 * Stripe account does not fail to start and does not fall over at checkout —
 * it takes bank transfers, which is a real way to be paid, not a placeholder.
 *
 * The registry's two rules apply here with more force than anywhere else in
 * the project. If the configuration **names** Stripe, a Stripe outage is fatal
 * rather than a silent downgrade: quietly switching a shop that expects card
 * payments over to "please make a transfer" would change what customers are
 * asked to do without anybody deciding to. If the configuration names nothing,
 * the fall-through is the point.
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
  registry.register(manualPaymentDriver())

  return registry
}
