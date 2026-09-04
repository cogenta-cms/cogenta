import type { ContentEntry, ImageOptions, ImageSource, RenderContext } from './contract.js'

/**
 * Contract A fixes the system fields but not the schema-defined ones: which
 * fields an entry has depends on its collection, and a theme that assumes
 * `title` exists breaks on the first collection that calls it `name`.
 *
 * So every read of an unknown field goes through here, returns a fallback the
 * visitor can live with, and never renders `undefined`.
 */

const TITLE_FIELDS = ['title', 'name', 'label'] as const

export function entryTitle(entry: ContentEntry, ctx: RenderContext): string {
  for (const field of TITLE_FIELDS) {
    const value = entry[field]
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return ctx.t('entry.untitled')
}

const EXCERPT_FIELDS = ['excerpt', 'summary', 'description'] as const

export function entryExcerpt(entry: ContentEntry): string | undefined {
  for (const field of EXCERPT_FIELDS) {
    const value = entry[field]
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return undefined
}

/** ISO 8601, for `<time datetime>`. Anything else is not a date this can use. */
export function entryDate(entry: ContentEntry): string | undefined {
  const value = entry.publishedAt ?? entry.createdAt
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : undefined
}

export function entryHref(entry: ContentEntry, ctx: RenderContext): string {
  return ctx.link({ collection: entry.collection, id: entry.id })
}

const IMAGE_FIELDS = [
  'coverImage',
  'cover',
  'image',
  'featuredImage',
  'photo',
  'thumbnail',
  'seoImage',
] as const

/**
 * An entry's own picture, read from whichever of the usual field names a
 * collection actually declares — a schema is free to call its cover image
 * field anything, but these seven names cover the convention nearly every
 * blueprint and headless CMS import already uses (contract D `theme@1.4`).
 *
 * A value only counts when it is a non-empty string: contract B stores a
 * media reference as the media library's id (`MediaReference`), never a URL
 * or an object, so anything else at that field name is not this entry's
 * picture, whatever it is. `undefined` — never a thrown error — means "this
 * entry has no image a theme can show", the same fallback `entryExcerpt`
 * already gives for a missing summary.
 */
export function entryImage(
  entry: ContentEntry,
  ctx: RenderContext,
  options?: ImageOptions,
): ImageSource | undefined {
  for (const field of IMAGE_FIELDS) {
    const value = entry[field]
    if (typeof value === 'string' && value.trim() !== '') return ctx.image(value, options)
  }
  return undefined
}
