import type { MediaFigureBlock } from '@cogenta/blocks'
import { aspectRatio, type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * An image placed on the grid by its alignment, square-cornered, with a
 * small caption under it on the image's own left edge and the credit after
 * the caption. Alignment is how a case study gets its rhythm of large and
 * small pictures:
 *
 * - `center` (the default): columns 3 to 10.
 * - `start`: the first seven columns. `end`: the last seven.
 * - `wide`: the whole container.
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
              ? '(min-width: 96rem) 92rem, 100vw'
              : '(min-width: 64rem) 56rem, 100vw',
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
