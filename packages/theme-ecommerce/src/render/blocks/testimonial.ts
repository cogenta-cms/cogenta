import type { TestimonialBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext, renderRichText } from '@cogenta/theme-kit'

/**
 * A testimonial wall card, distinct from `quote`'s centred editorial
 * pull-quote: this is the shape a storefront reaches for when it wants many
 * of these side by side (a grid of social proof), so it is styled as one
 * more shoppable card rather than a full-bleed statement.
 *
 * `attribution` is one grouped field, not three top-level ones (unlike
 * `quote`'s own `author`/`role`/`avatar`) — its members are nested data, not
 * a block-level plain-text field, so none of them carry `data-field`; only a
 * field the block schema itself declares at the top level gets one.
 *
 * The avatar is decorative, same convention as `quote.ts`'s own avatar: the
 * name sits right beside it in text, so no `altFrom` is passed.
 */
export function renderTestimonial(block: TestimonialBlock, ctx: RenderContext): HtmlElement {
  const { attribution } = block
  return h(
    'figure',
    { class: 'ce-block ce-testimonial', 'data-block': 'testimonial' },
    h('blockquote', { class: 'ce-testimonial__quote' }, renderRichText(ctx, block.quote)),
    h(
      'figcaption',
      { class: 'ce-testimonial__attribution' },
      attribution.avatar === undefined
        ? null
        : image(ctx, attribution.avatar, {
            className: 'ce-testimonial__avatar',
            variant: { width: 96, height: 96, fit: 'cover' },
          }),
      h(
        'span',
        { class: 'ce-testimonial__who' },
        h('span', { class: 'ce-testimonial__name' }, attribution.name),
        attribution.role === undefined
          ? null
          : h('span', { class: 'ce-testimonial__role' }, attribution.role),
      ),
    ),
  )
}
