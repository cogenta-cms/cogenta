/** Where a media asset sits on the image on a page — never a crop, a hint the pipeline resizes and crops around. */
export interface FocalPoint {
  readonly x: number
  readonly y: number
}

export const MEDIA_KINDS = ['image', 'video', 'audio', 'file'] as const
export type MediaKind = (typeof MEDIA_KINDS)[number]

export interface MediaAsset {
  readonly id: string
  readonly kind: MediaKind
  readonly filename: string
  readonly mimeType: string
  /** Bytes of the stored original. */
  readonly size: number
  /** Known for `image`; null for kinds this store never probes dimensions on. */
  readonly width: number | null
  readonly height: number | null
  /**
   * Empty for a declared-decorative asset (L2-admin.md's own rule: the
   * decorative checkbox writes `alt=""`, never an invented description).
   */
  readonly alt: string
  readonly decorative: boolean
  /** Why an editor marked it decorative — required exactly when `decorative` is true, kept for accessibility review, never rendered as `alt`. */
  readonly decorativeJustification: string | null
  readonly focal: FocalPoint | null
  /** The `StorageDriver` key the original lives under. */
  readonly storageKey: string
  /**
   * Free-form labels an editor attaches (fiche 11 task 5). Not a hierarchy —
   * an asset commonly belongs to more than one subject at once, which a
   * single-parent folder tree cannot express without picking one.
   */
  readonly tags: readonly string[]
  /**
   * A short hash of the stored bytes, used only to bust an intermediate or
   * browser cache when the original is replaced in place (fiche 11 task 4):
   * `/_image?id=…` is otherwise a stable URL serving a year-long
   * `Cache-Control: immutable` response (L10 task 5), so replacing the bytes
   * behind it changes nothing a visitor's browser already cached until this
   * value — folded into the URL as `&v=` — changes too. Never a secret and
   * never used for integrity: a content hash, not a checksum of trust.
   */
  readonly contentHash: string
  readonly createdAt: string
  readonly createdBy: string | null
}

export interface CreateMediaInput {
  readonly id?: string
  readonly kind: MediaKind
  readonly filename: string
  readonly mimeType: string
  readonly size: number
  readonly width?: number | null
  readonly height?: number | null
  readonly alt: string
  readonly decorative?: boolean
  readonly decorativeJustification?: string | null
  readonly focal?: FocalPoint | null
  readonly storageKey: string
  readonly tags?: readonly string[]
  /** Derived from `storageKey` when absent — every caller that predates tagging still gets a stable value. */
  readonly contentHash?: string
  readonly createdBy?: string | null
}

export interface UpdateMediaInput {
  readonly alt?: string
  readonly decorative?: boolean
  readonly decorativeJustification?: string | null
  readonly focal?: FocalPoint | null
  /** Replaces the whole set — a caller that wants to add one tag reads first, same as every other field here. */
  readonly tags?: readonly string[]
}

/**
 * Overwrites the bytes behind an existing id (fiche 11 task 4) — "replace",
 * never "re-upload": every entry and block already holding this id keeps
 * working, unchanged, the moment this returns. `alt`, `decorative`, `tags`
 * and `focal` are deliberately untouched — a replaced logo is still the same
 * subject, so its description should not silently revert to empty.
 */
export interface ReplaceMediaInput {
  readonly mimeType: string
  readonly size: number
  readonly width?: number | null
  readonly height?: number | null
  readonly storageKey: string
  readonly contentHash: string
}

export type MediaSortField = 'createdAt' | 'filename' | 'size'

export interface ListMediaOptions {
  readonly kind?: MediaKind
  /** Exact match on one tag. Combined with `kind`/date range/free-text `q`, whichever the caller (the REST layer) also applies. */
  readonly tag?: string
  /** Inclusive lower bound on `createdAt`, ISO 8601. */
  readonly from?: string
  /** Inclusive upper bound on `createdAt`, ISO 8601. */
  readonly to?: string
  readonly sort?: MediaSortField
  readonly direction?: 'asc' | 'desc'
  readonly limit?: number
  readonly cursor?: string
}

export interface MediaPage {
  readonly items: readonly MediaAsset[]
  readonly nextCursor: string | null
  readonly hasMore: boolean
}

export interface MediaStore {
  create(input: CreateMediaInput): Promise<MediaAsset>
  get(id: string): Promise<MediaAsset | null>
  list(options?: ListMediaOptions): Promise<MediaPage>
  /**
   * How many assets match `options` in total — ignoring `limit`/`cursor` —
   * so the admin screen can show "2,000 assets" instead of only "there is
   * another page" (fiche 11 task 2).
   */
  count(options?: Omit<ListMediaOptions, 'limit' | 'cursor'>): Promise<number>
  update(id: string, input: UpdateMediaInput): Promise<MediaAsset>
  replace(id: string, input: ReplaceMediaInput): Promise<MediaAsset>
  delete(id: string): Promise<void>
}
