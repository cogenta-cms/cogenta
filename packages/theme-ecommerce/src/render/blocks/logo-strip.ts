import type { LogoStripBlock, LogoStripItem } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'

/**
 * The lighter-weight "as seen in" / payment-method row: unlike `logos`, a
 * strip carries no per-logo name or link, so each mark is a plain image
 * whose accessible name lives on the media entity itself — exactly what
 * `logos.ts` already falls back to when a link is absent, just without the
 * link ever being an option here.
 */
function renderItem(item: LogoStripItem, ctx: RenderContext): HtmlElement {
  return h(
    'li',
    { class: 'ce-logo-strip__item' },
    image(ctx, item.media, {
      className: 'ce-logo-strip__image',
      variant: { fit: 'contain' },
    }),
  )
}

export function renderLogoStrip(block: LogoStripBlock, ctx: RenderContext): HtmlElement {
  return h(
    'figure',
    { class: 'ce-block ce-logo-strip', 'data-block': 'logoStrip' },
    h(
      'ul',
      { class: 'ce-logo-strip__items' },
      block.logos.map((item) => renderItem(item, ctx)),
    ),
    block.caption === undefined
      ? null
      : h(
          'figcaption',
          { class: 'ce-logo-strip__caption', 'data-field': 'caption' },
          block.caption,
        ),
  )
}
