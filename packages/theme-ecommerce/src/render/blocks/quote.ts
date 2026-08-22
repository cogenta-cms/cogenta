import type { QuoteBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'

/**
 * Styled as a customer-review card rather than an editorial pull-quote — the
 * shape a storefront reaches for when it wants a testimonial to read as
 * social proof. No star rating is invented: contract B carries no such field,
 * and a card that implied one without data behind it would be the exact
 * fabrication the theme has to avoid.
 *
 * `<figure><blockquote>…</blockquote><figcaption>` is the attribution pattern
 * the HTML spec prescribes — the author's name sits outside the quoted text,
 * never inside it.
 */
export function renderQuote(block: QuoteBlock, ctx: RenderContext): HtmlElement {
  const hasAttribution =
    block.author !== undefined || block.role !== undefined || block.avatar !== undefined
  return h(
    'figure',
    { class: 'ce-block ce-quote', 'data-block': 'quote' },
    h('blockquote', { class: 'ce-quote__text' }, h('p', { 'data-field': 'text' }, block.text)),
    hasAttribution
      ? h(
          'figcaption',
          { class: 'ce-quote__attribution' },
          block.avatar === undefined
            ? null
            : image(ctx, block.avatar, {
                className: 'ce-quote__avatar',
                variant: { width: 96, height: 96, fit: 'cover' },
              }),
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
      : null,
  )
}
