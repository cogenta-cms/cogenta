import type { GalleryBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * A set of pictures, each in the hairline frame every screenshot of this
 * theme wears.
 *
 * - `grid`: two or three columns, every frame cropped to the same 16:10 so
 *   the rows stay level.
 * - `masonry`: three columns that keep each picture's own proportions.
 * - `carousel`: one row that scrolls sideways inside the container, with
 *   scroll snapping and no script; the list is named so a screen reader
 *   announces it as a scrollable group.
 */
export function renderGallery(block: GalleryBlock, ctx: RenderContext): HtmlElement {
  const carousel = block.layout === 'carousel'
  return section(
    'div',
    'gallery',
    'cs-gallery',
    { 'data-layout': block.layout, 'data-count': String(Math.min(block.items.length, 6)) },
    'div',
    h(
      'ul',
      {
        class: 'cs-gallery__items',
        ...(carousel ? { 'aria-label': ctx.t('gallery.carousel'), tabindex: 0 } : {}),
      },
      block.items.map((item) =>
        h(
          'li',
          { class: 'cs-gallery__item cs-frame' },
          image(ctx, item.media, {
            className: 'cs-gallery__image cs-frame__image',
            sizes: '(min-width: 64rem) 25rem, (min-width: 40rem) 50vw, 100vw',
          }),
        ),
      ),
    ),
  )
}
