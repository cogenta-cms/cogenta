import type { QuoteBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * A client's words, set large in the text width from the fourth column, with
 * typographic quotation marks from the stylesheet (`quotes`), and the speaker
 * under them in the caption size: their name, then their role. The portrait,
 * when there is one, is a small square: it is decorative (the name is beside
 * it in text), so it keeps the media library's own empty `alt`.
 */
export function renderQuote(block: QuoteBlock, ctx: RenderContext): HtmlElement {
  const hasAttribution = block.author !== undefined || block.role !== undefined
  return section(
    'div',
    'quote',
    'cg-quote',
    {},
    'figure',
    h(
      'blockquote',
      { class: 'cg-quote__quote' },
      h('p', { class: 'cg-quote__text', 'data-field': 'text' }, block.text),
    ),
    hasAttribution
      ? h(
          'figcaption',
          { class: 'cg-quote__attribution' },
          block.avatar === undefined
            ? null
            : image(ctx, block.avatar, {
                className: 'cg-quote__avatar',
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
