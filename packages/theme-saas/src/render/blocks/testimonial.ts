import type { TestimonialBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext, renderRichText } from '@cogenta/theme-kit'
import { optionalText, section } from '../layout.js'

/**
 * One customer's words, done properly.
 *
 * The quotation takes the first eight columns, its first paragraph set at the
 * quote size and any further paragraph at the reading size under it; the
 * attribution follows with the name and the role. When the customer has a
 * portrait, it is shown as a photograph (square, in the hairline frame of the
 * theme) on the last three columns rather than shrunk to a dot, and repeated
 * nowhere else. On a phone the portrait becomes a small square beside the
 * name.
 */
export function renderTestimonial(block: TestimonialBlock, ctx: RenderContext): HtmlElement {
  const { attribution } = block
  const portrait =
    attribution.avatar === undefined
      ? null
      : h(
          'div',
          { class: 'cs-testimonial__portrait cs-frame' },
          image(ctx, attribution.avatar, {
            className: 'cs-testimonial__image cs-frame__image',
            sizes: '(min-width: 64rem) 18rem, 4rem',
          }),
        )

  return section(
    'div',
    'testimonial',
    'cs-testimonial',
    { 'data-portrait': portrait === null ? 'false' : 'true' },
    'figure',
    h('blockquote', { class: 'cs-testimonial__quote' }, renderRichText(ctx, block.quote)),
    h(
      'figcaption',
      { class: 'cs-testimonial__attribution' },
      h('span', { class: 'cs-testimonial__name' }, attribution.name),
      optionalText('span', 'cs-testimonial__role', attribution.role),
    ),
    portrait,
  )
}
