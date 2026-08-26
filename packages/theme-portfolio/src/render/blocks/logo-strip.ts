import type { LogoStripBlock, LogoStripItem } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'

/**
 * Lighter-weight than `logos` on purpose (RFC 0001): no per-mark `name`/
 * `url`, so no link, no accessible-name field to write, and no numbered
 * ledger row — this is the quieter "as seen in" strip, marks set edge to
 * edge with no dividers, desaturated exactly like `logos.ts`'s own marks
 * (the theme's one visual language for "a logo not currently in focus").
 * The image's own alt text (set once, in the media library) is what names
 * each mark, same as `logos.ts` falls back to when a link is absent — never
 * invented here, which is why `image` is called with no `altFrom`.
 */
function renderItem(item: LogoStripItem, ctx: RenderContext): HtmlElement {
  return h(
    'li',
    { class: 'cg-logostrip__item' },
    image(ctx, item.media, {
      className: 'cg-logostrip__image',
      variant: { fit: 'contain' },
    }),
  )
}

export function renderLogoStrip(block: LogoStripBlock, ctx: RenderContext): HtmlElement {
  return h(
    'figure',
    { class: 'cg-block cg-logostrip', 'data-block': 'logoStrip' },
    h(
      'ul',
      { class: 'cg-logostrip__items' },
      block.logos.map((item) => renderItem(item, ctx)),
    ),
    block.caption === undefined
      ? null
      : h('figcaption', { class: 'cg-logostrip__caption', 'data-field': 'caption' }, block.caption),
  )
}
