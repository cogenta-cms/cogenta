import type { MediaFigureBlock } from '@cogenta/blocks'
import { aspectRatio, type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * A photograph placed on the grid by its alignment, captioned the way a
 * book captions a plate: the caption in the interface face under the
 * picture, the credit after it in small capitals.
 *
 * - `start`: half the reading column, from the text line.
 * - `center` (the default): the reading column.
 * - `end`: half the reading column, ending on its right edge.
 * - `wide`: from the text line to the right edge of the grid.
 * - `full`: edge to edge, the caption returning to the text line.
 */
export function renderMediaFigure(block: MediaFigureBlock, ctx: RenderContext): HtmlElement {
  const ratio = aspectRatio(block.ratio)
  const hasCaption = block.caption !== undefined || block.credit !== undefined
  const align = block.align ?? 'center'
  return section(
    'div',
    'mediaFigure',
    'cg-plate',
    {
      'data-align': align,
      style: ratio === undefined ? undefined : `--cg-ratio:${ratio}`,
    },
    'figure',
    h(
      'div',
      { class: 'cg-plate__frame' },
      image(ctx, block.media, {
        className: 'cg-plate__image',
        sizes:
          align === 'full'
            ? '100vw'
            : align === 'wide'
              ? '(min-width: 64rem) 60rem, 100vw'
              : '(min-width: 64rem) 42rem, 100vw',
      }),
    ),
    hasCaption
      ? h(
          'figcaption',
          { class: 'cg-plate__caption' },
          block.caption === undefined
            ? null
            : h(
                'span',
                { class: 'cg-plate__caption-text', 'data-field': 'caption' },
                block.caption,
              ),
          block.credit === undefined
            ? null
            : h('span', { class: 'cg-plate__credit', 'data-field': 'credit' }, block.credit),
        )
      : null,
  )
}
