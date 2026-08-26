import type { TestimonialBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext, renderRichText } from '@cogenta/theme-kit'

/**
 * `blocks@2.0` (RFC 0001). A reader's letter, not a pull quote: `quote`
 * already owns the theme's one "loud" typographic gesture (the giant quote
 * mark and heavy rule in `cg-pullquote`), so a testimonial reads instead as
 * a boxed letter-to-the-editor — a framed panel, the quote set in italic
 * serif at body size rather than blown up, and a byline row underneath a
 * hairline rule, the way a magazine runs its reader mail column.
 *
 * The quote is rich text (unlike `quote`'s plain-text `text`), so a
 * testimonial can carry a link or emphasis; `renderRichText` handles it the
 * same way `accordion`'s answers and `prose`'s body do.
 *
 * The avatar is decorative, exactly like `quote`'s own: the name sits right
 * beside it in text, so its media entity's alt text is expected to be empty.
 */
export function renderTestimonial(block: TestimonialBlock, ctx: RenderContext): HtmlElement {
  const { attribution } = block
  return h(
    'figure',
    { class: 'cg-block cg-letter', 'data-block': 'testimonial' },
    h('blockquote', { class: 'cg-letter__quote' }, renderRichText(ctx, block.quote)),
    h(
      'figcaption',
      { class: 'cg-letter__byline' },
      attribution.avatar === undefined
        ? null
        : image(ctx, attribution.avatar, {
            className: 'cg-letter__avatar',
            variant: { width: 96, height: 96, fit: 'cover' },
          }),
      h(
        'span',
        { class: 'cg-letter__names' },
        h('span', { class: 'cg-letter__name' }, attribution.name),
        attribution.role === undefined
          ? null
          : h('span', { class: 'cg-letter__role' }, attribution.role),
      ),
    ),
  )
}
