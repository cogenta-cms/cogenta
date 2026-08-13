/**
 * The shapes a theme sees on the wire.
 *
 * Declared here rather than imported from `@cogenta/schema`, and that is the
 * whole point of ADR-0016: the delivery plane must not link against the
 * content engine, because a type import is one refactor away from a value
 * import, and a value import puts the database in the process that runs
 * third-party theme code. What crosses the boundary is JSON over HTTP, so what
 * is declared here is JSON — structurally the same as the engine's entries,
 * deliberately not the same declaration.
 */

export type ContentValues = Readonly<Record<string, unknown>>

export interface ContentBlock {
  /** Contract B's `_key`: stable across edits, reorders and translations. */
  readonly key: string
  readonly type: string
  readonly data: Readonly<Record<string, unknown>>
}

export type BlockZones = Readonly<Record<string, readonly ContentBlock[]>>

export interface ContentEntry<TValues extends ContentValues = ContentValues> {
  readonly id: string
  readonly locale: string
  readonly status: string
  readonly publishedAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly translationOf: string | null
  readonly version: number
  readonly values: TValues
  readonly blocks: BlockZones
}

export type FilterOperator =
  | 'eq'
  | 'ne'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'in'
  | 'contains'
  | 'exists'

export interface FieldCondition {
  readonly field: string
  readonly operator: FilterOperator
  readonly value: unknown
}

export type Filter =
  | FieldCondition
  | { readonly and: readonly Filter[] }
  | { readonly or: readonly Filter[] }

/**
 * The query vocabulary a theme has, and the whole of it (ADR-0016's assumed
 * renunciation): no joins, no hand-tuned queries. A theme that needs more needs
 * a plugin, which is exactly the boundary the decision wanted.
 */
export interface QueryRequest {
  readonly collection: string
  readonly locale?: string | undefined
  readonly filter?: Filter | undefined
  readonly sort?: readonly { readonly field: string; readonly direction: 'asc' | 'desc' }[]
  readonly after?: string | undefined
  readonly limit?: number | undefined
  readonly depth?: number | undefined
}

export interface Page<T> {
  readonly items: readonly T[]
  readonly nextCursor: string | null
  readonly hasMore: boolean
}

/** Contract D's `ctx.content`: the only door to data a theme has. */
export interface ContentClient {
  entry(collection: string, id: string): Promise<ContentEntry | null>
  byPath(path: string): Promise<ContentEntry | null>
  list(request: QueryRequest): Promise<Page<ContentEntry>>
}

/** What `ctx.image()` is handed. Never invented by the theme. */
export interface MediaReference {
  readonly id: string
  readonly alt?: string | undefined
  readonly width?: number | undefined
  readonly height?: number | undefined
  readonly focal?: { readonly x: number; readonly y: number } | undefined
}
