import type { GalleryBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'

/**
 * A contact sheet: numbered frames (a CSS counter, drawn in the negative
 * space of the print corner) in a tight grid with hairline gutters, rather
 * than the reference theme's rounded, shadowed tiles.
 *
 * The carousel layout ships **no JavaScript** — a scroll-snapping, focusable,
 * labelled region gives keyboard, touch and trackpad scrolling for free
 * (WCAG 2.4.3/4.1.2), with none of a scripted carousel's failure modes.
 */
export function renderGallery(block: GalleryBlock, ctx: RenderContext): HtmlElement {
  const items = h(
    'ul',
    { class: 'cg-contactsheet__items' },
    block.items.map((item) =>
      h(
        'li',
        { class: 'cg-contactsheet__item' },
        image(ctx, item.media, { sizes: '(min-width: 45rem) 18rem, 50vw' }),
      ),
    ),
  )

  return h(
    'section',
    {
      class: 'cg-block cg-contactsheet',
      'data-block': 'gallery',
      'data-layout': block.layout,
    },
    block.layout === 'carousel'
      ? h(
          'div',
          {
            class: 'cg-contactsheet__viewport',
            role: 'region',
            'aria-label': ctx.t('gallery.carousel'),
            tabindex: '0',
          },
          items,
        )
      : items,
  )
}
