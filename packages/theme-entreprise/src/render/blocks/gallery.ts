import type { GalleryBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * Photographs on the grid, with no frames and no rounded plates.
 *
 * `grid` crops every picture to the same 4:3 ratio in rows of three (two for
 * a pair), so a set reads as a considered series. `masonry` keeps each
 * picture's own proportions in three flowing columns. `carousel` is a
 * scroll-snapping row: touch, trackpad and arrow keys all work because the
 * list is focusable and labelled, with no JavaScript, no auto-advance
 * (WCAG 2.2.2) and no focus stolen from an off-screen slide.
 */
export function renderGallery(block: GalleryBlock, ctx: RenderContext): HtmlElement {
  const items = h(
    'ul',
    {
      class: 'cg-gallery__items',
      'data-count': String(Math.min(block.items.length, 6)),
    },
    block.items.map((item) =>
      h(
        'li',
        { class: 'cg-gallery__item' },
        image(ctx, item.media, {
          className: 'cg-gallery__image',
          sizes: '(min-width: 64rem) 30vw, (min-width: 40rem) 45vw, 85vw',
        }),
      ),
    ),
  )

  return section(
    'section',
    'gallery',
    'cg-gallery',
    { 'data-layout': block.layout },
    'div',
    block.layout === 'carousel'
      ? h(
          'div',
          {
            class: 'cg-gallery__viewport',
            role: 'region',
            'aria-label': ctx.t('gallery.carousel'),
            tabindex: '0',
          },
          items,
        )
      : items,
  )
}
