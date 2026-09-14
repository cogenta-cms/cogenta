import type { QuoteBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { optionalText, section } from '../layout.js'

/**
 * A quotation: in documentation, a line from an RFC, a maintainer or a team
 * that runs the product. Set at the quote size on the reading measure, in
 * real curly quotation marks drawn by the stylesheet, hanging from a rule in
 * ink on its left; the attribution under it, with a small round portrait when
 * there is one.
 */
export function renderQuote(block: QuoteBlock, ctx: RenderContext): HtmlElement {
  const hasAttribution = block.author !== undefined || block.role !== undefined
  return section(
    'div',
    'quote',
    'cd-quote',
    {},
    'figure',
    h(
      'blockquote',
      { class: 'cd-quote__body' },
      h('p', { class: 'cd-quote__text', 'data-field': 'text' }, block.text),
    ),
    hasAttribution
      ? h(
          'figcaption',
          { class: 'cd-person' },
          block.avatar === undefined
            ? null
            : image(ctx, block.avatar, { className: 'cd-person__avatar', sizes: '2.5rem' }),
          h(
            'span',
            { class: 'cd-person__words' },
            optionalText('span', 'cd-person__name', block.author, { 'data-field': 'author' }),
            optionalText('span', 'cd-person__role', block.role, { 'data-field': 'role' }),
          ),
        )
      : null,
  )
}
