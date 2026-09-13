import type { TestimonialBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext, renderRichText } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * `blocks@2.0` (RFC 0001). The large pull quote: one client's words set in
 * the display serif across ten columns, with typographic quotation marks
 * hung in the margin, and a small square portrait beside the name.
 *
 * No tinted panel, no border on one side, no italic box: the size of the
 * type and the space around it are the emphasis. The quote is rich text, so
 * a testimonial may carry a link or emphasis the plain-text `quote` cannot.
 *
 * The portrait is decorative (the name is beside it in text), so its alt
 * text is expected to be empty; `image` writes the attribute either way.
 */
export function renderTestimonial(block: TestimonialBlock, ctx: RenderContext): HtmlElement {
  const { attribution } = block
  return section(
    'div',
    'testimonial',
    'cg-pullquote',
    {},
    'figure',
    h('blockquote', { class: 'cg-pullquote__quote' }, renderRichText(ctx, block.quote)),
    h(
      'figcaption',
      { class: 'cg-pullquote__cite' },
      attribution.avatar === undefined
        ? null
        : image(ctx, attribution.avatar, {
            className: 'cg-pullquote__portrait',
            variant: { width: 144, height: 144, fit: 'cover' },
          }),
      h(
        'span',
        { class: 'cg-pullquote__who' },
        h('span', { class: 'cg-pullquote__name' }, attribution.name),
        attribution.role === undefined
          ? null
          : h('span', { class: 'cg-pullquote__role' }, attribution.role),
      ),
    ),
  )
}
