import type { LogoStripBlock, LogoStripItem } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * Where the writing has appeared: the caption set in small capitals in the
 * margin, the wordmarks in one line on the text line beside it, greyscale
 * and at a common height. A figure, because the caption names the whole row.
 */
function renderItem(item: LogoStripItem, ctx: RenderContext): HtmlElement {
  return h(
    'li',
    { class: 'cg-mentions__item' },
    image(ctx, item.media, { className: 'cg-mentions__logo', variant: { fit: 'contain' } }),
  )
}

export function renderLogoStrip(block: LogoStripBlock, ctx: RenderContext): HtmlElement {
  return section(
    'div',
    'logoStrip',
    'cg-mentions',
    {},
    'figure',
    block.caption === undefined
      ? null
      : h('figcaption', { class: 'cg-mentions__caption', 'data-field': 'caption' }, block.caption),
    h(
      'ul',
      { class: 'cg-mentions__items' },
      block.logos.map((item) => renderItem(item, ctx)),
    ),
  )
}
