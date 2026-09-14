import type { QuoteBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * A pull quote: a short red rule, the words in the display face at a large
 * italic size, and the speaker in small capitals with their role after them.
 * In an article it hangs to the left of the reading column; on any other page
 * it takes the same columns as the text around it.
 *
 * The avatar is decorative (the name is beside it in text), so it keeps the
 * media library's own empty `alt`.
 */
export function renderQuote(block: QuoteBlock, ctx: RenderContext): HtmlElement {
  const hasAttribution = block.author !== undefined || block.role !== undefined
  return section(
    'div',
    'quote',
    'cg-pullquote',
    {},
    'figure',
    h(
      'blockquote',
      { class: 'cg-pullquote__quote' },
      h('p', { class: 'cg-pullquote__text', 'data-field': 'text' }, block.text),
    ),
    hasAttribution
      ? h(
          'figcaption',
          { class: 'cg-pullquote__attribution' },
          block.avatar === undefined
            ? null
            : image(ctx, block.avatar, {
                className: 'cg-pullquote__avatar',
                variant: { width: 96, height: 96, fit: 'cover' },
              }),
          block.author === undefined
            ? null
            : h('span', { class: 'cg-pullquote__author', 'data-field': 'author' }, block.author),
          block.role === undefined
            ? null
            : h('span', { class: 'cg-pullquote__role', 'data-field': 'role' }, block.role),
        )
      : null,
  )
}
