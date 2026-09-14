import type { MediaFigureBlock } from '@cogenta/blocks'
import { aspectRatio, type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * A photograph and its caption, the caption always under the picture's own
 * left edge, in the text face, with the credit after it.
 *
 * `align` is an editorial intent, read as a layout:
 *
 * - `start` / `end`: seven columns on that side, the caption beside it on the
 *   other four, set against the bottom of the picture.
 * - `center`: eight columns, set in from the second.
 * - `wide` (and no value): the whole container.
 * - `full`: the whole window, edge to edge.
 *
 * The ratio crops from the middle, or from the media's own focal point; the
 * corners stay square and the picture casts no shadow.
 */
export function renderMediaFigure(block: MediaFigureBlock, ctx: RenderContext): HtmlElement {
  const align = block.align ?? 'wide'
  const split = align === 'start' || align === 'end'
  const ratio = aspectRatio(block.ratio)

  const caption =
    block.caption === undefined && block.credit === undefined
      ? null
      : h(
          'figcaption',
          { class: 'ca-figure__caption' },
          block.caption === undefined
            ? null
            : h('span', { class: 'ca-figure__text', 'data-field': 'caption' }, block.caption),
          block.credit === undefined
            ? null
            : h('span', { class: 'ca-figure__credit', 'data-field': 'credit' }, block.credit),
        )

  return section(
    'div',
    'mediaFigure',
    'ca-figure',
    { 'data-align': align, 'data-layout': split ? 'split' : 'single' },
    'figure',
    h(
      'div',
      {
        class: 'ca-figure__frame',
        style: ratio === undefined ? undefined : `aspect-ratio:${ratio}`,
      },
      image(ctx, block.media, {
        className: 'ca-figure__image',
        sizes:
          align === 'full'
            ? '100vw'
            : split
              ? '(min-width: 64rem) 55vw, 100vw'
              : '(min-width: 82rem) 78rem, 100vw',
      }),
    ),
    caption,
  )
}
