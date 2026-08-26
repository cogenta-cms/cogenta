import type { TestimonialBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext, renderRichText } from '@cogenta/theme-kit'

/**
 * Distinct from `quote` on purpose (RFC 0001): `quote` is this theme's full-
 * bleed pull quote, set left-aligned at display scale with no frame. A wall
 * of testimonials needs to sit several-up without each one reading as a
 * headline, so this is a bordered card instead — the same "cut paper"
 * language `feature-grid.ts` uses for its items, at a quieter type scale.
 *
 * `attribution` arrives as one grouped field (RFC 0001's own reasoning for
 * shaping it that way), so its `name`/`role` are not marked `data-field`:
 * that attribute is reserved for a plain-text field the block schema
 * declares at the top level, and neither of these is one — only `attribution`
 * itself is, and it is not plain text.
 *
 * The avatar is decorative, exactly like `quote.ts`'s own — the name sits
 * right beside it in text, so its media entity's alt text is expected empty.
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
        { class: 'cg-testimonial__names' },
        h('span', { class: 'cg-testimonial__name' }, attribution.name),
        attribution.role === undefined
          ? null
          : h('span', { class: 'cg-testimonial__role' }, attribution.role),
      ),
    ),
  )
}
