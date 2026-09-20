import type { LogoItem, LogosBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'

/**
 * Organisations credited by name, set as a ruled grid of marks in ink: up to
 * six to a row on a wide screen (`data-count`, never fewer than three columns,
 * so two marks do not stretch across the page), a hairline between each, the
 * marks reduced to
 * one tone so no brand colour competes with the page's single red.
 *
 * The organisation's name is contract B's own accessible name: the image
 * carries it as `alt` when the media entity has none, so a linked mark is
 * named without a hidden duplicate.
 */
function renderItem(item: LogoItem, ctx: RenderContext): HtmlElement {
  const mark = image(ctx, item.media, {
    className: 'cg-marks__image',
    altFrom: item.name,
    variant: { fit: 'contain' },
  })
  return h(
    'li',
    { class: 'cg-marks__item' },
    item.url === undefined
      ? mark
      : h(
          'a',
          {
            class: 'cg-marks__link',
            href: ctx.link(item.url),
            'aria-label': item.name,
            rel: 'noopener noreferrer',
          },
          mark,
        ),
  )
}

export function renderLogos(block: LogosBlock, ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'logos',
    'cg-marks',
    { 'data-count': String(Math.min(Math.max(block.items.length, 3), 6)) },
    'div',
    sectionHead('logos', block.title),
    h(
      'ul',
      { class: 'cg-marks__items' },
      block.items.map((item) => renderItem(item, ctx)),
    ),
  )
}
