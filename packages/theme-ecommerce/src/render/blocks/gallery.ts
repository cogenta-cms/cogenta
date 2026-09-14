import type { GalleryBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * Photographs of the goods, in the three layouts contract B names:
 *
 * - `grid`: square crops, four across on a wide screen and two on a phone,
 *   the way a shop shows details of one object.
 * - `masonry`: three columns of pictures at their own proportions.
 * - `carousel`: a row of portrait crops that scrolls sideways, with native
 *   scroll snapping. It is a focusable, labelled region so the row can be
 *   scrolled from the keyboard; no script drives it.
 */
export function renderGallery(block: GalleryBlock, ctx: RenderContext): HtmlElement {
  const carousel = block.layout === 'carousel'
  const items = block.items.map((item) =>
    h(
      'li',
      { class: 'ce-gallery__item' },
      image(ctx, item.media, {
        className: 'ce-gallery__image',
        sizes:
          block.layout === 'grid'
            ? '(min-width: 64rem) 22vw, 50vw'
            : '(min-width: 64rem) 30vw, 80vw',
      }),
    ),
  )

  return section(
    'div',
    'gallery',
    'ce-gallery',
    { 'data-layout': block.layout },
    'div',
    carousel
      ? h(
          'div',
          {
            class: 'ce-gallery__viewport',
            role: 'region',
            'aria-label': ctx.t('gallery.carousel'),
            tabindex: '0',
          },
          h('ul', { class: 'ce-gallery__items' }, items),
        )
      : h('ul', { class: 'ce-gallery__items' }, items),
  )
}
