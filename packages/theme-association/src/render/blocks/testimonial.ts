import type { TestimonialBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext, renderRichText } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * One person's own account of what the organisation meant to them, told
 * with their photograph: the portrait cropped to 4:5 on the first four
 * columns, the words in the display face on the last seven, starting on a
 * hung quotation mark, and the name and what they do here beneath them.
 * Without a portrait the words take the reading column alone; nothing stands
 * in for the missing face.
 */
export function renderTestimonial(block: TestimonialBlock, ctx: RenderContext): HtmlElement {
  const { attribution } = block
  return section(
    'div',
    'testimonial',
    'ca-story',
    { 'data-portrait': String(attribution.avatar !== undefined) },
    'figure',
    attribution.avatar === undefined
      ? null
      : h(
          'div',
          { class: 'ca-story__portrait' },
          image(ctx, attribution.avatar, {
            className: 'ca-story__image',
            sizes: '(min-width: 64rem) 26rem, 70vw',
          }),
        ),
    h(
      'div',
      { class: 'ca-story__words' },
      h('blockquote', { class: 'ca-story__quote' }, renderRichText(ctx, block.quote)),
      h(
        'figcaption',
        { class: 'ca-story__attribution' },
        h('span', { class: 'ca-story__name' }, attribution.name),
        attribution.role === undefined
          ? null
          : h('span', { class: 'ca-story__role' }, attribution.role),
      ),
    ),
  )
}
