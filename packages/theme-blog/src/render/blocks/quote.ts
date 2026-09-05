import type { QuoteBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'

/**
 * A reader's words, set as a large display serif pull-quote with an oversized
 * quotation mark standing in the margin — the one place this theme spends a
 * genuinely large display size outside the hero.
 */
export function renderQuote(block: QuoteBlock, ctx: RenderContext): HtmlElement {
  const hasAttribution =
    block.author !== undefined || block.role !== undefined || block.avatar !== undefined
  return h(
    'figure',
    { class: 'cg-quote', 'data-block': 'quote' },
    h('span', { class: 'cg-quote__mark', 'aria-hidden': 'true' }, '“'),
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
