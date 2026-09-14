import type { TestimonialBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { optionalText, section } from '../layout.js'
import { renderDocsRichText } from '../rich-text.js'

/**
 * One person's account of using the product: the same register as `quote`
 * (a rule in ink on the left, real quotation marks), with rich text, so a
 * testimonial can hold a second paragraph or a command in `code`. The first
 * paragraph is set at the quote size, the rest at the reading size.
 */
export function renderTestimonial(block: TestimonialBlock, ctx: RenderContext): HtmlElement {
  const { attribution } = block
  return section(
    'div',
    'testimonial',
    'cd-testimonial',
    {},
    'figure',
    h('blockquote', { class: 'cd-testimonial__quote' }, renderDocsRichText(ctx, block.quote)),
    h(
      'figcaption',
      { class: 'cd-person' },
      attribution.avatar === undefined
        ? null
        : image(ctx, attribution.avatar, { className: 'cd-person__avatar', sizes: '2.5rem' }),
      h(
        'span',
        { class: 'cd-person__words' },
        h('span', { class: 'cd-person__name' }, attribution.name),
        optionalText('span', 'cd-person__role', attribution.role),
      ),
    ),
  )
}
