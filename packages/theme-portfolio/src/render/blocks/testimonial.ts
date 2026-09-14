import type { TestimonialBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext, renderRichText } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * A longer word from a client, quieter than `quote`: the words at the lead
 * size from the fourth column, a hairline above them, and the client under
 * them with their role. Where `quote` is a line set large, a testimonial is a
 * paragraph meant to be read.
 */
export function renderTestimonial(block: TestimonialBlock, ctx: RenderContext): HtmlElement {
  const { attribution } = block
  return section(
    'div',
    'testimonial',
    'cg-word',
    {},
    'figure',
    h('blockquote', { class: 'cg-word__quote' }, renderRichText(ctx, block.quote)),
    h(
      'figcaption',
      { class: 'cg-word__attribution' },
      attribution.avatar === undefined
        ? null
        : image(ctx, attribution.avatar, {
            className: 'cg-word__avatar',
            variant: { width: 96, height: 96, fit: 'cover' },
          }),
      h(
        'span',
        { class: 'cg-word__who' },
        h('span', { class: 'cg-word__name' }, attribution.name),
        attribution.role === undefined
          ? null
          : h('span', { class: 'cg-word__role' }, attribution.role),
      ),
    ),
  )
}
