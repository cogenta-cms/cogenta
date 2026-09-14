import type { GalleryBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * A set of screenshots or diagrams, each in the hairline frame.
 *
 * - `grid`: two or three columns, every frame cropped to the same 16:10 so
 *   the rows stay level.
 * - `masonry`: three columns that keep each picture's own proportions.
 * - `carousel`: one row that scrolls sideways inside the container, with
 *   scroll snapping and no script, named so a screen reader announces it as
 *   a scrollable group.
 */
export function renderGallery(block: GalleryBlock, ctx: RenderContext): HtmlElement {
  const carousel = block.layout === 'carousel'
  return section(
    'div',
    'gallery',
    'cd-gallery',
    { 'data-layout': block.layout, 'data-count': String(Math.min(block.items.length, 6)) },
    'div',
    h(
      'ul',
      {
        class: 'cd-gallery__items',
        ...(carousel
          ? { role: 'region', 'aria-label': ctx.t('gallery.carousel'), tabindex: 0 }
          : {}),
      },
      block.items.map((item) =>
        h(
          'li',
          { class: 'cd-gallery__item cd-frame' },
          image(ctx, item.media, {
            className: 'cd-gallery__image cd-frame__image',
            sizes: '(min-width: 64rem) 25rem, (min-width: 40rem) 50vw, 100vw',
          }),
        ),
      ),
    ),
  )
}
