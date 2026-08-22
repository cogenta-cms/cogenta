import type { QuoteBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'

/**
 * The pull quote — the one typographic gesture a magazine spread always
 * makes. Set large in the display serif, indented from a heavy left rule
 * rather than centred under a giant glyph, with the attribution trailing it
 * on its own line, joined by a typographic em-rule instead of a comma the
 * markup does not carry.
 *
 * `<figure><blockquote>…</blockquote><figcaption>` is the attribution
 * pattern the HTML spec itself prescribes — the author's name sitting
 * outside the `<blockquote>` is what stops it from being claimed as part of
 * what was said.
 */
export function renderQuote(block: QuoteBlock, ctx: RenderContext): HtmlElement {
  const hasAttribution =
    block.author !== undefined || block.role !== undefined || block.avatar !== undefined
  return h(
    'figure',
    { class: 'cg-block cg-pullquote', 'data-block': 'quote' },
    h('blockquote', { class: 'cg-pullquote__text' }, h('p', { 'data-field': 'text' }, block.text)),
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
          h(
            'span',
            { class: 'cg-pullquote__names' },
            block.author === undefined
              ? null
              : h('span', { class: 'cg-pullquote__author', 'data-field': 'author' }, block.author),
            block.role === undefined
              ? null
              : h('span', { class: 'cg-pullquote__role', 'data-field': 'role' }, block.role),
          ),
        )
      : null,
  )
}
