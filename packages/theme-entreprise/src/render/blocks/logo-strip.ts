import type { LogoStripBlock, LogoStripItem } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * `blocks@2.0` (RFC 0001). The lighter "selected clients" line under a hero:
 * the caption as a small-capital label in the left columns, then the marks
 * in one even row across the rest, in greyscale, between two hairlines.
 *
 * The `<figcaption>` comes first in the figure so the label reads before the
 * marks it introduces. No per-logo name or link: each image's own alt text
 * (set once, in the media library) names it.
 */
function renderItem(item: LogoStripItem, ctx: RenderContext): HtmlElement {
  return h(
    'li',
    { class: 'cg-logo-strip__item' },
    image(ctx, item.media, {
      className: 'cg-logo-strip__logo',
      variant: { fit: 'contain' },
      sizes: '12rem',
    }),
  )
}

export function renderLogoStrip(block: LogoStripBlock, ctx: RenderContext): HtmlElement {
  return section(
    'div',
    'logoStrip',
    'cg-logo-strip',
    { 'data-count': String(Math.min(block.logos.length, 8)) },
    'figure',
    block.caption === undefined
      ? null
      : h(
          'figcaption',
          { class: 'cg-logo-strip__caption', 'data-field': 'caption' },
          block.caption,
        ),
    h(
      'ul',
      { class: 'cg-logo-strip__items' },
      block.logos.map((item) => renderItem(item, ctx)),
    ),
  )
}
