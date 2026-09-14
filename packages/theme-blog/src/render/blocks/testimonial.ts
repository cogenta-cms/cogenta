import type { TestimonialBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext, renderRichText } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * A letter from a reader, quoted in the reading column: the words one step
 * above the text size, then the person's name and what they do. Quieter
 * than `quote` on purpose: an epigraph is set as display, a reader's note as
 * correspondence.
 */
export function renderTestimonial(block: TestimonialBlock, ctx: RenderContext): HtmlElement {
  const { attribution } = block
  return section(
    'div',
    'testimonial',
    'cg-letter',
    {},
    'figure',
    h('blockquote', { class: 'cg-letter__quote' }, renderRichText(ctx, block.quote)),
    h(
      'figcaption',
      { class: 'cg-letter__attribution' },
      attribution.avatar === undefined
        ? null
        : image(ctx, attribution.avatar, {
            className: 'cg-letter__avatar',
            variant: { width: 96, height: 96, fit: 'cover' },
          }),
      h(
        'span',
        { class: 'cg-letter__who' },
        h('span', { class: 'cg-letter__name' }, attribution.name),
        attribution.role === undefined
          ? null
          : h('span', { class: 'cg-letter__role' }, attribution.role),
      ),
    ),
  )
}
