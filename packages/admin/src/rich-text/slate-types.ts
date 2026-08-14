import type { BaseEditor } from 'slate'
import type { HistoryEditor } from 'slate-history'
import type { ReactEditor } from 'slate-react'
import type { RichTextListItem, RichTextStyle } from './portable-text.js'

/**
 * Slate's own document model, chosen as the editing engine specifically
 * because it maps onto contract A's `richText` (a flat list of block nodes,
 * each holding typed inline children with marks) with very little
 * impedance mismatch — Lexical's node graph and ProseMirror's schema layer
 * both need a heavier adapter for this exact shape.
 *
 * A `link` is a Slate *inline element* wrapping text, not a leaf mark: contract
 * A carries it the same way (a `markDefs` entry a span's `marks` refers to,
 * not a boolean on the span itself), and Slate has no notion of a mark that
 * carries its own data, so the element is the closest native fit.
 */

export type ParagraphElement = { readonly type: 'paragraph'; children: Descendant[] }
export type HeadingElement = { readonly type: 'h2' | 'h3' | 'h4'; children: Descendant[] }
export type BlockquoteElement = { readonly type: 'blockquote'; children: Descendant[] }
export type ListItemElement = {
  readonly type: 'list-item'
  readonly listType: RichTextListItem
  readonly level: number
  children: Descendant[]
}
/**
 * Two shapes under one element type rather than an encoded href: contract
 * A's two mark kinds (`link`, `internalLink`) carry different data, and
 * folding an internal reference into a URL string would need an escaping
 * scheme this file would then also have to unpick perfectly on save, for a
 * feature (linking to another entry) nothing can create yet — only
 * round-trip losslessly if it arrives from elsewhere.
 */
export type LinkElement =
  | {
      readonly type: 'link'
      readonly kind: 'external'
      readonly href: string
      readonly rel?: string
      children: Descendant[]
    }
  | {
      readonly type: 'link'
      readonly kind: 'internal'
      readonly collection: string
      readonly entryId: string
      children: Descendant[]
    }
/** Void: not editable text, a fixed chip pointing at a media asset the picker (task 11) will manage. */
export type MediaElement = {
  readonly type: 'media'
  readonly mediaId: string
  readonly caption?: string
  children: Descendant[]
}

export type BlockElement = ParagraphElement | HeadingElement | BlockquoteElement | ListItemElement
export type InlineElement = LinkElement
export type VoidElement = MediaElement
export type CustomElement = BlockElement | InlineElement | VoidElement

export interface CustomText {
  text: string
  strong?: true
  em?: true
  code?: true
}

export type Descendant = CustomElement | CustomText

declare module 'slate' {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor & HistoryEditor
    Element: CustomElement
    Text: CustomText
  }
}

export function styleOf(element: CustomElement): RichTextStyle {
  if (element.type === 'h2' || element.type === 'h3' || element.type === 'h4') return element.type
  if (element.type === 'blockquote') return 'blockquote'
  return 'normal'
}
