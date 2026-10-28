import type { QuoteBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * A pull quote: the words large in the condensed display face on a solid ink
 * band, an accent rule at their start. The attribution follows in mono, a
 * small portrait beside it when the block carries one.
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
          { class: 'cg-quote__attribution cg-label' },
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
