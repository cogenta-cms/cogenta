import type { GalleryBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * Photographs from the text line to the right edge, square-cornered, with a
 * constant gutter:
 *
 * - `grid`: three to a row at 3:2, so a set reads as a contact sheet.
 * - `masonry`: two columns at each picture's own ratio, for a set shot in
 *   mixed orientations.
 * - `carousel`: one row that scrolls and snaps, focusable and labelled, with
 *   touch, trackpad and arrow keys all native. No script.
 */
export function renderGallery(block: GalleryBlock, ctx: RenderContext): HtmlElement {
  const sizes =
    block.layout === 'grid'
      ? '(min-width: 64rem) 20rem, (min-width: 40rem) 45vw, 100vw'
      : '(min-width: 64rem) 30rem, 80vw'
  const items = h(
    'ul',
    { class: 'cg-plates__items' },
    block.items.map((item) =>
      h(
        'li',
        { class: 'cg-plates__item' },
        image(ctx, item.media, { className: 'cg-plates__image', sizes }),
      ),
    ),
  )

  return section(
    'div',
    'gallery',
    'cg-plates',
    { 'data-layout': block.layout },
    'div',
    block.layout === 'carousel'
      ? h(
          'div',
          {
            class: 'cg-plates__viewport',
            role: 'region',
            'aria-label': ctx.t('gallery.carousel'),
            tabindex: '0',
          },
          items,
        )
      : items,
  )
}
