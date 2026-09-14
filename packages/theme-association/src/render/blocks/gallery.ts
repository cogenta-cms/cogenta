import type { GalleryBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * Photographs of a year at the hall, in the three layouts contract B names:
 *
 * - `grid`: one picture takes the row at 16:9; two share it at 3:2; three
 *   make one large picture on the first eight columns with the other two
 *   stacked beside it; four make two rows of two at 3:2; five and more make
 *   rows of three at 4:3. No row is ever left with a gap in it.
 * - `masonry`: three columns of pictures at their own proportions.
 * - `carousel`: a row of 4:3 crops that scrolls sideways, with native scroll
 *   snapping. It is a focusable, labelled region so the row can be scrolled
 *   from the keyboard; no script drives it.
 */
export function renderGallery(block: GalleryBlock, ctx: RenderContext): HtmlElement {
  const count = block.items.length
  const items = block.items.map((item, index) =>
    h(
      'li',
      { class: 'ca-gallery__item' },
      image(ctx, item.media, {
        className: 'ca-gallery__image',
        sizes:
          block.layout === 'grid' && index === 0
            ? '(min-width: 64rem) 52vw, 100vw'
            : '(min-width: 64rem) 30vw, 80vw',
      }),
    ),
  )
  const list = h('ul', { class: 'ca-gallery__items' }, items)

  return section(
    'div',
    'gallery',
    'ca-gallery',
    { 'data-layout': block.layout, 'data-count': count >= 5 ? 'many' : String(count) },
    'div',
    block.layout === 'carousel'
      ? h(
          'div',
          {
            class: 'ca-gallery__viewport',
            role: 'region',
            'aria-label': ctx.t('gallery.carousel'),
            tabindex: '0',
          },
          list,
        )
      : list,
  )
}
