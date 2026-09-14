import type { TestimonialBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext, renderRichText } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * A guest's own words, set like a note left in the book by the door: the text
 * in the serif italic at the lead size on seven columns from the fourth, the
 * name and the occasion beneath it at the caption size. Smaller and quieter
 * than a press quote, on purpose. The layout does not depend on a portrait;
 * when one is there it is a small square beside the name.
 */
export function renderTestimonial(block: TestimonialBlock, ctx: RenderContext): HtmlElement {
  const { attribution } = block
  return section(
    'div',
    'testimonial',
    'cr-note',
    {},
    'figure',
    h('blockquote', { class: 'cr-note__quote' }, renderRichText(ctx, block.quote)),
    h(
      'figcaption',
      { class: 'cr-note__attribution' },
      attribution.avatar === undefined
        ? null
        : image(ctx, attribution.avatar, { className: 'cr-note__avatar', sizes: '3.5rem' }),
      h(
        'span',
        { class: 'cr-note__who' },
        h('span', { class: 'cr-note__name' }, attribution.name),
        attribution.role === undefined
          ? null
          : h('span', { class: 'cr-note__role' }, attribution.role),
      ),
    ),
  )
}
