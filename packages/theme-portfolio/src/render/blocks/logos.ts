import type { LogoItem, LogosBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'

/**
 * Marks of clients or partners, each on its own plate in a ruled grid, the
 * name under the plate in the caption size. The plate stays light in the dark
 * scheme, so a dark wordmark drawn for white paper is never lost on black.
 * The organisation's name is the image's accessible name when the media
 * entity has none, and a mark with a URL links it.
 */
function renderItem(item: LogoItem, ctx: RenderContext): HtmlElement {
  const mark = image(ctx, item.media, {
    className: 'cg-marks__image',
    altFrom: item.name,
    variant: { fit: 'contain' },
  })
  return h(
    'li',
    { class: 'cg-marks__item' },
    item.url === undefined
      ? h('div', { class: 'cg-marks__plate' }, mark)
      : h('a', { class: 'cg-marks__plate', href: item.url, rel: 'noopener noreferrer' }, mark),
    h('p', { class: 'cg-marks__name' }, item.name),
  )
}

export function renderLogos(block: LogosBlock, ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'logos',
    'cg-marks',
    { 'data-count': String(block.items.length) },
    'div',
    sectionHead('logos', block.title),
    h(
      'ul',
      { class: 'cg-marks__items' },
      block.items.map((item) => renderItem(item, ctx)),
    ),
  )
}
