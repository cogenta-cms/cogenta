import type { MediaFigureBlock } from '@cogenta/blocks'
import type { RenderContext } from '../../theme-contract.js'
import { type HtmlElement, h } from '../html.js'
import { aspectRatio, image } from '../media.js'

/**
 * `<figure>`/`<figcaption>` rather than a div and a paragraph: the association
 * between the picture and its caption is then in the markup, and a screen
 * reader announces the caption as belonging to the image instead of as loose
 * text after it.
 *
 * `align` is written as a data attribute, never as a class: contract B's values
 * are `start`/`end`, an intent that mirrors in right-to-left locales, and the
 * skin decides what it means.
 */
export function renderMediaFigure(block: MediaFigureBlock, ctx: RenderContext): HtmlElement {
  const ratio = aspectRatio(block.ratio)
  const hasCaption = block.caption !== undefined || block.credit !== undefined
  return h(
    'figure',
    {
      class: 'cg-block cg-figure',
      'data-block': 'mediaFigure',
      'data-align': block.align ?? 'center',
      style: ratio === undefined ? undefined : `--cg-ratio:${ratio}`,
    },
    image(ctx, block.media, {
      className: 'cg-figure__media',
      sizes: '(min-width: 45rem) 40rem, 100vw',
    }),
    hasCaption
      ? h(
          'figcaption',
          { class: 'cg-figure__caption' },
          block.caption,
          block.credit === undefined
            ? null
            : h('span', { class: 'cg-figure__credit' }, block.credit),
        )
      : null,
  )
}
