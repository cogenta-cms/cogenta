import type { TestimonialBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext, renderRichText } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * A letter from a reader, set as the letters page sets one: the words in the
 * reading face one step above the text size, a hairline, and the writer's
 * name in small capitals with where they write from. Quieter than `quote` on
 * purpose: a pull quote is display, a letter is correspondence.
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
