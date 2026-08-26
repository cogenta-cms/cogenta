import type { LogoStripBlock, LogoStripItem } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'

/**
 * `blocks@2.0` (RFC 0001). The lighter-weight "as used by" strip next to
 * `logos`'s own press row (`cg-press`, which titles itself and links each
 * mark to its organisation): `logoStrip` has no per-logo name or url, so it
 * carries no title and no links — a plain band of marks with an optional
 * caption set underneath, the way a colophon credits its supporters along
 * the bottom of a masthead page. Each image's own alt text (set once, in
 * the media library) is what names it, exactly as `logos` already falls
 * back to when a link is absent.
 */
function renderItem(item: LogoStripItem, ctx: RenderContext): HtmlElement {
  return h(
    'li',
    { class: 'cg-imprint__item' },
    image(ctx, item.media, { className: 'cg-imprint__image', variant: { fit: 'contain' } }),
  )
}

export function renderLogoStrip(block: LogoStripBlock, ctx: RenderContext): HtmlElement {
  return h(
    'figure',
    { class: 'cg-block cg-imprint', 'data-block': 'logoStrip' },
    h(
      'ul',
      { class: 'cg-imprint__items' },
      block.logos.map((item) => renderItem(item, ctx)),
    ),
    block.caption === undefined
      ? null
      : h('figcaption', { class: 'cg-imprint__caption', 'data-field': 'caption' }, block.caption),
  )
}
