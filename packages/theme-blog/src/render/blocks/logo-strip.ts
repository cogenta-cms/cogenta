import type { LogoStripBlock, LogoStripItem } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'

/** "As featured in" — a dense, full-colour press row, distinct from `logos`'s held-back-until-hovered client cards: a mention is a fact, not an invitation to click. */
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
