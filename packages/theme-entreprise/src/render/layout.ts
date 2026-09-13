import { type Attributes, type Child, type HtmlElement, h } from '@cogenta/theme-kit'

/**
 * The frame every block of this theme renders into.
 *
 * The outer element is full width, so a band (the ink call to action, a
 * muted variant) can paint edge to edge and so the section rhythm
 * (`--cg-section`) is applied once, to every block alike. The inner element
 * is the twelve-column container: one maximum width, one gutter, one column
 * gap, for the whole site.
 *
 * `inner` is `figure` for the blocks whose own semantics are a figure (a
 * quotation and its attribution, an image and its caption): `<figcaption>`
 * must be a direct child of its `<figure>`, so the figure has to be the
 * container itself rather than something nested inside it.
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

/** A two-digit, zero-padded ordinal: `01`, `02`… — the index language this theme uses for numbered rows. */
export function ordinal(index: number): string {
  return String(index + 1).padStart(2, '0')
}

/**
 * A thin right arrow, drawn inline and hidden from assistive technology: it
 * repeats what the link it sits in already says.
 */
export function arrow(): HtmlElement {
  return h(
    'svg',
    {
      class: 'cg-arrow',
      viewBox: '0 0 20 20',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.5',
      'stroke-linecap': 'square',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    h('path', { d: 'M3 10h13M11.5 5.5 16 10l-4.5 4.5' }),
  )
}

/** `March 2026` in the page's locale, or `null` when the value is not a date `Intl` can format. */
export function monthYear(iso: string, locale: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  try {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date)
  } catch {
    return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(date)
  }
}
