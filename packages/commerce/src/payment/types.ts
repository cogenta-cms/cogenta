import type { Driver, DriverChoice } from '@cogenta/core'

/**
 * Where a payment is in its life. Deliberately small.
 *
 * A gateway has dozens of internal states; a shop needs to know whether it has
 * the money. Every driver maps its own vocabulary onto these six, so the order
 * store never branches on a gateway-specific string.
 */
export const PAYMENT_STATUSES = [
  /** Created, waiting for the shopper (or for a bank transfer to arrive). */
  'pending',
  /** The gateway holds the funds but has not moved them. */
  'authorised',
  'paid',
  'failed',
  'cancelled',
  'refunded',
] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export interface PaymentRecord {
  readonly id: string
  readonly orderId: string
  readonly driver: string
  /** The gateway's own identifier, or null for a driver that has none yet. */
  readonly externalId: string | null
  readonly status: PaymentStatus
  readonly amountMinor: number
  readonly currency: string
  /** Shown to the shopper: bank details, or a URL to finish the payment. */
  readonly instructions: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface RefundRecord {
  readonly id: string
  readonly paymentId: string
  readonly orderId: string
  readonly externalId: string | null
  readonly status: 'pending' | 'refunded' | 'failed'
  readonly amountMinor: number
  readonly currency: string
  readonly reason: string | null
  readonly createdAt: string
}

export interface StartPaymentRequest {
  readonly orderId: string
  readonly orderReference: string
  readonly amountMinor: number
  readonly currency: string
  readonly customerEmail: string
  /** Where the shopper should end up after a redirect, if the driver uses one. */
  readonly returnUrl?: string
  readonly description?: string
}

/** What a driver hands back. Never a record: the store owns persistence. */
export interface StartedPayment {
  readonly externalId: string | null
  readonly status: PaymentStatus
  readonly instructions: string | null
}

export interface DriverRefundRequest {
  readonly externalId: string
  readonly amountMinor: number
  readonly currency: string
  readonly reason?: string
}

export interface DriverRefundResult {
  readonly externalId: string | null
  readonly status: 'pending' | 'refunded' | 'failed'
}

/**
 * A payment event that arrived from outside, already proven authentic.
 *
 * `orderReference` rather than `orderId`: what comes back from a gateway is
 * whatever was put in when the payment started, and a reference is what a
 * human reads on a bank statement.
 */
export interface PaymentEvent {
  readonly externalId: string
  readonly orderReference: string | null
  readonly status: PaymentStatus
  readonly amountMinor: number | null
  readonly currency: string | null
}

/**
 * One payment gateway.
 *
 * Interface plus at least two implementations, exactly like cache, queue and
 * storage (R1, ADR-0005). The degraded one — bank transfer — depends on no
 * external service at all, which is what makes R2 true for a shop: no Stripe
 * key, and the till still works. It is not a stub: plenty of real businesses
 * are paid by transfer and nothing else.
 */
export interface PaymentGateway {
  readonly name: string
  /**
   * True when money moves outside any API and a human confirms it.
   *
   * The order store branches on this rather than on the driver's name, so a
   * second offline driver (cash on delivery, cheque) needs no new condition
   * anywhere.
   */
  readonly settlesOffline: boolean
  start(request: StartPaymentRequest): Promise<StartedPayment>
  /** Re-reads a payment from the gateway. Offline drivers report unchanged. */
  fetch(externalId: string): Promise<StartedPayment>
  refund(request: DriverRefundRequest): Promise<DriverRefundResult>
  /**
   * Verifies and decodes an inbound notification.
   *
   * Throws `COMMERCE_PAYMENT_UNSUPPORTED` for a driver that has no inbound
   * channel, and `COMMERCE_PAYMENT_SIGNATURE_INVALID` for one that does and is
   * handed something unsigned. Never returns an unverified event: an
   * unauthenticated "paid" notification is a way to get goods for free.
   */
  verifyEvent(payload: string, headers: Readonly<Record<string, string>>): Promise<PaymentEvent>
}

export interface PaymentConfig extends DriverChoice {
  /** Stripe's secret key. Absent on any site that has not configured one. */
  readonly secretKey?: string
  /** The signing secret Stripe shows when a webhook endpoint is created. */
  readonly webhookSecret?: string
  /** Overridden by tests to point at a local server. Never set in production. */
  readonly apiBaseUrl?: string
  /** Shown to the shopper by the offline driver. Free text, per site. */
  readonly transferInstructions?: string
}

export type PaymentDriver = Driver<PaymentGateway, PaymentConfig>
