import type { LogoStripBlock, LogoStripItem } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'

/**
 * `blocks@2.0` (RFC 0001). The lighter-weight "as seen in" / social-proof row
 * next to `logos`: no per-logo name or link, so no accessible-name field to
 * require — each image's own alt text (set once, in the media library)
 * names it, exactly as `logos` already falls back to when a link is absent.
 *
 * Unlike `logos`'s held-back-until-hovered grayscale treatment, this strip
 * renders every mark at full colour and even weight in a single row — the
 * quieter, denser "as seen in" convention, distinct from the client-cards
 * feel `logos` is built for.
 */
function renderItem(item: LogoStripItem, ctx: RenderContext): HtmlElement {
  return h(
    'li',
    { class: 'cg-logo-band__item' },
    image(ctx, item.media, { className: 'cg-logo-band__image', variant: { fit: 'contain' } }),
  )
}

export function renderLogoStrip(block: LogoStripBlock, ctx: RenderContext): HtmlElement {
  return h(
    'figure',
    { class: 'cg-logo-band', 'data-block': 'logoStrip' },
    h(
      'ul',
      { class: 'cg-logo-band__items' },
      block.logos.map((item) => renderItem(item, ctx)),
    ),
    block.caption === undefined
      ? null
      : h('figcaption', { class: 'cg-logo-band__caption', 'data-field': 'caption' }, block.caption),
  )
}
