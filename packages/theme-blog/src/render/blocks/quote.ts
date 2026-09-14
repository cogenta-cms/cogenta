import type { QuoteBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * An epigraph: the words in the italic of the text face, large, on the text
 * line, with the opening quotation mark hung in the margin so the first
 * letter keeps the column's edge. The attribution follows in the interface
 * face, a small portrait beside it when the block carries one.
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
