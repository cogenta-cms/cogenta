import { CogentaError } from '@cogenta/core'

/**
 * What can happen to an order, and in what order.
 *
 * A closed union with an explicit transition table, rather than a free string
 * and a hope. Two things follow from that and both matter: an impossible
 * transition ("delivered" back to "pending") is refused rather than recorded,
 * and every screen that switches on a status is forced by the compiler to
 * handle a new one the day it is added.
 */
export const ORDER_STATUSES = [
  'pending',
  'paid',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

/**
 * The transitions a shop actually performs.
 *
 * Deliberately not a full graph. Notably absent:
 *
 * - nothing leaves `delivered` except `refunded`. Goods that arrived did
 *   arrive; the remedy is a refund, not a rewind.
 * - nothing leaves `cancelled` or `refunded` at all. Both are ends. Reviving a
 *   cancelled order would mean re-taking stock that was already put back,
 *   which is a second sale wearing the first one's number.
 * - `pending → shipped` is not allowed. Sending goods before payment is a
 *   decision a person makes deliberately, by marking the order paid first, so
 *   that the reason is recorded rather than implied.
 */
const TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  pending: ['paid', 'cancelled'],
  paid: ['shipped', 'cancelled', 'refunded'],
  shipped: ['delivered', 'refunded'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to)
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (canTransition(from, to)) return

  const allowed = TRANSITIONS[from] ?? []
  throw new CogentaError({
    code: 'COMMERCE_ORDER_TRANSITION_INVALID',
    message: `An order that is ${from} cannot become ${to}.`,
    hint:
      allowed.length === 0
        ? `${from} is a final state. Nothing follows it.`
        : `From ${from}, an order can become: ${allowed.join(', ')}.`,
    details: { from, to },
  })
}

/** Statuses in which the goods are still promised, so stock stays taken. */
export function holdsStock(status: OrderStatus): boolean {
  return status === 'pending' || status === 'paid' || status === 'shipped' || status === 'delivered'
}

export interface OrderLine {
  readonly id: string
  readonly variantId: string
  /** Copied at placement. A product renamed next year must not rewrite history. */
  readonly sku: string
  readonly title: string
  readonly quantity: number
  readonly unitPriceMinor: number
  readonly subtotalMinor: number
  readonly discountMinor: number
  readonly taxMinor: number
  readonly taxRateBp: number
  readonly totalMinor: number
  readonly position: number
}

export interface Order {
  readonly id: string
  /** Human-facing, unique, unrelated to any invoice number. */
  readonly reference: string
  readonly customerId: string | null
  readonly email: string
  readonly status: OrderStatus
  readonly currency: string
  readonly subtotalMinor: number
  readonly discountMinor: number
  readonly shippingMinor: number
  readonly taxMinor: number
  readonly totalMinor: number
  readonly couponCode: string | null
  readonly shippingCountry: string | null
  readonly shippingRegion: string | null
  readonly shippingMethodId: string | null
  readonly shippingMethodLabel: string | null
  readonly subscriptionId: string | null
  readonly lines: readonly OrderLine[]
  readonly placedAt: string
  readonly updatedAt: string
}

export const ORDER_EVENT_KINDS = [
  'placed',
  'status_changed',
  'payment_started',
  'payment_settled',
  'payment_failed',
  'refunded',
  'invoiced',
  'note',
] as const
export type OrderEventKind = (typeof ORDER_EVENT_KINDS)[number]

/** One line of an order's history. Append-only: nothing here is ever edited. */
export interface OrderEvent {
  readonly id: string
  readonly orderId: string
  readonly at: string
  readonly kind: OrderEventKind
  readonly fromStatus: OrderStatus | null
  readonly toStatus: OrderStatus | null
  readonly actorId: string | null
  readonly note: string | null
}
