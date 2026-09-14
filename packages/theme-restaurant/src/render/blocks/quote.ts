import type { QuoteBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * A line from the press, set the way a newspaper sets a pull quote rather
 * than the way a template sets a review card: the words large and light in
 * the display serif across nine columns from the second, with real quotation
 * marks hung in the margin by the stylesheet; the writer's name and the
 * publication small beneath, after a short hairline. A portrait, when there
 * is one, is a small square beside the name, never a circle above the words.
 */
export function renderQuote(block: QuoteBlock, ctx: RenderContext): HtmlElement {
  const who =
    block.author === undefined && block.role === undefined
      ? null
      : h(
          'figcaption',
          { class: 'cr-quote__attribution' },
          block.avatar === undefined
            ? null
            : image(ctx, block.avatar, { className: 'cr-quote__avatar', sizes: '3rem' }),
          h(
            'span',
            { class: 'cr-quote__who' },
            block.author === undefined
              ? null
              : h('span', { class: 'cr-quote__author', 'data-field': 'author' }, block.author),
            block.role === undefined
              ? null
              : h('span', { class: 'cr-quote__role', 'data-field': 'role' }, block.role),
          ),
        )

  return section(
    'div',
    'quote',
    'cr-quote',
    {},
    'figure',
    h(
      'blockquote',
      { class: 'cr-quote__quote' },
      h('p', { class: 'cr-quote__text', 'data-field': 'text' }, block.text),
    ),
    who,
  )
}
