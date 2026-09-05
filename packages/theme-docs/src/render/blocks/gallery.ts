import type { GalleryBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'

/**
 * The carousel ships **no JavaScript**. It is a scroll-snapping list, which
 * gives touch swiping, trackpad scrolling and — because the list is
 * focusable and labelled — arrow-key scrolling, with none of the failure
 * modes of a scripted carousel.
 */
export function renderGallery(block: GalleryBlock, ctx: RenderContext): HtmlElement {
  const items = h(
    'ul',
    { class: 'cg-gallery__items' },
    block.items.map((item) =>
      h(
        'li',
        { class: 'cg-gallery__item' },
        image(ctx, item.media, { sizes: '(min-width: 45rem) 20rem, 60vw' }),
      ),
    ),
  )

  return h(
    'section',
    { class: 'cg-block cg-gallery', 'data-block': 'gallery', 'data-layout': block.layout },
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
