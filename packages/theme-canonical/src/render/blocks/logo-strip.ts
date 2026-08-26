import type { LogoStripBlock, LogoStripItem } from '@cogenta/blocks'
import type { RenderContext } from '../../theme-contract.js'
import { type HtmlElement, h } from '../html.js'
import { image } from '../media.js'

/**
 * `blocks@2.0` (RFC 0001). The lighter-weight "as seen in" / social-proof
 * row next to `logos`: no per-logo name or link, so no accessible-name field
 * to require — each image's own alt text (set once, in the media library)
 * is what names it, exactly as `logos` already falls back to when a link is
 * absent.
 */
function renderItem(item: LogoStripItem, ctx: RenderContext): HtmlElement {
  return h(
    'li',
    { class: 'cg-logo-strip__item' },
    image(ctx, item.media, { className: 'cg-logo-strip__image', variant: { fit: 'contain' } }),
  )
}

export function renderLogoStrip(block: LogoStripBlock, ctx: RenderContext): HtmlElement {
  return h(
    'figure',
    { class: 'cg-block cg-logo-strip', 'data-block': 'logoStrip' },
    h(
      'ul',
      { class: 'cg-logo-strip__items' },
      block.logos.map((item) => renderItem(item, ctx)),
    ),
    block.caption === undefined
      ? null
      : h(
          'figcaption',
          { class: 'cg-logo-strip__caption', 'data-field': 'caption' },
          block.caption,
        ),
  )
}
