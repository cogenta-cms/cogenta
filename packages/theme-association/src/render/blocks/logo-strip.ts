import type { LogoStripBlock } from '@cogenta/blocks'
import { type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * The lighter row of marks: the caption at the caption size above a rule,
 * and the marks spread along one line under it, small and evenly spaced, in
 * one ink. No links, by contract B; each mark is named by its own alt text
 * from the media library.
 */
export function renderLogoStrip(block: LogoStripBlock, ctx: RenderContext): HtmlElement {
  return section(
    'div',
    'logoStrip',
    'ca-strip',
    { 'data-captioned': String(block.caption !== undefined) },
    'div',
    block.caption === undefined
      ? null
      : h('p', { class: 'ca-strip__caption', 'data-field': 'caption' }, block.caption),
    h(
      'ul',
      { class: 'ca-strip__items' },
      block.logos.map((logo) =>
        h(
          'li',
          { class: 'ca-strip__item' },
          image(ctx, logo.media, { className: 'ca-mark', sizes: '12rem' }),
        ),
      ),
    ),
  )
}
