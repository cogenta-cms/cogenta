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
  readonly createdBy?: string | null
}

export interface UpdateMediaInput {
  readonly alt?: string
  readonly decorative?: boolean
  readonly decorativeJustification?: string | null
  readonly focal?: FocalPoint | null
}

export interface ListMediaOptions {
  readonly kind?: MediaKind
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
  update(id: string, input: UpdateMediaInput): Promise<MediaAsset>
  delete(id: string): Promise<void>
}
