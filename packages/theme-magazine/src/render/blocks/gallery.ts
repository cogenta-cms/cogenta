import type { GalleryBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * A picture page, square-cornered, with a constant gutter:
 *
 * - `grid`: the first photograph across eight columns, the next two stacked
 *   beside it, then rows of three at 3:2, the rhythm of a picture spread.
 * - `masonry`: three columns at each picture's own ratio.
 * - `carousel`: one row that scrolls and snaps, focusable and labelled; touch,
 *   trackpad and arrow keys are all native. No script.
 */
export function renderGallery(block: GalleryBlock, ctx: RenderContext): HtmlElement {
  const items = h(
    'ul',
    { class: 'cg-pictures__items', 'data-count': String(block.items.length) },
    block.items.map((item, index) =>
      h(
        'li',
        { class: 'cg-pictures__item' },
        image(ctx, item.media, {
          className: 'cg-pictures__image',
          sizes:
            block.layout === 'grid' && index === 0
              ? '(min-width: 64rem) 52rem, 100vw'
              : '(min-width: 64rem) 26rem, (min-width: 40rem) 45vw, 90vw',
        }),
      ),
    ),
  )

  return section(
    'div',
    'gallery',
    'cg-pictures',
    { 'data-layout': block.layout },
    'div',
    block.layout === 'carousel'
      ? h(
          'div',
          {
            class: 'cg-pictures__viewport',
            role: 'region',
            'aria-label': ctx.t('gallery.carousel'),
            tabindex: '0',
          },
          items,
        )
      : items,
  )
}
