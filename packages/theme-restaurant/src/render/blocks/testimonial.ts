import type { TestimonialBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext, renderRichText } from '@cogenta/theme-kit'

/**
 * A centred, oversized quotation mark stands above the quote (a CSS
 * pseudo-glyph, not markup) — the guestbook-page treatment this theme's
 * elegance calls for, rather than a bordered "client success" card.
 *
 * `<figure><blockquote>…</blockquote><figcaption>` is the attribution
 * pattern the HTML spec prescribes: putting the author inside the
 * `<blockquote>` would claim the author's name was part of what was said.
 *
 * The avatar is decorative — the name sits right beside it in text — so its
 * media entity's alt text is expected to be empty; `image` still writes the
 * attribute either way (WCAG 1.1.1).
 */
export function renderTestimonial(block: TestimonialBlock, ctx: RenderContext): HtmlElement {
  const { attribution } = block
  return h(
    'figure',
    { class: 'cg-testimonial', 'data-block': 'testimonial' },
    h('blockquote', { class: 'cg-testimonial__quote' }, renderRichText(ctx, block.quote)),
    h(
      'figcaption',
      { class: 'cg-testimonial__attribution' },
      attribution.avatar === undefined
        ? null
        : image(ctx, attribution.avatar, {
            className: 'cg-testimonial__avatar',
            variant: { width: 88, height: 88, fit: 'cover' },
          }),
      h(
        'span',
        { class: 'cg-testimonial__who' },
        h('span', { class: 'cg-testimonial__name' }, attribution.name),
        attribution.role === undefined
          ? null
          : h('span', { class: 'cg-testimonial__role' }, attribution.role),
      ),
    ),
  )
}
