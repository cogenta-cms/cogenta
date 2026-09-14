import type { LogoStripBlock, LogoStripItem } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * A line of marks between two hairlines: the caption in the first three
 * columns, the marks along the rest of the row at one height. `logoStrip`
 * carries no name per mark, so each image's own alt text (set once, in the
 * media library) names it. In the dark scheme the row sits on a light plate
 * for the same reason `logos` does.
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
    { 'data-captioned': block.caption === undefined ? 'false' : 'true' },
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
