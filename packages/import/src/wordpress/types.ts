/** The WXR document, decoded into plain data — no XML concepts leak past this module. */

export interface WxrAuthor {
  readonly login: string
  readonly email: string
  readonly displayName: string
}

export interface WxrCategory {
  readonly termId: string
  readonly niceName: string
  readonly name: string
}

export interface WxrTag {
  readonly termId: string
  readonly slug: string
  readonly name: string
}

/** A `<category>` element on an `<item>` — the term it actually applies. */
export interface WxrTermRef {
  readonly domain: 'category' | 'post_tag' | string
  readonly niceName: string
  readonly name: string
}

export interface WxrPostMeta {
  readonly key: string
  readonly value: string
}

export interface WxrComment {
  readonly id: string
  readonly author: string
  readonly authorEmail: string
  readonly date: string
  readonly content: string
  /** `'1'` approved, `'0'` pending, `'spam'` — only `'1'` is imported. */
  readonly approved: string
  readonly parentId: string
}

export const WXR_POST_STATUSES = [
  'publish',
  'draft',
  'pending',
  'private',
  'future',
  'trash',
] as const
export type WxrPostStatus = (typeof WXR_POST_STATUSES)[number]

export interface WxrItem {
  readonly postId: string
  readonly postType: string
  readonly title: string
  readonly link: string
  readonly postName: string
  readonly status: string
  readonly postDate: string
  readonly creator: string
  readonly contentEncoded: string
  readonly excerptEncoded: string
  readonly categories: readonly WxrTermRef[]
  readonly postMeta: readonly WxrPostMeta[]
  readonly comments: readonly WxrComment[]
  /** Set only when `postType === 'attachment'`. */
  readonly attachmentUrl: string | null
  /** The thumbnail's `wp:post_id`, from `_thumbnail_id` postmeta, resolved later against attachments. */
  readonly thumbnailId: string | null
}

export interface ParsedWxr {
  readonly siteTitle: string
  readonly baseUrl: string
  readonly authors: readonly WxrAuthor[]
  readonly categories: readonly WxrCategory[]
  readonly tags: readonly WxrTag[]
  readonly items: readonly WxrItem[]
}
