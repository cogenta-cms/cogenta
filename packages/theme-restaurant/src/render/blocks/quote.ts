import type { QuoteBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'

/**
 * A single centred line, set in the display serif — the "menu insert"
 * pull-quote, distinct from `testimonial`'s guestbook card.
 */
export function renderQuote(block: QuoteBlock, ctx: RenderContext): HtmlElement {
  const hasAttribution =
    block.author !== undefined || block.role !== undefined || block.avatar !== undefined
  return h(
    'figure',
    { class: 'cg-line', 'data-block': 'quote' },
    h('blockquote', { class: 'cg-line__text' }, h('p', { 'data-field': 'text' }, block.text)),
    hasAttribution
      ? h(
          'figcaption',
          { class: 'cg-line__attribution' },
          block.avatar === undefined
            ? null
            : image(ctx, block.avatar, {
                className: 'cg-line__avatar',
                variant: { width: 72, height: 72, fit: 'cover' },
              }),
          h(
            'span',
            { class: 'cg-line__who' },
            block.author === undefined
              ? null
              : h('span', { class: 'cg-line__author', 'data-field': 'author' }, block.author),
            block.role === undefined
              ? null
              : h('span', { class: 'cg-line__role', 'data-field': 'role' }, block.role),
          ),
        )
      : null,
  )
}
