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
 * The outer element carries the one section rhythm (`--ce-section`, the same
 * for every block) and paints edge to edge when a variant asks for a band.
 * The inner element is the twelve-column container, so a section title, a
 * product photograph, a caption and a price all start on the same line.
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
    { class: `ce-section ${className}`, 'data-block': block, ...attrs },
    h(inner, { class: `ce-container ${className}__inner` }, ...children),
  )
}

/**
 * A titled block's heading: set at the section size in the text face, on the
 * first columns of the grid, with nothing around it. A shop lets the goods
 * carry the page, so a section names itself plainly and gets out of the way.
 */
export function sectionHead(blockName: string, title: string | undefined): HtmlElement | null {
  if (title === undefined) return null
  return h(
    'div',
    { class: 'ce-head' },
    heading(
      blockHeadingTag(blockName) ?? 'h2',
      { class: 'ce-head__title', 'data-field': 'title' },
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
