import type { MediaFigureBlock } from '@cogenta/blocks'
import { aspectRatio, type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'

/**
 * `<figure>`/`<figcaption>` rather than a div and a paragraph: the
 * association between the picture and its caption is then in the markup.
 *
 * The media sits in a big rounded card (`cg-figure__media`, `--cg-radius-lg`)
 * with a soft shadow, matching the hero's own frame treatment rather than a
 * hard-edged photo.
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
            : h('span', { class: 'cg-figure__credit', 'data-field': 'credit' }, block.credit),
        )
      : null,
  )
}
