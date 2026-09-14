import {
  type Attributes,
  blockHeadingTag,
  type Child,
  type HtmlElement,
  h,
  heading,
} from '@cogenta/theme-kit'

/**
 * The frame every block of this theme renders into.
 *
 * The outer element carries the one section rhythm (`--cd-section`, the same
 * for every block) and paints edge to edge when a variant asks for a band.
 * The inner element is the twelve-column container, so a section title, a
 * link, a figure and a caption all start on the same left edge. Inside a
 * documentation page the same markup is laid out in the reading column
 * instead (`docs.css`), so a block placed in an article needs nothing extra.
 *
 * `inner` is `figure` for a block whose semantics are a figure (a quotation
 * and its attribution, an image and its caption): `<figcaption>` must be a
 * direct child of its `<figure>`.
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
    { class: `cd-section ${className}`, 'data-block': block, ...attrs },
    h(inner, { class: `cd-container ${className}__inner` }, ...children),
  )
}

/** A titled block's heading, from the first column, left-aligned with the content under it. */
export function sectionHead(blockName: string, title: string | undefined): HtmlElement | null {
  if (title === undefined || title.trim() === '') return null
  return h(
    'div',
    { class: 'cd-head' },
    heading(
      blockHeadingTag(blockName) ?? 'h2',
      { class: 'cd-head__title', 'data-field': 'title' },
      title,
    ),
  )
}

/** A paragraph that renders only when the text is there: no empty `<p>` on the page. */
export function optionalText(
  tag: string,
  className: string,
  value: string | undefined,
  attrs: Attributes = {},
): HtmlElement | null {
  if (value === undefined || value.trim() === '') return null
  return h(tag, { class: className, ...attrs }, value)
}

/** `Intl.DateTimeFormat`'s long date in the page's locale: "September 14, 2026". */
export function longDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
      new Date(iso),
    )
  } catch {
    return iso.slice(0, 10)
  }
}
