import type { MediaFigureBlock } from '@cogenta/blocks'
import { aspectRatio, type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * A photograph placed on the grid by its alignment, captioned the way a
 * newspaper captions one: the caption in the interface face under the
 * picture and the credit after it in small capitals, both starting on the
 * picture's own left edge.
 *
 * - `center` (the default): the reading column.
 * - `start` / `end`: half the page, from the left or to the right.
 * - `wide`: ten columns, the width an article's lead photograph takes.
 * - `full`: edge to edge, the caption returning to the grid.
 */
export function renderMediaFigure(block: MediaFigureBlock, ctx: RenderContext): HtmlElement {
  const ratio = aspectRatio(block.ratio)
  const align = block.align ?? 'center'
  const hasCaption = block.caption !== undefined || block.credit !== undefined
  return section(
    'div',
    'mediaFigure',
    'cg-figure',
    {
      'data-align': align,
      style: ratio === undefined ? undefined : `--cg-ratio:${ratio}`,
    },
    'figure',
    h(
      'div',
      { class: 'cg-figure__frame' },
      image(ctx, block.media, {
        className: 'cg-figure__image',
        sizes:
          align === 'full'
            ? '100vw'
            : align === 'wide'
              ? '(min-width: 64rem) 66rem, 100vw'
              : '(min-width: 64rem) 40rem, 100vw',
      }),
    ),
    hasCaption
      ? h(
          'figcaption',
          { class: 'cg-figure__caption' },
          block.caption === undefined
            ? null
            : h(
                'span',
                { class: 'cg-figure__caption-text', 'data-field': 'caption' },
                block.caption,
              ),
          block.credit === undefined
            ? null
            : h('span', { class: 'cg-figure__credit', 'data-field': 'credit' }, block.credit),
        )
      : null,
  )
}
