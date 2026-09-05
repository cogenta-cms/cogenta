import type { MediaFigureBlock } from '@cogenta/blocks'
import { aspectRatio, type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'

/** A framed plate with a small serif caption underneath — the same "printed photograph" language the hero's own frame uses. */
export function renderMediaFigure(block: MediaFigureBlock, ctx: RenderContext): HtmlElement {
  const ratio = aspectRatio(block.ratio)
  const hasCaption = block.caption !== undefined || block.credit !== undefined
  return h(
    'figure',
    {
      class: 'cg-figure',
      'data-block': 'mediaFigure',
      'data-align': block.align ?? 'center',
      style: ratio === undefined ? undefined : `--cg-ratio:${ratio}`,
    },
    h(
      'div',
      { class: 'cg-figure__frame' },
      image(ctx, block.media, {
        className: 'cg-figure__media',
        sizes: '(min-width: 48rem) 42rem, 100vw',
      }),
    ),
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
