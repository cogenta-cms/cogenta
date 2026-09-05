import type { GalleryBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'

/** Ships no JavaScript: a scroll-snapping, focusable, labelled list gives touch/trackpad/arrow-key scrolling with none of a scripted carousel's failure modes. */
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
