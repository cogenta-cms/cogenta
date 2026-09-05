import type { GalleryBlock } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext, renderImageSource } from '@cogenta/theme-kit'

/**
 * A lookbook strip — and, when every item's own picture carries a real alt
 * text, a set of category tiles: contract B's `gallery` item has no caption
 * field of its own (only `media`), so the label a shopper reads on the tile
 * *is* the picture's accessible name, resolved once through `ctx.image` and
 * placed a second time, visibly, in a flat solid band over the image rather
 * than only in the `alt` attribute a sighted visitor never sees. An item
 * whose media has no alt text (`alt: ""`, a decorative image) renders with
 * no band at all — never an empty caption.
 *
 * Ships **no JavaScript**: `carousel` is a scroll-snapping list, which gives
 * touch swipe, trackpad scroll and — because the list is focusable and
 * labelled — arrow-key scrolling, with none of a scripted carousel's failure
 * modes (no auto-advance to fight, WCAG 2.2.2; no focus stolen from an
 * off-screen slide; it works before any hydration that never happens here).
 *
 * A focusable scrollable region needs an accessible name or a screen reader
 * announces an unlabelled tab stop — WCAG 2.4.3 and 4.1.2 both.
 */
export function renderGallery(block: GalleryBlock, ctx: RenderContext): HtmlElement {
  const items = h(
    'ul',
    { class: 'ce-gallery__items' },
    block.items.map((item) => {
      const source = ctx.image(item.media)
      return h(
        'li',
        { class: 'ce-gallery__item' },
        renderImageSource(source, {
          className: 'ce-gallery__image',
          sizes: '(min-width: 48rem) 22rem, 62vw',
        }),
        source.alt === ''
          ? null
          : h('span', { class: 'ce-gallery__caption', 'aria-hidden': 'true' }, source.alt),
      )
    }),
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
