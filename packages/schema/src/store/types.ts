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

/**
 * Whether a read reaches into the trash (`schema@2.0`, ADR-0022).
 *
 * `'exclude'` is the default everywhere, and that direction is the whole
 * point: a caller written before the trash existed — a renderer, a sitemap, a
 * headless client — keeps returning live content without being changed. Only a
 * screen that *is* the trash asks for `'only'`.
 */
export type TrashFilter = 'exclude' | 'include' | 'only'

export interface TrashOptions {
  readonly trashed?: TrashFilter
}

export interface ReadOptions extends TrashOptions {
  readonly state?: EntryState
}

/** What `purgeExpired()` actually removed, so a caller can report it. */
export interface PurgeReport {
  readonly purged: number
  /** The cut-off used, derived from the collection's `trash.retainDays`. */
  readonly olderThan: string
}

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

/**
 * What a copy is allowed to differ by.
 *
 * Everything not named here is copied from the source: its values, its block
 * zones, its relations, its locale and its provenance. What is *never* copied
 * is stated on `ContentStore.duplicate` itself, because it is a decision
 * rather than an omission.
 */
export interface DuplicateInput<TValues extends ContentValues = ContentValues>
  extends ProvenanceInput {
  /** Supply one when the copy has to carry an identity chosen elsewhere. */
  readonly id?: string
  readonly createdBy?: string | null
  /**
   * Applied on top of the copied values. This is how a caller renames the copy
   * — and the only way to give a `unique` field a value that is not a string,
   * since one of those cannot be derived automatically.
   */
  readonly values?: Partial<TValues>
}

export interface UpdateInput<TValues extends ContentValues = ContentValues>
  extends ProvenanceInput {
  readonly values?: Partial<TValues>
  /** Replaces the whole zone. A zone left out is untouched. */
  readonly blocks?: BlockZones
  readonly updatedBy?: string | null
  /**
   * The `updatedAt` this write was loaded against (fiche 02 task 7).
   *
   * Optimistic concurrency by detection, not by locking: absent, this write
   * behaves exactly as before (last write wins, silently). Present, `update()`
   * refuses with `CONTENT_STALE_WRITE` when the live row's `updatedAt` no
   * longer matches — somebody else's write landed first — rather than
   * overwriting it without a word.
   */
  readonly expectedUpdatedAt?: string
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

export interface ListOptions extends TrashOptions {
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

/**
 * Per-status row counts for one collection, live rows and trash apart.
 *
 * The one shared implementation fiche 01 tâche 4 (per-collection status tabs)
 * and fiche 22 tâche 1 (the dashboard's content summary widget) both build
 * on: a `GROUP BY status` and a trash count, never a page scanned client-side
 * — the piège both fiches name ("un compteur sur la page courante serait
 * faux dès la deuxième page").
 */
export interface StatusCounts {
  readonly draft: number
  readonly scheduled: number
  readonly published: number
  readonly archived: number
  /** Rows with `deletedAt` set — orthogonal to `status` (`schema@2.0`, ADR-0022). */
  readonly trashed: number
  /** `draft + scheduled + published + archived`. Trash is excluded, the same default every other read applies. */
  readonly total: number
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

export interface ResolveLocaleOptions extends TrashOptions {
  readonly fallback: LocaleFallback
  readonly state?: EntryState
}
