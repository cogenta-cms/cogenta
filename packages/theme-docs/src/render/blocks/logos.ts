import type { LogosBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'

/**
 * Named organisations (the companies running the product, the platforms it
 * integrates with) as a ruled grid: hairlines between cells, each wordmark in
 * grey at one height, linked when the block gives an address. The
 * organisation's name is the image's accessible name when the media library
 * has no alt text.
 *
 * Wordmarks are shown in grey in light and inverted in dark, so a logo drawn
 * in dark ink stays legible on the dark ground.
 */
export function renderLogos(block: LogosBlock, ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'logos',
    'cd-logos',
    { 'data-count': String(Math.min(block.items.length, 6)) },
    'div',
    sectionHead('logos', block.title),
    h(
      'ul',
      { class: 'cd-logos__items' },
      block.items.map((item) => {
        const mark = image(ctx, item.media, {
          className: 'cd-logos__image cd-mark',
          altFrom: item.name,
          sizes: '10rem',
        })
        return h(
          'li',
          { class: 'cd-logos__item' },
          item.url === undefined
            ? mark
            : h(
                'a',
                {
                  class: 'cd-logos__link',
                  href: ctx.link(item.url),
                  'aria-label': item.name,
                  rel: 'noopener',
                },
                mark,
              ),
        )
      }),
    ),
  )
}
