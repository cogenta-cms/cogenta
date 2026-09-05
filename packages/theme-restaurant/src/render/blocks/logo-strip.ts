import type { LogoStripBlock, LogoStripItem } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'

/**
 * `blocks@2.0` (RFC 0001). The lighter-weight "as seen in" row next to
 * `logos`: no per-logo name or link, so no accessible-name field to
 * require — each image's own alt text (set once, in the media library)
 * names it, exactly as `logos` falls back to when a link is absent.
 */
function renderItem(item: LogoStripItem, ctx: RenderContext): HtmlElement {
  return h(
    'li',
    { class: 'cg-press-strip__item' },
    image(ctx, item.media, { className: 'cg-press-strip__image', variant: { fit: 'contain' } }),
  )
}

export function renderLogoStrip(block: LogoStripBlock, ctx: RenderContext): HtmlElement {
  return h(
    'figure',
    { class: 'cg-press-strip', 'data-block': 'logoStrip' },
    h(
      'ul',
      { class: 'cg-press-strip__items' },
      block.logos.map((item) => renderItem(item, ctx)),
    ),
    block.caption === undefined
      ? null
      : h(
          'figcaption',
          { class: 'cg-press-strip__caption', 'data-field': 'caption' },
          block.caption,
        ),
  )
}
