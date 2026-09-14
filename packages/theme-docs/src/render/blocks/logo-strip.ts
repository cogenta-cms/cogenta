import type { LogoStripBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { optionalText, section } from '../layout.js'

/**
 * A strip of wordmarks ("Runs in production at"): the caption on its own
 * line above, then one row of marks at one height in grey, wrapping to three
 * and then two to a row on smaller screens. A hairline above separates the
 * strip from what precedes it.
 */
export function renderLogoStrip(block: LogoStripBlock, ctx: RenderContext): HtmlElement {
  return section(
    'div',
    'logoStrip',
    'cd-strip',
    { 'data-count': String(Math.min(block.logos.length, 6)) },
    'div',
    optionalText('p', 'cd-strip__caption', block.caption, { 'data-field': 'caption' }),
    h(
      'ul',
      { class: 'cd-strip__items' },
      block.logos.map((logo) =>
        h(
          'li',
          { class: 'cd-strip__item' },
          image(ctx, logo.media, { className: 'cd-strip__image cd-mark', sizes: '9rem' }),
        ),
      ),
    ),
  )
}
