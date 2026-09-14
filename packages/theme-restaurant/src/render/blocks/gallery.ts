import type { GalleryBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * Photographs of plates and of the room, in the three layouts contract B
 * names:
 *
 * - `grid`: a band of dish photographs, every one cropped to the same 4:5
 *   portrait, four across on a wide screen (three when the count divides by
 *   three, so a row is never left with one picture), two on a phone.
 * - `masonry`: three columns of pictures at their own proportions.
 * - `carousel`: a row of 4:5 crops that scrolls sideways, with native scroll
 *   snapping. It is a focusable, labelled region so the row can be scrolled
 *   from the keyboard; no script drives it.
 */
function columnsFor(count: number): number {
  if (count <= 2) return count
  return count % 3 === 0 ? 3 : 4
}

export function renderGallery(block: GalleryBlock, ctx: RenderContext): HtmlElement {
  const carousel = block.layout === 'carousel'
  const columns = columnsFor(block.items.length)
  const items = block.items.map((item) =>
    h(
      'li',
      { class: 'cr-gallery__item' },
      image(ctx, item.media, {
        className: 'cr-gallery__image',
        sizes:
          block.layout === 'grid'
            ? `(min-width: 64rem) ${Math.round(90 / Math.max(columns, 1))}vw, 50vw`
            : '(min-width: 64rem) 30vw, 80vw',
      }),
    ),
  )

  return section(
    'div',
    'gallery',
    'cr-gallery',
    { 'data-layout': block.layout, 'data-columns': String(columns) },
    'div',
    carousel
      ? h(
          'div',
          {
            class: 'cr-gallery__viewport',
            role: 'region',
            'aria-label': ctx.t('gallery.carousel'),
            tabindex: '0',
          },
          h('ul', { class: 'cr-gallery__items' }, items),
        )
      : h('ul', { class: 'cr-gallery__items' }, items),
  )
}
