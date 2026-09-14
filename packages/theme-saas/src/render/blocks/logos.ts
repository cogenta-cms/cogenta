import type { LogosBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'

/**
 * Named organisations (customers, auditors, partners) as a ruled grid:
 * hairlines between cells, each wordmark set in the secondary ink at one
 * height, and linked when the block gives an address. The organisation's
 * name is the image's accessible name when the media library has no alt text.
 *
 * Wordmarks are shown in grey in the light scheme and inverted in the dark
 * one, so a logo drawn in dark ink for paper stays legible on the dark
 * ground.
 */
export function renderLogos(block: LogosBlock, ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'logos',
    'cs-logos',
    { 'data-count': String(Math.min(block.items.length, 8)) },
    'div',
    sectionHead('logos', block.title),
    h(
      'ul',
      { class: 'cs-logos__items' },
      block.items.map((item) => {
        const mark = image(ctx, item.media, {
          className: 'cs-logos__image cs-mark',
          altFrom: item.name,
          sizes: '12rem',
        })
        return h(
          'li',
          { class: 'cs-logos__item' },
          item.url === undefined
            ? mark
            : h('a', { class: 'cs-logos__link', href: ctx.link(item.url), rel: 'noopener' }, mark),
        )
      }),
    ),
  )
}
