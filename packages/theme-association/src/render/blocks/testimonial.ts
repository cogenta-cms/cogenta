import type { TestimonialBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext, renderRichText } from '@cogenta/theme-kit'

/**
 * `blocks@2.0` (RFC 0001). A volunteer's own words — the same
 * `<figure><blockquote>…</blockquote><figcaption>` pattern `quote` uses, but
 * the quote itself is rich text and the attribution is the block's single
 * grouped `attribution` field. The avatar sits in a round frame, echoing the
 * hero's own rounded, friendly treatment.
 */
export function renderTestimonial(block: TestimonialBlock, ctx: RenderContext): HtmlElement {
  const { attribution } = block
  return h(
    'figure',
    { class: 'cg-block cg-testimonial', 'data-block': 'testimonial' },
    h('blockquote', { class: 'cg-testimonial__quote' }, renderRichText(ctx, block.quote)),
    h(
      'figcaption',
      { class: 'cg-testimonial__attribution' },
      attribution.avatar === undefined
        ? null
        : image(ctx, attribution.avatar, {
            className: 'cg-testimonial__avatar',
            variant: { width: 96, height: 96, fit: 'cover' },
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
