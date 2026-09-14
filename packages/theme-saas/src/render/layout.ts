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
 * The outer element carries the one section rhythm (`--cs-section`, the same
 * for every block) and paints edge to edge when a variant asks for a band.
 * The inner element is the twelve-column container, so a section title, a
 * feature, a price and a caption all start on the same left edge.
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
    { class: `cs-section ${className}`, 'data-block': block, ...attrs },
    h(inner, { class: `cs-container ${className}__inner` }, ...children),
  )
}

/**
 * A titled block's heading: set in Geist at the section size, from the first
 * column, left-aligned with the content under it. A product page names a
 * section in a few plain words, and nothing decorates it.
 */
export function sectionHead(blockName: string, title: string | undefined): HtmlElement | null {
  if (title === undefined) return null
  return h(
    'div',
    { class: 'cs-head' },
    heading(
      blockHeadingTag(blockName) ?? 'h2',
      { class: 'cs-head__title', 'data-field': 'title' },
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
