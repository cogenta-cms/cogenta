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
  /**
   * The `MediaFolder` this asset sits in, or `null` when it has never been
   * filed anywhere (fiche 46). `null` is "unclassified", not "in the root
   * `contents` folder" — every asset uploaded before folders existed keeps
   * this value forever unless an editor actually moves it, so the migration
   * that added this column never silently reclassifies anything.
   */
  readonly folderId: string | null
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
  /** Absent or `null` means unclassified — the same default every asset uploaded before fiche 46 already has. */
  readonly folderId?: string | null
  readonly createdBy?: string | null
}

export interface UpdateMediaInput {
  readonly alt?: string
  readonly decorative?: boolean
  readonly decorativeJustification?: string | null
  readonly focal?: FocalPoint | null
  /** Replaces the whole set — a caller that wants to add one tag reads first, same as every other field here. */
  readonly tags?: readonly string[]
  /**
   * Moves the asset. Absent leaves it where it is; `null` clears it back to
   * unclassified; a folder id files it there. The single-asset and bulk
   * "move" routes (`media-router.ts`) are both a thin wrapper over this —
   * there is no separate move-only method on the store, the same way
   * `update` already carries every other in-place change.
   */
  readonly folderId?: string | null
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
  /**
   * Exact match on one folder. `null` means "unclassified" (`folder_id is
   * null`) — a real, listable state, not "no filter". Absent means no
   * filtering by folder at all. Combined with `folderIds` below only by the
   * REST layer, never both at once.
   */
  readonly folderId?: string | null
  /**
   * Matches any of these folder ids — how "include subfolders" is
   * implemented (`media-router.ts`'s `?folderId=&includeSubfolders=1`
   * resolves the folder's whole subtree via `MediaFolderStore.subtreeIds`
   * first, then passes the resolved set here). Deliberately not a tree
   * concept on `MediaStore` itself: this store knows nothing about folder
   * hierarchy, only about matching a column against a set of ids.
   */
  readonly folderIds?: readonly string[]
}

export interface MediaPage {
  readonly items: readonly MediaAsset[]
  readonly nextCursor: string | null
  readonly hasMore: boolean
}

/**
 * A folder in the media library's tree (fiche 46).
 *
 * Not contract A: a folder classifies files, not content, the same
 * separation the fiche 11 decision already drew for tags ("étiquettes
 * plutôt que dossiers" — folders are the hierarchy that decision noted the
 * taxonomy machinery could provide if ever asked for; this is that ask).
 * `path` is a materialised path exactly like a taxonomy term's (ADR-0022) —
 * see `folder-path.ts` for why it is a *local* copy of that arithmetic
 * rather than an import: `@cogenta/core` cannot depend on `@cogenta/schema`,
 * which is where the taxonomy version lives.
 */
export interface MediaFolder {
  readonly id: string
  readonly parentId: string | null
  readonly name: string
  readonly path: string
  /** Position among siblings, for a stable, editor-controlled order. */
  readonly position: number
  readonly createdAt: string
}

export interface CreateMediaFolderInput {
  readonly id?: string
  readonly name: string
  /** `null` or absent creates a root folder. */
  readonly parentId?: string | null
  /** Left out, the folder goes last among its siblings. */
  readonly position?: number
}

export interface UpdateMediaFolderInput {
  readonly name?: string
  readonly position?: number
}

export interface ListMediaFoldersOptions {
  /** Only the direct children of this folder; `null` means the roots. Omitted returns the whole tree, flattened depth-first. */
  readonly parentId?: string | null
}

export interface MediaFolderStore {
  create(input: CreateMediaFolderInput): Promise<MediaFolder>
  read(id: string): Promise<MediaFolder | null>
  /** Renames and/or repositions — never reparents, that is `move`. */
  update(id: string, input: UpdateMediaFolderInput): Promise<MediaFolder>
  /** Re-parents a folder and rewrites its whole subtree's paths. */
  move(id: string, parentId: string | null): Promise<MediaFolder>
  /**
   * Refuses when the folder still has subfolders or media assets in it
   * (`MEDIA_FOLDER_NOT_EMPTY`) — always, including the bootstrap `contents`
   * root: nothing here treats it as more special than any other folder once
   * it exists.
   */
  delete(id: string): Promise<boolean>
  list(options?: ListMediaFoldersOptions): Promise<readonly MediaFolder[]>
  /** This folder's id plus every descendant's — how `?includeSubfolders=1` is resolved. */
  subtreeIds(id: string): Promise<readonly string[]>
  /**
   * Idempotent bootstrap: returns the root folder named `name` if one
   * exists, otherwise creates it. Called once at server startup for the
   * default `contents` root (fiche 46 task 6) — safe to call on every
   * restart of an already-provisioned site.
   */
  ensureRoot(name: string): Promise<MediaFolder>
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
