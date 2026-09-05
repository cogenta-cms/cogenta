import type { QuoteBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'

/**
 * `<figure><blockquote>…</blockquote><figcaption>` is the attribution
 * pattern the HTML spec prescribes: putting the author inside the
 * `<blockquote>` would claim the author's name is part of what was said.
 *
 * The avatar is decorative here — the name is right beside it in text — so
 * its media entity's alt text is expected to be empty. `image` still writes
 * the attribute either way.
 */
export function renderQuote(block: QuoteBlock, ctx: RenderContext): HtmlElement {
  const hasAttribution =
    block.author !== undefined || block.role !== undefined || block.avatar !== undefined
  return h(
    'figure',
    { class: 'cg-block cg-quote', 'data-block': 'quote' },
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
          block.author === undefined
            ? null
            : h('span', { class: 'cg-quote__author', 'data-field': 'author' }, block.author),
          block.role === undefined
            ? null
            : h('span', { class: 'cg-quote__role', 'data-field': 'role' }, block.role),
        )
      : null,
  )
}
