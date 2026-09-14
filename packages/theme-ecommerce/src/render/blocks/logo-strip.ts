import type { LogoStripBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * The lighter row of marks: the caption at the caption size on the first
 * three columns, the marks spread along one line across the rest, small and
 * evenly spaced. No links, by contract B; each mark is named by its own alt
 * text from the media library.
 */
export function renderLogoStrip(block: LogoStripBlock, ctx: RenderContext): HtmlElement {
  return section(
    'div',
    'logoStrip',
    'ce-strip',
    { 'data-captioned': String(block.caption !== undefined) },
    'div',
    block.caption === undefined
      ? null
      : h('p', { class: 'ce-strip__caption', 'data-field': 'caption' }, block.caption),
    h(
      'ul',
      { class: 'ce-strip__items' },
      block.logos.map((logo) =>
        h(
          'li',
          { class: 'ce-strip__item' },
          h(
            'span',
            { class: 'ce-marks__plate' },
            image(ctx, logo.media, { className: 'ce-marks__image', sizes: '10rem' }),
          ),
        ),
      ),
    ),
  )
}
