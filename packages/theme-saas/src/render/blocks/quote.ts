import type { QuoteBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { optionalText, section } from '../layout.js'

/**
 * A quotation set large in Geist on ten columns, in real curly quotation
 * marks drawn by the stylesheet, with its attribution under it: a small round
 * portrait when there is one, the name, and the role in the secondary ink.
 * A hairline in ink above it, and nothing around it.
 */
export function renderQuote(block: QuoteBlock, ctx: RenderContext): HtmlElement {
  const hasAttribution = block.author !== undefined || block.role !== undefined
  return section(
    'div',
    'quote',
    'cs-quote',
    {},
    'figure',
    h(
      'blockquote',
      { class: 'cs-quote__body' },
      h('p', { class: 'cs-quote__text', 'data-field': 'text' }, block.text),
    ),
    hasAttribution
      ? h(
          'figcaption',
          { class: 'cs-person' },
          block.avatar === undefined
            ? null
            : image(ctx, block.avatar, { className: 'cs-person__avatar', sizes: '3rem' }),
          h(
            'span',
            { class: 'cs-person__words' },
            optionalText('span', 'cs-person__name', block.author, { 'data-field': 'author' }),
            optionalText('span', 'cs-person__role', block.role, { 'data-field': 'role' }),
          ),
        )
      : null,
  )
}
