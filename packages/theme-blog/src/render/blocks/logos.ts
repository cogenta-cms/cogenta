import type { LogoItem, LogosBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'

/**
 * Publications, presses or institutions, as a ruled row of wordmarks: each
 * one in greyscale at a common height, inverted onto the ink in dark mode,
 * none of them louder than the text around them. The organisation's name is
 * the image's accessible name when the media library has none.
 */
function renderItem(item: LogoItem, ctx: RenderContext): HtmlElement {
  const logo = image(ctx, item.media, {
    className: 'cg-marks__logo',
    altFrom: item.name,
    variant: { fit: 'contain' },
  })
  return h(
    'li',
    { class: 'cg-marks__item' },
    item.url === undefined
      ? logo
      : h(
          'a',
          { class: 'cg-marks__link', href: ctx.link(item.url), rel: 'noopener noreferrer' },
          logo,
        ),
  )
}

export function renderLogos(block: LogosBlock, ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'logos',
    'cg-marks',
    {},
    'div',
    sectionHead('logos', block.title),
    h(
      'ul',
      { class: 'cg-marks__items' },
      block.items.map((item) => renderItem(item, ctx)),
    ),
  )
}
