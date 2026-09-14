import type { LogoStripBlock, LogoStripItem } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * A line of credits: the caption in small capitals on the left three
 * columns, the marks in one tone along the rest of the row, between two
 * hairlines. `logoStrip` has no per-mark name or link, so each image's own
 * alt text (set once, in the media library) is what names it.
 */
function renderItem(item: LogoStripItem, ctx: RenderContext): HtmlElement {
  return h(
    'li',
    { class: 'cg-credits__item' },
    image(ctx, item.media, { className: 'cg-credits__image', variant: { fit: 'contain' } }),
  )
}

export function renderLogoStrip(block: LogoStripBlock, ctx: RenderContext): HtmlElement {
  return section(
    'div',
    'logoStrip',
    'cg-credits',
    {},
    'div',
    block.caption === undefined
      ? null
      : h('p', { class: 'cg-credits__caption', 'data-field': 'caption' }, block.caption),
    h(
      'ul',
      { class: 'cg-credits__items' },
      block.logos.map((item) => renderItem(item, ctx)),
    ),
  )
}
