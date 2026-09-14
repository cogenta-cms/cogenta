import type { LogoStripBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { optionalText, section } from '../layout.js'

/**
 * The strip of customer wordmarks under a hero. The caption comes first, on
 * its own line above the marks (never under them, where it would collide with
 * the next section's title), then one row of up to six marks at one height,
 * three to a row on a tablet and two on a phone, all in the secondary ink.
 * A hairline above separates the strip from what precedes it.
 */
export function renderLogoStrip(block: LogoStripBlock, ctx: RenderContext): HtmlElement {
  return section(
    'div',
    'logoStrip',
    'cs-strip',
    { 'data-count': String(Math.min(block.logos.length, 6)) },
    'div',
    optionalText('p', 'cs-strip__caption', block.caption, { 'data-field': 'caption' }),
    h(
      'ul',
      { class: 'cs-strip__items' },
      block.logos.map((logo) =>
        h(
          'li',
          { class: 'cs-strip__item' },
          image(ctx, logo.media, { className: 'cs-strip__image cs-mark', sizes: '10rem' }),
        ),
      ),
    ),
  )
}
