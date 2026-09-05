import type { TestimonialBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext, renderRichText } from '@cogenta/theme-kit'

/**
 * `blocks@2.0` (RFC 0001). This theme's "client success" panel — the same
 * `<figure><blockquote>…</blockquote><figcaption>` pattern `quote` uses, kept
 * consistent so the two read as siblings, but the quote itself is rich text
 * (a testimonial may carry a link or emphasis the shorter, plain-text `quote`
 * block cannot) and the attribution is the block's single grouped
 * `attribution` field rather than three loose ones.
 *
 * The avatar is decorative, exactly like `quote`'s own: the name sits right
 * beside it in text, so its media entity's alt text is expected to be empty;
 * `image` still writes the attribute either way (WCAG 1.1.1).
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
