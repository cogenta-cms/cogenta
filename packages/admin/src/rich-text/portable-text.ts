/**
 * The admin's own copy of contract A's `richText` shape (ADR-0013,
 * `packages/schema/src/rich-text.ts`), for the same reason `schema/types.ts`
 * copies the schema document shape: this is a browser bundle, that module is
 * Node code with a Zod dependency this package has no other use for.
 *
 * Field names are load-bearing and must match exactly: `_key`/`_type`
 * (never `id`/`type`/`kind`), `children` (never `content`), `markDefs`.
 * `packages/theme-canonical/src/render/rich-text.ts` is the one thing that
 * reads this on the way out, and it is a `strictObject` on the way in — an
 * extra field is a validation error, not a warning.
 */

export const RICH_TEXT_STYLES = ['normal', 'h2', 'h3', 'h4', 'blockquote'] as const
export type RichTextStyle = (typeof RICH_TEXT_STYLES)[number]

export const RICH_TEXT_LIST_ITEMS = ['bullet', 'number'] as const
export type RichTextListItem = (typeof RICH_TEXT_LIST_ITEMS)[number]

export const RICH_TEXT_DECORATORS = ['strong', 'em', 'code', 'strikethrough'] as const
export type RichTextDecorator = (typeof RICH_TEXT_DECORATORS)[number]

export interface RichTextSpan {
  readonly _key: string
  readonly _type: 'span'
  readonly text: string
  readonly marks: readonly string[]
}

export interface RichTextLinkMark {
  readonly _key: string
  readonly _type: 'link'
  readonly href: string
  readonly rel?: string
}

export interface RichTextInternalLinkMark {
  readonly _key: string
  readonly _type: 'internalLink'
  readonly collection: string
  readonly id: string
}

export type RichTextMarkDefinition = RichTextLinkMark | RichTextInternalLinkMark

export interface RichTextBlock {
  readonly _key: string
  readonly _type: 'block'
  readonly style: RichTextStyle
  readonly listItem?: RichTextListItem
  readonly level?: number
  readonly children: readonly RichTextSpan[]
  readonly markDefs: readonly RichTextMarkDefinition[]
}

export interface RichTextMediaNode {
  readonly _key: string
  readonly _type: 'media'
  readonly id: string
  readonly caption?: string
}

/** A thematic break (fiche 42 task 2) — no data beyond its key. */
export interface RichTextHrNode {
  readonly _key: string
  readonly _type: 'hr'
}

export type RichTextNode = RichTextBlock | RichTextMediaNode | RichTextHrNode
export type RichTextDocument = readonly RichTextNode[]

let counter = 0

/** A `_key` unique within one editing session — the server does not care what it looks like, only that it is stable and unique per document. */
export function freshKey(): string {
  counter += 1
  return `k${Date.now().toString(36)}${counter.toString(36)}`
}
