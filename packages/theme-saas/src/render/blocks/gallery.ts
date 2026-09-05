import type { GalleryBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'

/**
 * Ships **no JavaScript**. A scroll-snapping list gives touch swiping,
 * trackpad scrolling and — because the list is focusable and labelled —
 * arrow-key scrolling, with none of the failure modes of a scripted
 * carousel: no auto-advance to fight (WCAG 2.2.2), no focus stolen from an
 * off-screen slide, and it still works before any styling loads.
 *
 * Each tile is a thin-bordered plate rather than a shadowed, fully-rounded
 * card — consistent with the framed treatment `mediaFigure` and `embed`
 * use, so a page mixing all three reads as one system.
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
    {
      class: 'cg-gallery',
      'data-block': 'gallery',
      'data-layout': block.layout,
    },
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
