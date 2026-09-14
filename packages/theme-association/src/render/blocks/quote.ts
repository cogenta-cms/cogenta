import type { QuoteBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * A few words someone said, set large: the text in the display face across
 * nine columns, with a real opening quotation mark hung in the margin by the
 * stylesheet, and the speaker's name and role small beneath it. A portrait,
 * when there is one, is a small square crop beside the name.
 */
export function renderQuote(block: QuoteBlock, ctx: RenderContext): HtmlElement {
  const who =
    block.author === undefined && block.role === undefined
      ? null
      : h(
          'figcaption',
          { class: 'ca-quote__attribution' },
          block.avatar === undefined
            ? null
            : image(ctx, block.avatar, { className: 'ca-quote__avatar', sizes: '3.5rem' }),
          h(
            'span',
            { class: 'ca-quote__who' },
            block.author === undefined
              ? null
              : h('span', { class: 'ca-quote__author', 'data-field': 'author' }, block.author),
            block.role === undefined
              ? null
              : h('span', { class: 'ca-quote__role', 'data-field': 'role' }, block.role),
          ),
        )

  return section(
    'div',
    'quote',
    'ca-quote',
    {},
    'figure',
    h(
      'blockquote',
      { class: 'ca-quote__quote' },
      h('p', { class: 'ca-quote__text', 'data-field': 'text' }, block.text),
    ),
    who,
  )
}
