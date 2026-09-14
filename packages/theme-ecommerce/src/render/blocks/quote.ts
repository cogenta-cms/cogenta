import type { QuoteBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * A pull quote: the words set large and light across nine columns, from the
 * second, with real quotation marks drawn by the stylesheet; the name and
 * role small beneath. A portrait, when there is one, is a small square
 * beside the name, never a circle floating above the text.
 */
export function renderQuote(block: QuoteBlock, ctx: RenderContext): HtmlElement {
  const who =
    block.author === undefined && block.role === undefined
      ? null
      : h(
          'figcaption',
          { class: 'ce-quote__attribution' },
          block.avatar === undefined
            ? null
            : image(ctx, block.avatar, { className: 'ce-quote__avatar', sizes: '3rem' }),
          h(
            'span',
            { class: 'ce-quote__who' },
            block.author === undefined
              ? null
              : h('span', { class: 'ce-quote__author', 'data-field': 'author' }, block.author),
            block.role === undefined
              ? null
              : h('span', { class: 'ce-quote__role', 'data-field': 'role' }, block.role),
          ),
        )

  return section(
    'div',
    'quote',
    'ce-quote',
    {},
    'figure',
    h(
      'blockquote',
      { class: 'ce-quote__quote' },
      h('p', { class: 'ce-quote__text', 'data-field': 'text' }, block.text),
    ),
    who,
  )
}
