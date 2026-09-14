import type { TestimonialBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext, renderRichText } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * A customer's own words, set like a letter: the text large and light on
 * eight columns, the name and what they bought beneath it at the caption
 * size. The layout does not depend on a portrait; when one is there it is a
 * small square beside the name.
 */
export function renderTestimonial(block: TestimonialBlock, ctx: RenderContext): HtmlElement {
  const { attribution } = block
  return section(
    'div',
    'testimonial',
    'ce-letter',
    {},
    'figure',
    h('blockquote', { class: 'ce-letter__quote' }, renderRichText(ctx, block.quote)),
    h(
      'figcaption',
      { class: 'ce-letter__attribution' },
      attribution.avatar === undefined
        ? null
        : image(ctx, attribution.avatar, { className: 'ce-letter__avatar', sizes: '3.5rem' }),
      h(
        'span',
        { class: 'ce-letter__who' },
        h('span', { class: 'ce-letter__name' }, attribution.name),
        attribution.role === undefined
          ? null
          : h('span', { class: 'ce-letter__role' }, attribution.role),
      ),
    ),
  )
}
