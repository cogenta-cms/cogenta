import type { MediaFigureBlock } from '@cogenta/blocks'
import { aspectRatio, type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'

/**
 * A thin hairline frame around the image, a small italic caption beneath —
 * the restrained, "printed menu insert" treatment consistent with this
 * theme's gallery and embed placeholder.
 */
export function renderMediaFigure(block: MediaFigureBlock, ctx: RenderContext): HtmlElement {
  const ratio = aspectRatio(block.ratio)
  const hasCaption = block.caption !== undefined || block.credit !== undefined
  return h(
    'figure',
    {
      class: 'cg-plate',
      'data-block': 'mediaFigure',
      'data-align': block.align ?? 'center',
      style: ratio === undefined ? undefined : `--cg-ratio:${ratio}`,
    },
    h(
      'div',
      { class: 'cg-plate__frame' },
      image(ctx, block.media, {
        className: 'cg-plate__media',
        sizes: '(min-width: 48rem) 42rem, 100vw',
      }),
    ),
    hasCaption
      ? h(
          'figcaption',
          { class: 'cg-plate__caption' },
          block.caption,
          block.credit === undefined
            ? null
            : h('span', { class: 'cg-plate__credit', 'data-field': 'credit' }, block.credit),
        )
      : null,
  )
}
