import { API_BASE, ApiError, authHeader, requestBody } from './http.js'

/**
 * `/api/commerce` — contract E's back office (ADR-0024), the admin's own
 * client for it.
 *
 * Unlike `/api/users` or `/api/content`, this router does not wrap its body
 * in `{ data }` — it is `@cogenta/commerce`'s own transport-free shape,
 * reused verbatim by `cogenta serve` (see `createCommerceAdminRouter`). So
 * this file calls `requestBody`, never `request`, and every function here
 * reads the field the router actually returns.
 *
 * Every call is permission-checked server-side against contract E's own
 * vocabulary (`commerce.read`, `commerce.catalog.write`, …) — nothing here is
 * a security boundary, only a courtesy that keeps the screen from offering a
 * button that would 403 (R4).
 */

export type ProductStatus = 'active' | 'archived'

export interface Product {
  readonly id: string
  readonly handle: string
  readonly title: string
  readonly status: ProductStatus
  readonly contentRef: { readonly collection: string; readonly entryId: string } | null
  /** Media library ids, in display order — the first is the cover shown in
   * admin lists and order lines. */
  readonly imageMediaIds: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
}

export interface Variant {
  readonly id: string
  readonly productId: string
  readonly sku: string
  readonly title: string
  /** Minor units — cents, not euros. The admin converts at the edges, never the server. */
  readonly priceMinor: number
  readonly currency: string
  readonly onHand: number
  readonly allowBackorder: boolean
  readonly weightGrams: number
  readonly taxCategory: string
  readonly position: number
  /** `null` means "not watched" — fiche 51 task 4. */
  readonly lowStockThreshold: number | null
  /** The "was" price, shown struck through. `null` means no promotion (fiche 51 task 5). */
  readonly compareAtPriceMinor: number | null
  readonly saleStartsAt: string | null
  readonly saleEndsAt: string | null
  readonly widthMm: number | null
  readonly heightMm: number | null
  readonly depthMm: number | null
  /** A single media library id, or `null` — one photo per variant. */
  readonly imageMediaId: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

/** A product's classification against a taxonomy the site declares (ADR-0022, fiche 51 task 3). */
export interface ProductTerm {
  readonly taxonomy: string
  readonly termId: string
}

export const STOCK_MOVEMENT_REASONS = ['sale', 'restock', 'stock_take', 'manual'] as const
export type StockMovementReason = (typeof STOCK_MOVEMENT_REASONS)[number]

/** One row of a variant's append-only stock history (fiche 51 task 4). */
export interface StockMovement {
  readonly id: string
  readonly variantId: string
  readonly delta: number
  readonly balanceAfter: number
  readonly reason: StockMovementReason
  readonly actorId: string | null
  readonly referenceId: string | null
  readonly note: string | null
  readonly createdAt: string
}

export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'

export interface OrderLine {
  readonly id: string
  readonly variantId: string
  readonly sku: string
  readonly title: string
  readonly quantity: number
  readonly unitPriceMinor: number
  readonly subtotalMinor: number
  readonly discountMinor: number
  readonly taxMinor: number
  readonly totalMinor: number
  readonly position: number
}

/** A real postal address (fiche 52 task 1) — never `shippingCountry`/`shippingRegion` alone. */
export interface ShippingAddress {
  readonly line1: string
  readonly line2?: string | null
  readonly city: string
  readonly postalCode: string
  readonly recipient?: string | null
  readonly phone?: string | null
}

export interface Order {
  readonly id: string
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
  readonly shippingAddressLine1: string | null
  readonly shippingAddressLine2: string | null
  readonly shippingCity: string | null
  readonly shippingPostalCode: string | null
  readonly shippingRecipient: string | null
  readonly shippingPhone: string | null
  readonly trackingCarrier: string | null
  readonly trackingNumber: string | null
  readonly trackingUrl: string | null
  readonly shippedAt: string | null
  readonly placedAt: string
  readonly updatedAt: string
  readonly lines: readonly OrderLine[]
}

export type OrderEventKind =
  | 'placed'
  | 'status_changed'
  | 'payment_started'
  | 'payment_settled'
  | 'payment_failed'
  | 'refunded'
  | 'invoiced'
  | 'address_updated'
  | 'tracking_added'
  | 'note'

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

export type CouponKind = 'percentage' | 'fixed' | 'free_shipping'

export interface Coupon {
  readonly code: string
  readonly kind: CouponKind
  readonly value: number
  readonly currency: string | null
  readonly minSubtotalMinor: number
  readonly startsAt: string | null
  readonly endsAt: string | null
  readonly maxRedemptions: number | null
  readonly redemptions: number
  readonly maxRedemptionsPerCustomer: number | null
  readonly restrictedProductIds: readonly string[]
  readonly active: boolean
  readonly createdAt: string
}

export interface CouponMetrics {
  readonly activeCoupons: number
  readonly totalRedemptions: number
  readonly discountGivenMinor: readonly {
    readonly currency: string
    readonly amountMinor: number
  }[]
  readonly revenueMinor: readonly { readonly currency: string; readonly amountMinor: number }[]
}

export type SubscriptionStatus = 'active' | 'past_due' | 'paused' | 'cancelled'
export type IntervalUnit = 'day' | 'week' | 'month' | 'year'

export interface Subscription {
  readonly id: string
  readonly customerId: string
  readonly variantId: string
  readonly quantity: number
  readonly status: SubscriptionStatus
  readonly intervalUnit: IntervalUnit
  readonly intervalCount: number
  readonly priceMinor: number
  readonly currency: string
  readonly nextBillingAt: string
  readonly createdAt: string
  readonly cancelledAt: string | null
}

export interface SubscriptionCycle {
  readonly id: string
  readonly subscriptionId: string
  readonly periodStart: string
  readonly periodEnd: string
  readonly orderId: string | null
  readonly status: 'billed' | 'skipped_out_of_stock' | 'failed'
  readonly createdAt: string
}

export interface SubscriptionDunning {
  readonly subscriptionId: string
  readonly orderId: string
  readonly periodKey: string
  readonly failureCount: number
  readonly firstFailedAt: string
  readonly nextRetryAt: string | null
  readonly lastReason: string | null
  readonly suspendedAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface SubscriptionMetrics {
  readonly active: number
  readonly pastDue: number
  readonly paused: number
  readonly cancelled: number
  readonly mrrMinor: readonly { readonly currency: string; readonly amountMinor: number }[]
  readonly churnRate: number
}

export interface InvoiceDocument {
  readonly number: string
  readonly issuedAt: string
  readonly orderReference: string
  readonly seller: readonly string[]
  readonly buyer: readonly string[]
  readonly currency: string
  readonly lines: readonly {
    readonly sku: string
    readonly title: string
    readonly quantity: number
    readonly unitPriceMinor: number
    readonly taxRateBp: number
    readonly totalMinor: number
  }[]
  readonly subtotalMinor: number
  readonly discountMinor: number
  readonly shippingMinor: number
  readonly taxMinor: number
  readonly totalMinor: number
  readonly footer: string | null
}

export interface Invoice {
  readonly id: string
  readonly orderId: string
  readonly series: string
  readonly seq: number
  readonly number: string
  readonly issuedAt: string
  readonly currency: string
  readonly totalMinor: number
  readonly document: InvoiceDocument
}

export interface Payment {
  readonly id: string
  readonly orderId: string
  readonly driver: string
  readonly status: 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded'
  readonly amountMinor: number
  readonly currency: string
  readonly instructions: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface RefundRecord {
  readonly id: string
  readonly paymentId: string
  readonly orderId: string
  readonly status: string
  readonly amountMinor: number
  readonly currency: string
  readonly reason: string | null
  readonly createdAt: string
}

export interface CreditNote {
  readonly id: string
  readonly orderId: string
  readonly refundId: string
  readonly number: string
  readonly issuedAt: string
  readonly currency: string
  readonly amountMinor: number
  readonly reason: string | null
}

export interface OrderEmailRecord {
  readonly id: string
  readonly orderId: string
  readonly kind: 'confirmation' | 'shipment'
  readonly toEmail: string
  readonly status: 'pending' | 'sent' | 'failed'
  readonly attempts: number
  readonly lastError: string | null
  readonly createdAt: string
  readonly sentAt: string | null
}

export interface Customer {
  readonly id: string
  readonly email: string
  readonly name: string | null
  readonly userId: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface CustomerDetail {
  readonly customer: Customer
  readonly orders: readonly Order[]
  readonly totalSpentMinor: number
  readonly currency: string | null
  readonly subscriptions: readonly Subscription[]
}

export type ProductSort = 'createdAt' | 'title' | 'handle'
export type SortDirection = 'asc' | 'desc'

export interface ListProductsFilter {
  readonly status?: ProductStatus
  readonly q?: string
  readonly limit?: number
  readonly offset?: number
  readonly sort?: ProductSort
  readonly direction?: SortDirection
}

export function listProducts(
  token: string,
  filter: ListProductsFilter = {},
): Promise<{ readonly products: readonly Product[]; readonly hasMore: boolean }> {
  const params = new URLSearchParams()
  if (filter.status !== undefined) params.set('status', filter.status)
  if (filter.q !== undefined && filter.q !== '') params.set('q', filter.q)
  if (filter.limit !== undefined) params.set('limit', String(filter.limit))
  if (filter.offset !== undefined) params.set('offset', String(filter.offset))
  if (filter.sort !== undefined) params.set('sort', filter.sort)
  if (filter.direction !== undefined) params.set('direction', filter.direction)
  const query = params.toString()
  return requestBody(`/api/commerce/products${query === '' ? '' : `?${query}`}`, {
    headers: authHeader(token),
  })
}

export function readProduct(
  token: string,
  id: string,
): Promise<{
  readonly product: Product
  readonly variants: readonly Variant[]
  readonly terms: readonly ProductTerm[]
}> {
  return requestBody(`/api/commerce/products/${encodeURIComponent(id)}`, {
    headers: authHeader(token),
  })
}

/** The reverse of `contentRef` — what the content editor's own cross-link (fiche 51 task 1) asks. */
export function findProductByContent(
  token: string,
  collection: string,
  entryId: string,
): Promise<{ readonly product: Product | null }> {
  const params = new URLSearchParams({ collection, entryId })
  return requestBody(`/api/commerce/products/by-content?${params.toString()}`, {
    headers: authHeader(token),
  })
}

/** Replaces everything a product carries in `taxonomy` with `termIds` (fiche 51 task 3). */
export function setProductTerms(
  token: string,
  productId: string,
  taxonomy: string,
  termIds: readonly string[],
): Promise<{ readonly terms: readonly ProductTerm[] }> {
  return requestBody(`/api/commerce/products/${encodeURIComponent(productId)}/terms`, {
    method: 'PUT',
    headers: authHeader(token),
    body: JSON.stringify({ taxonomy, termIds }),
  })
}

export function listLowStockVariants(
  token: string,
): Promise<{ readonly variants: readonly Variant[] }> {
  return requestBody('/api/commerce/variants/low-stock', { headers: authHeader(token) })
}

export function listStockMovements(
  token: string,
  variantId: string,
): Promise<{ readonly movements: readonly StockMovement[] }> {
  return requestBody(`/api/commerce/variants/${encodeURIComponent(variantId)}/stock-movements`, {
    headers: authHeader(token),
  })
}

export function exportProductsCsv(
  token: string,
): Promise<{ readonly csv: string; readonly filename: string }> {
  return requestBody('/api/commerce/products/export', { headers: authHeader(token) })
}

export interface ProductImportIssue {
  readonly line: number
  readonly detail: string
}

export type ProductImportOutcomeKind = 'create' | 'update' | 'duplicate'

export interface ProductImportRowOutcome {
  readonly line: number
  readonly handle: string
  readonly sku: string
  readonly outcome: ProductImportOutcomeKind
  readonly detail?: string
}

export interface ProductImportPreview {
  readonly rows: readonly ProductImportRowOutcome[]
  readonly issues: readonly ProductImportIssue[]
  readonly summary: Readonly<Record<string, number>>
}

export interface ProductImportResult {
  readonly created: number
  readonly updated: number
  readonly skipped: number
  readonly failed: readonly ProductImportIssue[]
}

export function previewProductsImport(token: string, csv: string): Promise<ProductImportPreview> {
  return requestBody('/api/commerce/products/import', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ csv }),
  })
}

export function applyProductsImport(token: string, csv: string): Promise<ProductImportResult> {
  return requestBody('/api/commerce/products/import', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ csv, apply: true }),
  })
}

export function createProduct(
  token: string,
  input: { readonly handle: string; readonly title: string },
): Promise<Product> {
  return requestBody('/api/commerce/products', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export function updateProduct(
  token: string,
  id: string,
  changes: {
    readonly handle?: string
    readonly title?: string
    readonly status?: ProductStatus
    /** `null` unlinks, an object links, omitted leaves it alone (fiche 51 task 1). */
    readonly contentRef?: { readonly collection: string; readonly entryId: string } | null
    readonly imageMediaIds?: readonly string[]
  },
): Promise<Product> {
  return requestBody(`/api/commerce/products/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(changes),
  })
}

export async function archiveProduct(token: string, id: string): Promise<void> {
  await requestBody(`/api/commerce/products/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}

/** The optional fields tasks 4-5 added — nullable everywhere, `undefined` left out of the request entirely rather than sent as `null` (which would *clear* an existing value on an update). */
export interface VariantExtraFields {
  readonly allowBackorder?: boolean
  readonly weightGrams?: number
  readonly taxCategory?: string
  readonly lowStockThreshold?: number | null
  readonly compareAtPriceMinor?: number | null
  readonly saleStartsAt?: string | null
  readonly saleEndsAt?: string | null
  readonly widthMm?: number | null
  readonly heightMm?: number | null
  readonly depthMm?: number | null
  readonly imageMediaId?: string | null
}

export function createVariant(
  token: string,
  productId: string,
  input: {
    readonly sku: string
    readonly title: string
    readonly priceMinor: number
    readonly currency: string
    readonly onHand?: number
  } & VariantExtraFields,
): Promise<Variant> {
  return requestBody(`/api/commerce/products/${encodeURIComponent(productId)}/variants`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export function updateVariant(
  token: string,
  id: string,
  changes: {
    readonly sku?: string
    readonly title?: string
    readonly priceMinor?: number
  } & VariantExtraFields,
): Promise<Variant> {
  return requestBody(`/api/commerce/variants/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(changes),
  })
}

/** Stock is its own route on the server on purpose — never a field a stale form can overwrite (see `router.ts`). */
export function setStock(token: string, variantId: string, onHand: number): Promise<Variant> {
  return requestBody(`/api/commerce/variants/${encodeURIComponent(variantId)}/stock`, {
    method: 'PUT',
    headers: authHeader(token),
    body: JSON.stringify({ onHand }),
  })
}

export async function deleteVariant(token: string, id: string): Promise<void> {
  await requestBody(`/api/commerce/variants/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}

// ---- customers ----------------------------------------------------------------

/** Fiche 52 task 3 — the list route already existed server-side; nothing in the admin ever called it. */
export function listCustomers(
  token: string,
  search: string,
): Promise<{ readonly customers: readonly Customer[] }> {
  const query = search.trim() === '' ? '' : `?q=${encodeURIComponent(search.trim())}`
  return requestBody(`/api/commerce/customers${query}`, { headers: authHeader(token) })
}

export function readCustomer(token: string, id: string): Promise<CustomerDetail> {
  return requestBody(`/api/commerce/customers/${encodeURIComponent(id)}`, {
    headers: authHeader(token),
  })
}

/** GDPR export (fiche 52 task 3) — the customer's own record plus their orders and subscriptions. */
export function exportCustomer(token: string, id: string): Promise<CustomerDetail> {
  return requestBody(`/api/commerce/customers/${encodeURIComponent(id)}/export`, {
    method: 'POST',
    headers: authHeader(token),
  })
}

/** GDPR erasure of the customer record (fiche 52 task 3) — see `CustomerStore.anonymize`'s own comment on scope. */
export function anonymizeCustomer(token: string, id: string): Promise<Customer> {
  return requestBody(`/api/commerce/customers/${encodeURIComponent(id)}/anonymize`, {
    method: 'POST',
    headers: authHeader(token),
  })
}

/**
 * `q` finds an order by a substring of its reference or its customer email
 * (fiche 36 task 4). `from`/`to` are an inclusive placed-at date range —
 * ISO 8601 date strings, e.g. `2026-08-01` — the advanced filters of fiche
 * 52 task 7.
 */
export function listOrders(
  token: string,
  status?: OrderStatus,
  q?: string,
  range?: { readonly from?: string; readonly to?: string },
): Promise<{ readonly orders: readonly Order[] }> {
  const params = new URLSearchParams()
  if (status !== undefined) params.set('status', status)
  if (q !== undefined && q.trim() !== '') params.set('q', q)
  if (range?.from !== undefined && range.from !== '') params.set('from', range.from)
  if (range?.to !== undefined && range.to !== '') params.set('to', range.to)
  const query = params.toString()
  return requestBody(`/api/commerce/orders${query === '' ? '' : `?${query}`}`, {
    headers: authHeader(token),
  })
}

/** A shopkeeper-entered order (fiche 52 task 5) — a phone order, a trade-show sale, a correction. */
export type PlaceOrderOutcome =
  | { readonly kind: 'placed'; readonly order: Order }
  | { readonly kind: 'out_of_stock'; readonly shortfalls: readonly unknown[] }
  | { readonly kind: 'coupon_refused'; readonly reason: string }
  | { readonly kind: 'empty' }

export function createManualOrder(
  token: string,
  input: {
    readonly email: string
    readonly customerName?: string
    readonly currency: string
    readonly lines: readonly { readonly variantId: string; readonly quantity: number }[]
    readonly shippingAddress?: ShippingAddress
  },
): Promise<PlaceOrderOutcome> {
  return requestBody('/api/commerce/orders', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

/**
 * Corrects the e-mail/address before payment (fiche 52 task 5,
 * "modification pré-paiement") — the server locks this once the order is no
 * longer `pending` (`COMMERCE_ORDER_LOCKED`).
 */
export function updateOrder(
  token: string,
  id: string,
  patch: { readonly email?: string; readonly shippingAddress?: ShippingAddress | null },
): Promise<Order> {
  return requestBody(`/api/commerce/orders/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(patch),
  })
}

/** Shipment tracking (fiche 52 task 4) — moves a `paid` order to `shipped`. */
export function setOrderTracking(
  token: string,
  id: string,
  tracking: { readonly carrier: string; readonly number: string; readonly url?: string },
): Promise<Order> {
  return requestBody(`/api/commerce/orders/${encodeURIComponent(id)}/tracking`, {
    method: 'PUT',
    headers: authHeader(token),
    body: JSON.stringify(tracking),
  })
}

/** The transactional e-mail log for an order (fiche 52 task 2) — the "journal visible sur la commande". */
export function listOrderEmails(
  token: string,
  orderId: string,
): Promise<{ readonly emails: readonly OrderEmailRecord[] }> {
  return requestBody(`/api/commerce/orders/${encodeURIComponent(orderId)}/emails`, {
    headers: authHeader(token),
  })
}

export function listCreditNotes(
  token: string,
  orderId: string,
): Promise<{ readonly creditNotes: readonly CreditNote[] }> {
  return requestBody(`/api/commerce/orders/${encodeURIComponent(orderId)}/credit-notes`, {
    headers: authHeader(token),
  })
}

/**
 * The accounting export (fiche 52 task 7) — plain CSV text, not JSON, so
 * this uses `fetch` directly the same way `fetchInvoicePdf` reads bytes
 * rather than running the response through `response.json()`.
 */
export async function exportOrdersCsv(
  token: string,
  filter: {
    readonly status?: OrderStatus
    readonly from?: string
    readonly to?: string
    readonly q?: string
  } = {},
): Promise<string> {
  const params = new URLSearchParams()
  if (filter.status !== undefined) params.set('status', filter.status)
  if (filter.from !== undefined && filter.from !== '') params.set('from', filter.from)
  if (filter.to !== undefined && filter.to !== '') params.set('to', filter.to)
  if (filter.q !== undefined && filter.q.trim() !== '') params.set('q', filter.q)
  const query = params.toString()
  const response = await fetch(
    `${API_BASE}/api/commerce/orders/export.csv${query === '' ? '' : `?${query}`}`,
    { headers: authHeader(token) },
  )
  if (!response.ok) {
    throw new ApiError('INTERNAL', 'The export could not be generated.', undefined)
  }
  return response.text()
}

export function readOrder(
  token: string,
  id: string,
): Promise<{
  readonly order: Order
  readonly history: readonly OrderEvent[]
  readonly payments: readonly Payment[]
}> {
  return requestBody(`/api/commerce/orders/${encodeURIComponent(id)}`, {
    headers: authHeader(token),
  })
}

export function transitionOrder(
  token: string,
  id: string,
  status: OrderStatus,
  note?: string,
): Promise<Order> {
  return requestBody(`/api/commerce/orders/${encodeURIComponent(id)}/status`, {
    method: 'PUT',
    headers: authHeader(token),
    body: JSON.stringify(note === undefined ? { status } : { status, note }),
  })
}

export function settlePayment(token: string, paymentId: string, note?: string): Promise<Payment> {
  return requestBody(`/api/commerce/payments/${encodeURIComponent(paymentId)}/settle`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(note === undefined ? {} : { note }),
  })
}

/**
 * A partial (or full) refund. `reason` is required by the server (fiche 52
 * task 6, "motif obligatoire") — passing none is a caller bug, not something
 * this function should paper over with an empty string. A credit note is
 * issued automatically alongside the refund when the shop has billing
 * configured; `null` when it does not.
 */
/** Every refund issued against a payment — what a "remaining refundable" figure is computed from. */
export function listRefunds(
  token: string,
  paymentId: string,
): Promise<{ readonly refunds: readonly RefundRecord[] }> {
  return requestBody(`/api/commerce/payments/${encodeURIComponent(paymentId)}/refunds`, {
    headers: authHeader(token),
  })
}

export function refundPayment(
  token: string,
  paymentId: string,
  amountMinor: number,
  reason: string,
): Promise<{ readonly refund: RefundRecord; readonly creditNote: CreditNote | null }> {
  return requestBody(`/api/commerce/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ amountMinor, reason }),
  })
}

// ---- coupons --------------------------------------------------------------

export function listCoupons(token: string): Promise<{ readonly coupons: readonly Coupon[] }> {
  return requestBody('/api/commerce/coupons', { headers: authHeader(token) })
}

export function createCoupon(
  token: string,
  input: {
    readonly code: string
    readonly kind: CouponKind
    readonly value?: number
    readonly currency?: string
    readonly minSubtotalMinor?: number
    readonly startsAt?: string
    readonly endsAt?: string
    readonly maxRedemptions?: number
    readonly maxRedemptionsPerCustomer?: number
    readonly restrictedProductIds?: readonly string[]
  },
): Promise<Coupon> {
  return requestBody('/api/commerce/coupons', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export async function deactivateCoupon(token: string, code: string): Promise<void> {
  await requestBody(`/api/commerce/coupons/${encodeURIComponent(code)}/deactivate`, {
    method: 'POST',
    headers: authHeader(token),
  })
}

export function getCouponMetrics(token: string): Promise<CouponMetrics> {
  return requestBody('/api/commerce/coupons/metrics', { headers: authHeader(token) })
}

// ---- subscriptions ----------------------------------------------------------

export function listSubscriptions(
  token: string,
  status?: SubscriptionStatus,
): Promise<{ readonly subscriptions: readonly Subscription[] }> {
  const query = status === undefined ? '' : `?status=${encodeURIComponent(status)}`
  return requestBody(`/api/commerce/subscriptions${query}`, { headers: authHeader(token) })
}

export function readSubscription(
  token: string,
  id: string,
): Promise<{
  readonly subscription: Subscription
  readonly cycles: readonly SubscriptionCycle[]
  readonly dunning: SubscriptionDunning | null
}> {
  return requestBody(`/api/commerce/subscriptions/${encodeURIComponent(id)}`, {
    headers: authHeader(token),
  })
}

export function pauseSubscription(token: string, id: string): Promise<Subscription> {
  return requestBody(`/api/commerce/subscriptions/${encodeURIComponent(id)}/pause`, {
    method: 'POST',
    headers: authHeader(token),
  })
}

export function resumeSubscription(token: string, id: string): Promise<Subscription> {
  return requestBody(`/api/commerce/subscriptions/${encodeURIComponent(id)}/resume`, {
    method: 'POST',
    headers: authHeader(token),
  })
}

export function cancelSubscription(token: string, id: string): Promise<Subscription> {
  return requestBody(`/api/commerce/subscriptions/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    headers: authHeader(token),
  })
}

/**
 * Audit T-COM-02: named so the screen that finally calls this (fiche 53
 * task 4 shipped the route with no client caller) can type its own result
 * state without repeating the shape inline.
 */
export interface ChangePlanResult {
  readonly subscription: Subscription
  /** Positive: charged immediately via `prorationOrderId`. Zero: nothing was due. Negative: a downgrade's credit — this package has no credit-note mechanism, so it is reported, never silently applied. */
  readonly prorationMinor: number
  readonly prorationOrderId: string | null
}

export function changeSubscriptionPlan(
  token: string,
  id: string,
  input: { readonly variantId: string; readonly quantity?: number; readonly prorate?: boolean },
): Promise<ChangePlanResult> {
  return requestBody(`/api/commerce/subscriptions/${encodeURIComponent(id)}/change-plan`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export function getSubscriptionMetrics(token: string): Promise<SubscriptionMetrics> {
  return requestBody('/api/commerce/subscriptions/metrics', { headers: authHeader(token) })
}

// ---- invoices ---------------------------------------------------------------

export function readInvoice(token: string, orderId: string): Promise<Invoice | null> {
  return requestBody<Invoice>(`/api/commerce/orders/${encodeURIComponent(orderId)}/invoice`, {
    headers: authHeader(token),
  }).catch((error: unknown) => {
    if (error instanceof ApiError && error.code === 'COMMERCE_INVOICE_NOT_FOUND') return null
    throw error
  })
}

export function issueInvoice(token: string, orderId: string): Promise<Invoice> {
  return requestBody(`/api/commerce/orders/${encodeURIComponent(orderId)}/invoice`, {
    method: 'POST',
    headers: authHeader(token),
  })
}

/**
 * The one commerce response that is not JSON. A plain `fetch`, not
 * `requestBody`, because the PDF's bytes must never be run through
 * `response.json()`.
 */
export async function fetchInvoicePdf(token: string, orderId: string): Promise<Blob> {
  const response = await fetch(
    `${API_BASE}/api/commerce/orders/${encodeURIComponent(orderId)}/invoice/pdf`,
    { headers: authHeader(token) },
  )
  if (!response.ok) {
    throw new ApiError('COMMERCE_INVOICE_NOT_FOUND', 'This order has no invoice yet.', undefined)
  }
  return response.blob()
}

/**
 * A real preview PDF for an order, whether or not it has ever been invoiced
 * — fiche 54 task 2. Never issues anything: see `InvoiceStore.preview`'s own
 * comment in `@cogenta/commerce` for why a preview must never claim a real
 * invoice number.
 */
export async function fetchInvoicePreviewPdf(token: string, orderId: string): Promise<Blob> {
  const response = await fetch(
    `${API_BASE}/api/commerce/orders/${encodeURIComponent(orderId)}/invoice/preview`,
    { headers: authHeader(token) },
  )
  if (!response.ok) {
    throw new ApiError('COMMERCE_ORDER_NOT_FOUND', 'This order does not exist.', undefined)
  }
  return response.blob()
}

// ---- permissions --------------------------------------------------------------

/** Contract E's own permission vocabulary, and which roles this site actually grants each one — fiche 19's permission matrix. */
export function getCommercePermissions(token: string): Promise<{
  readonly permissions: readonly string[]
  readonly roles: Readonly<Record<string, readonly string[]>>
}> {
  return requestBody('/api/commerce/permissions', { headers: authHeader(token) })
}

// ---- tax (fiche 34 task 1) --------------------------------------------------

export interface TaxRule {
  readonly id: string
  readonly country: string | null
  readonly region: string | null
  readonly taxCategory: string
  readonly name: string
  readonly rateBp: number
  readonly includedInPrice: boolean
  readonly priority: number
  readonly active: boolean
  readonly createdAt: string
}

export interface TaxOutcome {
  readonly rateBp: number
  readonly taxMinor: number
  readonly includedInPrice: boolean
  readonly ruleName: string | null
}

export function listTaxRules(token: string): Promise<{ readonly rules: readonly TaxRule[] }> {
  return requestBody('/api/commerce/tax/rules', { headers: authHeader(token) })
}

export function createTaxRule(
  token: string,
  input: {
    readonly name: string
    readonly rateBp: number
    readonly country?: string
    readonly region?: string
    readonly taxCategory?: string
    readonly includedInPrice?: boolean
    readonly priority?: number
  },
): Promise<TaxRule> {
  return requestBody('/api/commerce/tax/rules', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export async function deleteTaxRule(token: string, id: string): Promise<void> {
  await requestBody(`/api/commerce/tax/rules/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}

/** Calls the exact resolver checkout uses — never a second implementation of "which rule wins". */
export function simulateTax(
  token: string,
  input: {
    readonly amountMinor: number
    readonly taxCategory?: string
    readonly country?: string
    readonly region?: string
  },
): Promise<{ readonly rule: TaxRule | null; readonly outcome: TaxOutcome }> {
  return requestBody('/api/commerce/tax/simulate', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

// ---- shipping (fiche 34 task 2) ---------------------------------------------

export type ShippingKind = 'flat' | 'by_weight' | 'free' | 'pickup'

export interface ShippingMethod {
  readonly id: string
  readonly label: string
  readonly country: string | null
  readonly region: string | null
  readonly kind: ShippingKind
  readonly currency: string
  readonly amountMinor: number
  readonly perKgMinor: number
  readonly freeOverMinor: number | null
  readonly carrier: string | null
  readonly position: number
  readonly active: boolean
  readonly createdAt: string
}

export interface ShippingQuote {
  readonly methodId: string
  readonly label: string
  readonly amountMinor: number
  readonly currency: string
  readonly carrier: string | null
}

export function listShippingMethods(
  token: string,
): Promise<{ readonly methods: readonly ShippingMethod[] }> {
  return requestBody('/api/commerce/shipping/methods', { headers: authHeader(token) })
}

export function createShippingMethod(
  token: string,
  input: {
    readonly label: string
    readonly currency: string
    readonly kind?: ShippingKind
    readonly country?: string
    readonly region?: string
    readonly amountMinor?: number
    readonly perKgMinor?: number
    readonly freeOverMinor?: number
    readonly carrier?: string
  },
): Promise<ShippingMethod> {
  return requestBody('/api/commerce/shipping/methods', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export async function deleteShippingMethod(token: string, id: string): Promise<void> {
  await requestBody(`/api/commerce/shipping/methods/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}

export function simulateShipping(
  token: string,
  input: {
    readonly currency: string
    readonly weightGrams?: number
    readonly subtotalMinor?: number
    readonly country?: string
    readonly region?: string
  },
): Promise<{ readonly quotes: readonly ShippingQuote[] }> {
  return requestBody('/api/commerce/shipping/simulate', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

// ---- payment (fiche 34 task 3) -----------------------------------------------

export interface PaymentDriverStatus {
  readonly name: string
  readonly tier: 'optimal' | 'degraded'
  readonly settlesOffline: boolean
  /** Whether this server can reach the driver with its configured credentials — never the credential itself. */
  readonly configured: boolean
  /** `true`/`false` when a driver is explicitly named in configuration, `undefined` on `auto`. */
  readonly selected: boolean | undefined
}

export function listPaymentDrivers(token: string): Promise<{
  readonly drivers: readonly PaymentDriverStatus[]
  readonly testMode: boolean
  readonly webhookUrl: string | null
}> {
  return requestBody('/api/commerce/payment/drivers', { headers: authHeader(token) })
}

export function testPaymentConnection(
  token: string,
  driver: string,
): Promise<{ readonly ok: boolean; readonly message: string | null }> {
  return requestBody(
    `/api/commerce/payment/drivers/${encodeURIComponent(driver)}/test-connection`,
    {
      method: 'POST',
      headers: authHeader(token),
    },
  )
}
