import {
  type Attributes,
  blockHeadingTag,
  type Child,
  type HtmlElement,
  h,
  heading,
} from '@cogenta/theme-kit'

/**
 * The frame every block of this theme renders into, and the few pieces of
 * typographic furniture the blocks share.
 *
 * The outer element carries the section rhythm (`--cg-section`, applied once
 * to every block alike) and paints edge to edge when a variant asks for a
 * band. The inner element is the twelve-column container: columns one to
 * three are the margin, where this theme sets dates, years, labels and
 * attributions; the text line starts at column four for every block, so a
 * title in the index, the first line of an essay and a pull quote all share
 * one left edge.
 *
 * `inner` is `figure` for a block whose own semantics are a figure (a
 * quotation and its attribution, an image and its caption): `<figcaption>`
 * must be a direct child of its `<figure>`.
 */
export function section(
  outer: 'section' | 'div',
  block: string,
  className: string,
  attrs: Attributes,
  inner: 'div' | 'figure',
  ...children: readonly Child[]
): HtmlElement {
  return h(
    outer,
    { class: `cg-section ${className}`, 'data-block': block, ...attrs },
    h(inner, { class: `cg-container ${className}__inner` }, ...children),
  )
}

/**
 * A titled block's head: a rule in ink across the whole grid and the title
 * set under it, flush with the margin. `null` for an untitled block, so a
 * caller can drop it straight into its children.
 */
export function sectionHead(blockName: string, title: string | undefined): HtmlElement | null {
  if (title === undefined) return null
  return h(
    'div',
    { class: 'cg-head' },
    heading(
      blockHeadingTag(blockName) ?? 'h2',
      { class: 'cg-head__title', 'data-field': 'title' },
      title,
    ),
  )
}

/** A two-digit, zero-padded ordinal: `01`, `02`. */
export function ordinal(index: number): string {
  return String(index + 1).padStart(2, '0')
}

function parse(iso: string): Date | null {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

function format(date: Date, locale: string, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options }).format(date)
  } catch {
    return new Intl.DateTimeFormat('en', { timeZone: 'UTC', ...options }).format(date)
  }
}

/** `14 September 2026` in the page's locale, or `null` when the value is not a date. */
export function longDate(iso: string, locale: string): string | null {
  const date = parse(iso)
  return date === null ? null : format(date, locale, { dateStyle: 'long' })
}

/** `Sep 14`, the short form an index sets in its margin, or `null`. */
export function dayMonth(iso: string, locale: string): string | null {
  const date = parse(iso)
  return date === null ? null : format(date, locale, { month: 'short', day: 'numeric' })
}

/** The four-digit year an index groups by, or `null`. */
export function yearOf(iso: string): string | null {
  const date = parse(iso)
  return date === null ? null : String(date.getUTCFullYear())
}
