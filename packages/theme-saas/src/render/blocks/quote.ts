import type { QuoteBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'

/**
 * A testimonial card, not a centred pull-quote: a bordered panel with a
 * vertical accent rule beside the quotation and the attribution set below a
 * thin divider — the shape a case-study or client-testimonial section takes
 * on a serious B2B site.
 *
 * `<figure><blockquote>…</blockquote><figcaption>` is the attribution
 * pattern the HTML spec prescribes: putting the author inside the
 * `<blockquote>` would claim the author's name was part of what was said.
 *
 * The avatar is decorative here — the name sits right beside it in text —
 * so its media entity's alt text is expected to be empty; `image` still
 * writes the attribute either way (WCAG 1.1.1).
 */
export function renderQuote(block: QuoteBlock, ctx: RenderContext): HtmlElement {
  const hasAttribution =
    block.author !== undefined || block.role !== undefined || block.avatar !== undefined
  return h(
    'figure',
    { class: 'cg-quote', 'data-block': 'quote' },
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
