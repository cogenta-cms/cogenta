import type { GalleryBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'

/**
 * Ships **no JavaScript**. `layout: 'masonry'` (the dining-room gallery this
 * theme's own blueprint seeds) is a CSS multi-column flow — `column-count`
 * with `break-inside: avoid` on each tile — which needs no measurement pass
 * a script would otherwise have to do; `grid`/`carousel` keep the same
 * zero-JS scroll-snapping list every other layout in this theme uses.
 */
export function renderGallery(block: GalleryBlock, ctx: RenderContext): HtmlElement {
  const items = h(
    'ul',
    { class: 'cg-gallery__items' },
    block.items.map((item) =>
      h(
        'li',
        { class: 'cg-gallery__item' },
        image(ctx, item.media, { sizes: '(min-width: 48rem) 22rem, 60vw' }),
      ),
    ),
  )

  return h(
    'section',
    { class: 'cg-gallery', 'data-block': 'gallery', 'data-layout': block.layout },
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
