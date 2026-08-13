import type { ContentStatus, Provenance, SystemFields } from '../types.js'

/** The user-declared fields of an entry, keyed by field name. */
export type ContentValues = Readonly<Record<string, unknown>>

/**
 * One block of a block zone.
 *
 * `key` is contract A's `_key`: stable across edits, which is what makes a
 * block-by-block diff, a comment anchored to a block and an incremental RAG
 * re-index possible. It is minted once, never recomputed from the position.
 */
export interface ContentBlock {
  readonly key: string
  readonly type: string
  readonly data: Readonly<Record<string, unknown>>
}

/** Block zones of an entry, keyed by the name of the `blocks` field. */
export type BlockZones = Readonly<Record<string, readonly ContentBlock[]>>

/**
 * Which of the two faces of an entry to read.
 *
 * `published` is what the public renderer sees, always. `working` is the draft
 * the admin and preview tokens see — the same thing when nothing is pending.
 */
export type EntryState = 'published' | 'working'

export interface ContentEntry<TValues extends ContentValues = ContentValues> extends SystemFields {
  /** When this entry went public, per language. Null while it never has. */
  readonly publishedAt: string | null
  readonly state: EntryState
  readonly values: TValues
  readonly blocks: BlockZones
}

export interface ProvenanceInput {
  readonly provenance?: Provenance
  readonly provenanceDetail?: SystemFields['provenanceDetail']
}

export interface CreateInput<TValues extends ContentValues = ContentValues>
  extends ProvenanceInput {
  /** Supply one to import content that already has an identity elsewhere. */
  readonly id?: string
  readonly locale?: string
  /** The source entry this is a translation of (ADR-0014). */
  readonly translationOf?: string | null
  readonly status?: ContentStatus
  readonly createdBy?: string | null
  readonly values: Partial<TValues>
  readonly blocks?: BlockZones
}

export interface UpdateInput<TValues extends ContentValues = ContentValues>
  extends ProvenanceInput {
  readonly values?: Partial<TValues>
  /** Replaces the whole zone. A zone left out is untouched. */
  readonly blocks?: BlockZones
  readonly updatedBy?: string | null
}

export interface PublishInput {
  readonly publishedBy?: string | null
  /** Recorded as the publication instant. Defaults to now. */
  readonly at?: Date
}

/** Ordering is limited to columns that are never null, so a cursor is total. */
export type SortField = 'id' | 'createdAt' | 'updatedAt'

export interface SortOrder {
  readonly field: SortField
  readonly direction: 'asc' | 'desc'
}

export interface ListOptions {
  readonly state?: EntryState
  readonly locale?: string
  readonly status?: ContentStatus
  readonly translationOf?: string | null
  /** Equality on declared fields. Richer filters belong to the API layer (L1/13). */
  readonly where?: Readonly<Record<string, unknown>>
  readonly sort?: SortOrder
  readonly limit?: number
  /** Opaque; produced by a previous page. Never an offset (see `cursor.ts`). */
  readonly cursor?: string
}

export interface Page<T> {
  readonly items: readonly T[]
  readonly nextCursor: string | null
  readonly hasMore: boolean
}

export interface VersionSummary {
  readonly version: number
  readonly status: ContentStatus
  readonly createdAt: string
  readonly createdBy: string | null
  /** True for the version the live row currently holds. */
  readonly live: boolean
}

/** How a locale that has no entry is rendered. Always an explicit choice. */
export type LocaleFallback = 'original' | 'hide' | 'notFound'

export type LocaleResolution<TValues extends ContentValues = ContentValues> =
  | {
      readonly outcome: 'found'
      readonly entry: ContentEntry<TValues>
      /** True when the entry returned is not in the locale that was asked for. */
      readonly fellBack: boolean
    }
  | { readonly outcome: 'hidden' }
  | { readonly outcome: 'notFound' }

export interface ResolveLocaleOptions {
  readonly fallback: LocaleFallback
  readonly state?: EntryState
}
