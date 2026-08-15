import { CogentaError, type HealthReport } from '@cogenta/core'
import { assertCurrency, assertMinor, formatMoney } from '../money.js'
import type {
  DriverRefundRequest,
  DriverRefundResult,
  PaymentConfig,
  PaymentDriver,
  PaymentGateway,
  StartedPayment,
  StartPaymentRequest,
} from './types.js'

/**
 * Payment by bank transfer. The degraded driver, and a real way to be paid.
 *
 * R1 and R2 are not negotiable: a shop must work end to end with no Stripe
 * account, no API key and no outbound network. This is what makes that true.
 * It is emphatically **not** a stub — a great many businesses invoice and are
 * paid by transfer, and nothing else. The difference from Stripe is not
 * "pretend" versus "real", it is *who confirms the money arrived*: a gateway
 * says so over an API, and here a human says so, by marking the payment
 * received once they have seen it on the statement.
 *
 * That is why it holds no state of its own. There is nothing to poll: the
 * truth lives in the payment row that `PaymentStore` owns, and a driver that
 * kept a second copy would only be able to disagree with it.
 */

/** The reference a shopper is asked to put on the transfer. */
export function transferReference(orderReference: string): string {
  return orderReference.toUpperCase()
}

const DEFAULT_INSTRUCTIONS =
  'Pay by bank transfer. Your order is reserved and will be prepared once the transfer arrives.'

function instructionsFor(config: PaymentConfig, request: StartPaymentRequest): string {
  const amount = formatMoney({
    amountMinor: request.amountMinor,
    currency: request.currency,
  })
  const preamble = config.transferInstructions ?? DEFAULT_INSTRUCTIONS
  return [
    preamble,
    `Amount: ${amount}`,
    `Reference to quote: ${transferReference(request.orderReference)}`,
  ].join('\n')
}

export function createManualPaymentGateway(config: PaymentConfig = {}): PaymentGateway {
  return {
    name: 'manual',
    settlesOffline: true,

    start: async (request) => {
      assertMinor(request.amountMinor, 'A payment amount')
      assertCurrency(request.currency)

      return {
        // The order's own reference *is* the external id here: it is what the
        // shopper types into their bank, and what the operator matches against
        // the statement. Inventing a second identifier would only give a human
        // two numbers to reconcile instead of one.
        externalId: transferReference(request.orderReference),
        status: 'pending',
        instructions: instructionsFor(config, request),
      }
    },

    fetch: async (externalId) => ({
      externalId,
      // Deliberately unchanged. There is nothing to ask: no API knows whether
      // this transfer landed, and returning anything else would be a guess
      // dressed up as a fact.
      status: 'pending',
      instructions: null,
    }),

    refund: async (request: DriverRefundRequest): Promise<DriverRefundResult> => {
      assertMinor(request.amountMinor, 'A refund amount')
      assertCurrency(request.currency)
      // A transfer back is made by a human too. `pending` is honest: the money
      // has not moved yet, and only the operator can say when it has.
      return { externalId: request.externalId, status: 'pending' }
    },

    verifyEvent: async () => {
      throw new CogentaError({
        code: 'COMMERCE_PAYMENT_UNSUPPORTED',
        message: 'Bank transfer has no inbound notification to verify.',
        hint: 'A transfer is confirmed by a person marking the payment received, not by a webhook.',
      })
    },
  }
}

/**
 * The degraded tier, and therefore the last one the registry tries — and the
 * one it always finds. `available()` is unconditionally true because there is
 * nothing that could be unavailable, which is precisely the property R1 asks a
 * degraded driver to have.
 */
export function manualPaymentDriver(): PaymentDriver {
  let gateway: PaymentGateway | undefined

  return {
    name: 'manual',
    tier: 'degraded',
    available: async () => true,
    init: async (config) => {
      gateway = createManualPaymentGateway(config)
      return gateway
    },
    dispose: async () => {
      gateway = undefined
    },
    health: async (): Promise<HealthReport> => ({
      status: 'ok',
      driver: 'manual',
      tier: 'degraded',
      message:
        gateway === undefined
          ? 'Not started yet. Bank transfer needs no external service.'
          : 'Bank transfer needs no external service, so it is never down.',
    }),
  }
}
