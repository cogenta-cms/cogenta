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
 * The outer element carries the one section rhythm (`--ca-section`, the same
 * for every block) and paints edge to edge when a block is a band. The inner
 * element is the twelve-column container, so a section title, a figure, a
 * date and a caption all start on the same line.
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
    { class: `ca-section ${className}`, 'data-block': block, ...attrs },
    h(inner, { class: `ca-container ${className}__inner` }, ...children),
  )
}

/**
 * A titled block's heading, in the display face at the section size, on the
 * first column of the grid. `null` for an untitled block: no empty heading.
 */
export function sectionHead(blockName: string, title: string | undefined): HtmlElement | null {
  if (title === undefined) return null
  return h(
    'div',
    { class: 'ca-head' },
    heading(
      blockHeadingTag(blockName) ?? 'h2',
      { class: 'ca-head__title', 'data-field': 'title' },
      title,
    ),
  )
}

/**
 * The words of an arrow link, with the last word wrapped in a span that
 * cannot break and that carries the arrow (`::after`, drawn by the
 * stylesheet). A line can then break between words but never between the
 * last word and its arrow, so an arrow is never left alone at the start of a
 * line, and the words keep one continuous underline: the arrow is an atomic
 * inline, which a text decoration does not reach.
 */
export function arrowWords(text: string): Child[] {
  const trimmed = text.trim()
  const at = trimmed.lastIndexOf(' ')
  const end = h('span', { class: 'ca-arrow-link__end' }, trimmed.slice(at + 1))
  return at === -1 ? [end] : [trimmed.slice(0, at + 1), end]
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
