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
