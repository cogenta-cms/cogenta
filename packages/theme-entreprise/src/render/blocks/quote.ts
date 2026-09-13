import type { QuoteBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * An editorial quotation inside the reading column: the display serif in
 * italic, under a hairline, with the attribution set small beneath it.
 *
 * Quieter than `testimonial`, which is this theme's large pull quote: a
 * `quote` belongs to the flow of a page, aligned with the prose column
 * rather than spread across the grid, and never in a shaded box.
 *
 * `<figure><blockquote>…</blockquote><figcaption>` is the attribution pattern
 * the HTML spec prescribes: putting the name inside the `<blockquote>` would
 * claim it was part of what was said. The portrait is decorative (the name
 * is right beside it), so its media entity's alt text is expected to be
 * empty; `image` writes the attribute either way (WCAG 1.1.1).
 */
export function renderQuote(block: QuoteBlock, ctx: RenderContext): HtmlElement {
  const hasAttribution =
    block.author !== undefined || block.role !== undefined || block.avatar !== undefined
  return section(
    'div',
    'quote',
    'cg-quote',
    {},
    'figure',
    h('blockquote', { class: 'cg-quote__text' }, h('p', { 'data-field': 'text' }, block.text)),
    hasAttribution
      ? h(
          'figcaption',
          { class: 'cg-quote__cite' },
          block.avatar === undefined
            ? null
            : image(ctx, block.avatar, {
                className: 'cg-quote__portrait',
                variant: { width: 96, height: 96, fit: 'cover' },
              }),
          h(
            'span',
            { class: 'cg-quote__who' },
            block.author === undefined
              ? null
              : h('span', { class: 'cg-quote__author', 'data-field': 'author' }, block.author),
            block.role === undefined
              ? null
              : h('span', { class: 'cg-quote__role', 'data-field': 'role' }, block.role),
          ),
        )
      : null,
  )
}
