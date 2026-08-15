import {
  CogentaError,
  type DatabaseHandle,
  identifier,
  limit,
  newId,
  type SqlExecutor,
  type SqlFragment,
  sql,
} from '@cogenta/core'
import { assertCurrency, assertMinor } from '../money.js'
import { fromBool, toBool, toInt, toNullableText, toText } from '../rows.js'
import { TABLES } from '../tables.js'
import type {
  ContentRef,
  CreateProductInput,
  CreateVariantInput,
  Product,
  ProductStatus,
  StockRequest,
  StockShortfall,
  UpdateProductInput,
  UpdateVariantInput,
  Variant,
} from './types.js'

export interface ProductListOptions {
  readonly status?: ProductStatus
  /** Case-insensitive substring of handle or title. */
  readonly search?: string
  readonly limit?: number
  readonly offset?: number
}

/**
 * The outcome of taking stock. Never a boolean and never a throw for the
 * ordinary case: "the last one just went" is a normal thing to happen in a
 * shop, and the caller needs to know *which* line was short and by how much.
 */
export type StockOutcome =
  | { readonly kind: 'taken' }
  | { readonly kind: 'short'; readonly shortfalls: readonly StockShortfall[] }

export interface CatalogStore {
  createProduct(input: CreateProductInput): Promise<Product>
  readProduct(id: string): Promise<Product | null>
  readProductByHandle(handle: string): Promise<Product | null>
  updateProduct(id: string, input: UpdateProductInput): Promise<Product>
  /** Archives. A product that has ever been ordered is never deleted: an order
   * line copies what it needs, but the admin still wants the trail. */
  archiveProduct(id: string): Promise<Product>
  deleteProduct(id: string): Promise<void>
  listProducts(options?: ProductListOptions): Promise<readonly Product[]>

  createVariant(input: CreateVariantInput): Promise<Variant>
  readVariant(id: string): Promise<Variant | null>
  readVariantBySku(sku: string): Promise<Variant | null>
  updateVariant(id: string, input: UpdateVariantInput): Promise<Variant>
  deleteVariant(id: string): Promise<void>
  listVariants(productId: string): Promise<readonly Variant[]>

  /** Sets absolute stock. For a stock take, never for a sale. */
  setStock(variantId: string, onHand: number): Promise<Variant>
  /** Adds to stock. For a delivery, and for putting a cancelled order back. */
  restock(requests: readonly StockRequest[], tx?: SqlExecutor): Promise<void>
  /**
   * Takes stock for a sale, atomically, all lines or none.
   *
   * The only correct way to lower stock in this package. Runs in one immediate
   * transaction and lowers each line with `update … set on_hand = on_hand - :n
   * where id = :id and on_hand >= :n`, reading `rowsAffected`. Two shoppers
   * racing for the last unit both pass the read, and exactly one passes the
   * UPDATE — which is the difference between a shop and an oversold shop.
   */
  takeStock(requests: readonly StockRequest[], tx?: SqlExecutor): Promise<StockOutcome>
}

interface ProductRow {
  id: unknown
  handle: unknown
  title: unknown
  status: unknown
  content_collection: unknown
  content_entry_id: unknown
  created_at: unknown
  updated_at: unknown
}

interface VariantRow {
  id: unknown
  product_id: unknown
  sku: unknown
  title: unknown
  price_minor: unknown
  currency: unknown
  on_hand: unknown
  allow_backorder: unknown
  weight_grams: unknown
  tax_category: unknown
  position: unknown
  created_at: unknown
  updated_at: unknown
}

function decodeProduct(row: ProductRow): Product {
  const collection = toNullableText(row.content_collection)
  const entryId = toNullableText(row.content_entry_id)
  const ref: ContentRef | null =
    collection !== null && entryId !== null ? { collection, entryId } : null

  return {
    id: toText(row.id, 'product.id'),
    handle: toText(row.handle, 'product.handle'),
    title: toText(row.title, 'product.title'),
    status: toText(row.status, 'product.status') as ProductStatus,
    contentRef: ref,
    createdAt: toText(row.created_at, 'product.created_at'),
    updatedAt: toText(row.updated_at, 'product.updated_at'),
  }
}

function decodeVariant(row: VariantRow): Variant {
  return {
    id: toText(row.id, 'variant.id'),
    productId: toText(row.product_id, 'variant.product_id'),
    sku: toText(row.sku, 'variant.sku'),
    title: toText(row.title, 'variant.title'),
    priceMinor: toInt(row.price_minor, 'variant.price_minor'),
    currency: toText(row.currency, 'variant.currency'),
    onHand: toInt(row.on_hand, 'variant.on_hand'),
    allowBackorder: toBool(row.allow_backorder),
    weightGrams: toInt(row.weight_grams, 'variant.weight_grams'),
    taxCategory: toText(row.tax_category, 'variant.tax_category'),
    position: toInt(row.position, 'variant.position'),
    createdAt: toText(row.created_at, 'variant.created_at'),
    updatedAt: toText(row.updated_at, 'variant.updated_at'),
  }
}

const HANDLE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u

function assertHandle(handle: string): string {
  const value = handle.trim().toLowerCase()
  if (!HANDLE_PATTERN.test(value) || value.length > 200) {
    throw new CogentaError({
      code: 'COMMERCE_PRODUCT_NOT_FOUND',
      message: `"${handle}" is not a usable product handle.`,
      hint: 'Use lower-case letters, digits and single hyphens, like "wool-scarf".',
    })
  }
  return value
}

function assertQuantity(quantity: number, what: string): number {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new CogentaError({
      code: 'COMMERCE_QUANTITY_INVALID',
      message: `${what} must be a whole number greater than zero, got ${String(quantity)}.`,
      hint: 'To remove a line, delete it. A quantity of zero is not a line.',
    })
  }
  return quantity
}

/**
 * Merges repeated variants in one request.
 *
 * Two lines for the same variant would otherwise each pass their own
 * `on_hand >= quantity` guard while together exceeding stock — the classic way
 * a per-line check quietly oversells. Summing first makes the guard mean what
 * it says.
 */
function coalesce(requests: readonly StockRequest[]): StockRequest[] {
  const totals = new Map<string, number>()
  for (const request of requests) {
    assertQuantity(request.quantity, 'A stock quantity')
    totals.set(request.variantId, (totals.get(request.variantId) ?? 0) + request.quantity)
  }
  return [...totals].map(([variantId, quantity]) => ({ variantId, quantity }))
}

export function createCatalogStore(db: DatabaseHandle, now: () => number = Date.now): CatalogStore {
  const d = db.dialect
  const products = identifier(TABLES.products, d)
  const variants = identifier(TABLES.variants, d)
  const stamp = (): string => new Date(now()).toISOString()

  async function loadProduct(id: string): Promise<Product> {
    const found = await readProduct(id)
    if (found === null) {
      throw new CogentaError({
        code: 'COMMERCE_PRODUCT_NOT_FOUND',
        message: 'This product does not exist.',
        hint: 'It may have been deleted. Refresh the product list.',
      })
    }
    return found
  }

  async function readProduct(id: string): Promise<Product | null> {
    const result = await db.query<ProductRow>(sql`select * from ${products} where id = ${id}`)
    const row = result.rows[0]
    return row === undefined ? null : decodeProduct(row)
  }

  async function loadVariant(id: string, executor: SqlExecutor = db): Promise<Variant> {
    const result = await executor.query<VariantRow>(sql`select * from ${variants} where id = ${id}`)
    const row = result.rows[0]
    if (row === undefined) {
      throw new CogentaError({
        code: 'COMMERCE_VARIANT_NOT_FOUND',
        message: 'This product variant does not exist.',
        hint: 'It may have been deleted while the cart was open. Remove the line and try again.',
      })
    }
    return decodeVariant(row)
  }

  async function skuTaken(sku: string, exceptId?: string): Promise<boolean> {
    const result =
      exceptId === undefined
        ? await db.query<{ id: unknown }>(sql`select id from ${variants} where sku = ${sku}`)
        : await db.query<{ id: unknown }>(
            sql`select id from ${variants} where sku = ${sku} and id <> ${exceptId}`,
          )
    return result.rows.length > 0
  }

  /**
   * Lowers stock for one line, and reports whether it actually happened.
   *
   * `on_hand >= quantity` inside the UPDATE is the whole safety property. A
   * read followed by a write would be correct in a test and wrong in
   * production; this is correct in both, on all three dialects, because
   * `rowsAffected` is the one thing they all agree on.
   */
  async function takeOne(tx: SqlExecutor, variant: Variant, quantity: number): Promise<boolean> {
    if (variant.allowBackorder) {
      const result = await tx.query(
        sql`update ${variants} set on_hand = on_hand - ${quantity}, updated_at = ${stamp()} where id = ${variant.id}`,
      )
      return result.rowsAffected > 0
    }

    const result = await tx.query(
      sql`update ${variants} set on_hand = on_hand - ${quantity}, updated_at = ${stamp()}
          where id = ${variant.id} and on_hand >= ${quantity}`,
    )
    return result.rowsAffected > 0
  }

  async function takeStock(
    requests: readonly StockRequest[],
    tx?: SqlExecutor,
  ): Promise<StockOutcome> {
    const wanted = coalesce(requests)
    if (wanted.length === 0) return { kind: 'taken' }

    const run = async (executor: SqlExecutor): Promise<StockOutcome> => {
      const shortfalls: StockShortfall[] = []

      // Ordered by id so two concurrent multi-line orders take the same rows
      // in the same order. Different orders is how two transactions deadlock
      // on Postgres and MySQL, and it is invisible until the day it isn't.
      for (const request of [...wanted].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
        const variant = await loadVariant(request.variantId, executor)
        const taken = await takeOne(executor, variant, request.quantity)
        if (!taken) {
          shortfalls.push({
            variantId: request.variantId,
            requested: request.quantity,
            available: Math.max(0, variant.onHand),
          })
        }
      }

      if (shortfalls.length > 0) {
        // Throwing is what rolls the whole thing back — all lines or none.
        throw new StockShortfallSignal(shortfalls)
      }
      return { kind: 'taken' }
    }

    try {
      // `immediate: true` takes SQLite's write lock at BEGIN. Without it a
      // read-then-write transaction can fail with SQLITE_BUSY under exactly
      // the concurrency this method exists to survive.
      return tx === undefined ? await db.transaction(run, { immediate: true }) : await run(tx)
    } catch (error) {
      if (error instanceof StockShortfallSignal) {
        return { kind: 'short', shortfalls: error.shortfalls }
      }
      throw error
    }
  }

  return {
    createProduct: async (input) => {
      const id = newId(now)
      const at = stamp()
      const handle = assertHandle(input.handle)

      await db.query(sql`
        insert into ${products} (id, handle, title, status, content_collection, content_entry_id, created_at, updated_at)
        values (${id}, ${handle}, ${input.title}, ${input.status ?? 'active'},
                ${input.contentRef?.collection ?? null}, ${input.contentRef?.entryId ?? null},
                ${at}, ${at})`)

      return loadProduct(id)
    },

    readProduct,

    readProductByHandle: async (handle) => {
      const result = await db.query<ProductRow>(
        sql`select * from ${products} where handle = ${handle.trim().toLowerCase()}`,
      )
      const row = result.rows[0]
      return row === undefined ? null : decodeProduct(row)
    },

    updateProduct: async (id, input) => {
      const current = await loadProduct(id)
      const handle = input.handle === undefined ? current.handle : assertHandle(input.handle)
      const ref = input.contentRef === undefined ? current.contentRef : input.contentRef

      await db.query(sql`
        update ${products}
        set handle = ${handle},
            title = ${input.title ?? current.title},
            status = ${input.status ?? current.status},
            content_collection = ${ref?.collection ?? null},
            content_entry_id = ${ref?.entryId ?? null},
            updated_at = ${stamp()}
        where id = ${id}`)

      return loadProduct(id)
    },

    archiveProduct: async (id) => {
      await loadProduct(id)
      await db.query(
        sql`update ${products} set status = ${'archived'}, updated_at = ${stamp()} where id = ${id}`,
      )
      return loadProduct(id)
    },

    deleteProduct: async (id) => {
      await db.transaction(async (tx) => {
        await tx.query(sql`delete from ${variants} where product_id = ${id}`)
        await tx.query(sql`delete from ${products} where id = ${id}`)
      })
    },

    listProducts: async (options) => {
      const conditions: SqlFragment[] = []
      if (options?.status !== undefined) {
        conditions.push(sql`status = ${options.status}`)
      }
      if (options?.search !== undefined && options.search.trim() !== '') {
        const pattern = `%${options.search.trim().toLowerCase()}%`
        conditions.push(sql`(lower(handle) like ${pattern} or lower(title) like ${pattern})`)
      }

      let statement = sql`select * from ${products}`
      for (const [index, condition] of conditions.entries()) {
        statement =
          index === 0 ? sql`${statement} where ${condition}` : sql`${statement} and ${condition}`
      }
      statement = sql`${statement} order by created_at desc, id desc`

      // `limit()` inlines the count: MySQL prepared statements reject a
      // placeholder there, and the helper validates it so inlining is safe.
      statement = sql`${statement} limit ${limit(options?.limit ?? 100)} offset ${limit(options?.offset ?? 0)}`

      const result = await db.query<ProductRow>(statement)
      return result.rows.map(decodeProduct)
    },

    createVariant: async (input) => {
      await loadProduct(input.productId)
      const sku = input.sku.trim()
      if (sku === '') {
        throw new CogentaError({
          code: 'COMMERCE_SKU_TAKEN',
          message: 'A variant needs a SKU.',
          hint: 'The SKU is what an order line keeps after the product is gone. It cannot be empty.',
        })
      }
      if (await skuTaken(sku)) {
        throw new CogentaError({
          code: 'COMMERCE_SKU_TAKEN',
          message: `The SKU "${sku}" is already used by another variant.`,
          hint: 'A SKU identifies one sellable thing. Pick another, or edit the existing variant.',
        })
      }

      const id = newId(now)
      const at = stamp()
      const onHand = input.onHand ?? 0
      if (!Number.isInteger(onHand) || onHand < 0) {
        throw new CogentaError({
          code: 'COMMERCE_QUANTITY_INVALID',
          message: `Stock must be a whole number of units, got ${String(onHand)}.`,
          hint: 'Use allowBackorder if this variant should sell past zero.',
        })
      }

      await db.query(sql`
        insert into ${variants} (id, product_id, sku, title, price_minor, currency, on_hand,
                                 allow_backorder, weight_grams, tax_category, position, created_at, updated_at)
        values (${id}, ${input.productId}, ${sku}, ${input.title},
                ${assertMinor(input.priceMinor, 'A variant price')}, ${assertCurrency(input.currency)},
                ${onHand}, ${fromBool(input.allowBackorder ?? false, d)},
                ${input.weightGrams ?? 0}, ${input.taxCategory ?? 'standard'},
                ${input.position ?? 0}, ${at}, ${at})`)

      return loadVariant(id)
    },

    readVariant: async (id) => {
      const result = await db.query<VariantRow>(sql`select * from ${variants} where id = ${id}`)
      const row = result.rows[0]
      return row === undefined ? null : decodeVariant(row)
    },

    readVariantBySku: async (sku) => {
      const result = await db.query<VariantRow>(sql`select * from ${variants} where sku = ${sku}`)
      const row = result.rows[0]
      return row === undefined ? null : decodeVariant(row)
    },

    updateVariant: async (id, input) => {
      const current = await loadVariant(id)
      const sku = input.sku === undefined ? current.sku : input.sku.trim()
      if (sku !== current.sku && (await skuTaken(sku, id))) {
        throw new CogentaError({
          code: 'COMMERCE_SKU_TAKEN',
          message: `The SKU "${sku}" is already used by another variant.`,
          hint: 'A SKU identifies one sellable thing. Pick another.',
        })
      }

      // Stock is deliberately absent from this method. Setting it as one field
      // among many is how a concurrent sale gets overwritten by a form that
      // was rendered a minute ago; setStock/restock/takeStock say what they do.
      await db.query(sql`
        update ${variants}
        set sku = ${sku},
            title = ${input.title ?? current.title},
            price_minor = ${assertMinor(input.priceMinor ?? current.priceMinor, 'A variant price')},
            currency = ${assertCurrency(input.currency ?? current.currency)},
            allow_backorder = ${fromBool(input.allowBackorder ?? current.allowBackorder, d)},
            weight_grams = ${input.weightGrams ?? current.weightGrams},
            tax_category = ${input.taxCategory ?? current.taxCategory},
            position = ${input.position ?? current.position},
            updated_at = ${stamp()}
        where id = ${id}`)

      return loadVariant(id)
    },

    deleteVariant: async (id) => {
      await db.query(sql`delete from ${variants} where id = ${id}`)
    },

    listVariants: async (productId) => {
      const result = await db.query<VariantRow>(
        sql`select * from ${variants} where product_id = ${productId} order by position asc, created_at asc, id asc`,
      )
      return result.rows.map(decodeVariant)
    },

    setStock: async (variantId, onHand) => {
      if (!Number.isInteger(onHand) || onHand < 0) {
        throw new CogentaError({
          code: 'COMMERCE_QUANTITY_INVALID',
          message: `Stock must be a whole number of units, got ${String(onHand)}.`,
          hint: 'A stock take sets what is on the shelf. It is never negative.',
        })
      }
      await loadVariant(variantId)
      await db.query(
        sql`update ${variants} set on_hand = ${onHand}, updated_at = ${stamp()} where id = ${variantId}`,
      )
      return loadVariant(variantId)
    },

    restock: async (requests, tx) => {
      const wanted = coalesce(requests)
      if (wanted.length === 0) return

      const run = async (executor: SqlExecutor): Promise<void> => {
        for (const request of [...wanted].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
          await executor.query(
            sql`update ${variants} set on_hand = on_hand + ${request.quantity}, updated_at = ${stamp()} where id = ${request.variantId}`,
          )
        }
      }

      if (tx === undefined) await db.transaction(run, { immediate: true })
      else await run(tx)
    },

    takeStock,
  }
}

/** Internal. Rolls a partial reservation back by unwinding the transaction. */
class StockShortfallSignal extends Error {
  readonly shortfalls: readonly StockShortfall[]

  constructor(shortfalls: readonly StockShortfall[]) {
    super('stock shortfall')
    this.name = 'StockShortfallSignal'
    this.shortfalls = shortfalls
  }
}
