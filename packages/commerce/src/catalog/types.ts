/** A product is either sellable or it is not. There is no draft: the draft of
 * a product is its content entry (contract A), which has a real editorial
 * workflow. The commercial record only has to say whether it can be bought. */
export const PRODUCT_STATUSES = ['active', 'archived'] as const
export type ProductStatus = (typeof PRODUCT_STATUSES)[number]

/**
 * The link to the editorial face of a product.
 *
 * Optional in both directions (ADR draft 0023): a product with no entry sells
 * perfectly well from a back office, and a content entry with no product is
 * just a page. Not a foreign key — the entries table belongs to contract A's
 * migration engine and is named after a collection this package cannot know.
 */
export interface ContentRef {
  readonly collection: string
  readonly entryId: string
}

export interface Product {
  readonly id: string
  readonly handle: string
  /** A fallback name for admin lists and order lines. The *displayed* title of
   * a product with a content entry comes from that entry. */
  readonly title: string
  readonly status: ProductStatus
  readonly contentRef: ContentRef | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface Variant {
  readonly id: string
  readonly productId: string
  readonly sku: string
  readonly title: string
  readonly priceMinor: number
  readonly currency: string
  readonly onHand: number
  readonly allowBackorder: boolean
  readonly weightGrams: number
  /** Names a tax category, matched by the tax rules. `standard` by default. */
  readonly taxCategory: string
  readonly position: number
  /** Below this count (inclusive), `CatalogStore.listLowStock` reports the
   * variant. `null` means "not watched" — never "watched at zero" (fiche 51
   * task 4). */
  readonly lowStockThreshold: number | null
  /** The "was" price, shown struck through next to `priceMinor`. `null` means
   * no promotion is running (fiche 51 task 5). */
  readonly compareAtPriceMinor: number | null
  /** The window `compareAtPriceMinor` applies in. Either may be `null` alone —
   * an open start or an open end — but a promotion needs `compareAtPriceMinor`
   * set to mean anything; see `isOnSale`. */
  readonly saleStartsAt: string | null
  readonly saleEndsAt: string | null
  /** Millimetres. `null` when not measured, same convention as the price fields above. */
  readonly widthMm: number | null
  readonly heightMm: number | null
  readonly depthMm: number | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface CreateProductInput {
  readonly handle: string
  readonly title: string
  readonly status?: ProductStatus
  readonly contentRef?: ContentRef | null
}

export interface UpdateProductInput {
  readonly handle?: string
  readonly title?: string
  readonly status?: ProductStatus
  readonly contentRef?: ContentRef | null
}

export interface CreateVariantInput {
  readonly productId: string
  readonly sku: string
  readonly title: string
  readonly priceMinor: number
  readonly currency: string
  readonly onHand?: number
  readonly allowBackorder?: boolean
  readonly weightGrams?: number
  readonly taxCategory?: string
  readonly position?: number
  readonly lowStockThreshold?: number | null
  readonly compareAtPriceMinor?: number | null
  readonly saleStartsAt?: string | null
  readonly saleEndsAt?: string | null
  readonly widthMm?: number | null
  readonly heightMm?: number | null
  readonly depthMm?: number | null
}

export interface UpdateVariantInput {
  readonly sku?: string
  readonly title?: string
  readonly priceMinor?: number
  readonly currency?: string
  readonly allowBackorder?: boolean
  readonly weightGrams?: number
  readonly taxCategory?: string
  readonly position?: number
  readonly lowStockThreshold?: number | null
  readonly compareAtPriceMinor?: number | null
  readonly saleStartsAt?: string | null
  readonly saleEndsAt?: string | null
  readonly widthMm?: number | null
  readonly heightMm?: number | null
  readonly depthMm?: number | null
}

/** One classification of a product against a term of a taxonomy the site
 * declares (ADR-0022) — never a foreign key, for the reason `tables.ts`'s
 * `productTerms` comment gives. */
export interface ProductTerm {
  readonly taxonomy: string
  readonly termId: string
}

/** Why a stock movement happened. `manual` covers a correction typed directly
 * into the admin — anything that is not a sale, a restock or a stock take. */
export const STOCK_MOVEMENT_REASONS = ['sale', 'restock', 'stock_take', 'manual'] as const
export type StockMovementReason = (typeof STOCK_MOVEMENT_REASONS)[number]

/** What every stock-moving method (`setStock`/`restock`/`takeStock`) records
 * beyond the movement itself — optional everywhere, since none of this
 * package's own callers (an order placing or cancelling) currently supply it,
 * and their movements are still recorded, just with `actorId`/`referenceId`
 * left `null`. */
export interface StockMovementOptions {
  readonly actorId?: string | null
  readonly referenceId?: string | null
  readonly note?: string | null
}

/** One row of a variant's append-only stock history (fiche 51 task 4). Never
 * updated or deleted after it is written — a correction is a further row,
 * never an edit to this one. */
export interface StockMovement {
  readonly id: string
  readonly variantId: string
  /** Positive for stock added, negative for stock taken. */
  readonly delta: number
  /** What `onHand` became right after this movement. */
  readonly balanceAfter: number
  readonly reason: StockMovementReason
  readonly actorId: string | null
  /** An order id, most often — `null` when the movement has no such origin (a stock take). */
  readonly referenceId: string | null
  readonly note: string | null
  readonly createdAt: string
}

/** What one reservation asked for. */
export interface StockRequest {
  readonly variantId: string
  readonly quantity: number
}

/**
 * Why a stock movement failed, per variant.
 *
 * A list rather than a single failure: a basket of five lines where two are
 * short must tell the shopper about both, not make them retry five times.
 */
export interface StockShortfall {
  readonly variantId: string
  readonly requested: number
  readonly available: number
}

/**
 * Whether a variant's promotion (fiche 51 task 5) applies right now.
 *
 * `compareAtPriceMinor` is what makes a promotion exist at all — a schedule
 * with no "was" price to show has nothing to display. An open start or end
 * means "always", not "never": a sale with only an end date is already
 * running, and one with only a start date has no announced finish.
 */
export function isOnSale(
  variant: Pick<Variant, 'compareAtPriceMinor' | 'saleStartsAt' | 'saleEndsAt'>,
  now: Date = new Date(),
): boolean {
  if (variant.compareAtPriceMinor === null) return false
  if (variant.saleStartsAt !== null && now < new Date(variant.saleStartsAt)) return false
  if (variant.saleEndsAt !== null && now > new Date(variant.saleEndsAt)) return false
  return true
}
