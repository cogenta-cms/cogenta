import type { GalleryBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'

/**
 * A lookbook strip. Ships **no JavaScript**: `carousel` is a scroll-snapping
 * list, which gives touch swipe, trackpad scroll and — because the list is
 * focusable and labelled — arrow-key scrolling, with none of a scripted
 * carousel's failure modes (no auto-advance to fight, WCAG 2.2.2; no focus
 * stolen from an off-screen slide; it works before any hydration that never
 * happens here).
 *
 * A focusable scrollable region needs an accessible name or a screen reader
 * announces an unlabelled tab stop — WCAG 2.4.3 and 4.1.2 both.
 */
export function renderGallery(block: GalleryBlock, ctx: RenderContext): HtmlElement {
  const items = h(
    'ul',
    { class: 'ce-gallery__items' },
    block.items.map((item) =>
      h(
        'li',
        { class: 'ce-gallery__item' },
        image(ctx, item.media, {
          className: 'ce-gallery__image',
          sizes: '(min-width: 48rem) 22rem, 62vw',
        }),
      ),
    ),
  )

  return h(
    'section',
    {
      class: 'ce-block ce-gallery',
      'data-block': 'gallery',
      'data-layout': block.layout,
    },
    block.layout === 'carousel'
      ? h(
          'div',
          {
            class: 'ce-gallery__viewport',
            role: 'region',
            'aria-label': ctx.t('gallery.carousel'),
            tabindex: '0',
          },
          items,
        )
      : items,
  )
}
