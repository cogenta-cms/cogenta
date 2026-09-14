import type { GalleryBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * The sequence of pictures a case study is made of. Every picture keeps its
 * own shape: a poster stays a poster, a spread stays a spread. The layout the
 * editor chose decides the rhythm:
 *
 * - `grid`: a sequence of three places on twelve columns, a large picture
 *   across seven columns beside a smaller one across five set to the same
 *   bottom line, then one across the whole container.
 * - `masonry`: two columns (three on a wide screen) at each picture's own
 *   shape.
 * - `carousel`: one row at a single height that scrolls and snaps, focusable
 *   and labelled; touch, trackpad and arrow keys are all native. No script.
 */
function sizesFor(layout: GalleryBlock['layout'], place: number): string {
  if (layout === 'carousel') return '(min-width: 64rem) 40rem, 80vw'
  if (layout === 'masonry') return '(min-width: 64rem) 30rem, 50vw'
  if (place === 3) return '(min-width: 96rem) 92rem, 100vw'
  return place === 1 ? '(min-width: 64rem) 54rem, 100vw' : '(min-width: 64rem) 38rem, 100vw'
}

export function renderGallery(block: GalleryBlock, ctx: RenderContext): HtmlElement {
  const items = h(
    'ul',
    { class: 'cg-pictures__items', 'data-count': String(block.items.length) },
    block.items.map((item, index) => {
      const place = (index % 3) + 1
      return h(
        'li',
        { class: 'cg-pictures__item', 'data-place': String(place) },
        image(ctx, item.media, {
          className: 'cg-pictures__image',
          sizes: sizesFor(block.layout, place),
        }),
      )
    }),
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
