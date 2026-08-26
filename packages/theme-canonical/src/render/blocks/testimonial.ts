import type { TestimonialBlock } from '@cogenta/blocks'
import type { RenderContext } from '../../theme-contract.js'
import { type HtmlElement, h } from '../html.js'
import { image } from '../media.js'
import { renderRichText } from '../rich-text.js'

/**
 * `blocks@2.0` (RFC 0001). Same `<figure><blockquote>…<figcaption>` pattern
 * as `quote`, but the quote itself is rich text (a testimonial can carry a
 * link or emphasis the shorter, plain-text `quote` block cannot) and the
 * attribution is one grouped field rather than three loose ones.
 *
 * The avatar is decorative, exactly like `quote`'s own: the name is right
 * beside it in text, so its media entity's alt text is expected to be empty.
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
