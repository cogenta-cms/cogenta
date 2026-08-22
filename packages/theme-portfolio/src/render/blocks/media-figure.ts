import type { MediaFigureBlock } from '@cogenta/blocks'
import { aspectRatio, type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'

/**
 * `<figure>`/`<figcaption>` rather than a div and a paragraph: the
 * association between the picture and its caption is then in the markup,
 * and a screen reader announces the caption as belonging to the image
 * instead of as loose text after it.
 *
 * The "Fig. 01" plate number that precedes the caption is drawn entirely
 * from a CSS counter (`counter-increment: cg-figure` in `blocks.css`) — it
 * is not stored data, so it renumbers itself as figures are added or
 * removed and never needs updating here.
 *
 * `align` is written as a data attribute, never as a class: contract B's
 * values are `start`/`end`, an intent that mirrors in right-to-left
 * locales, and the skin decides what it means.
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
          block.caption === undefined
            ? null
            : h('span', { class: 'cg-figure__plate' }, block.caption),
          block.credit === undefined
            ? null
            : h('span', { class: 'cg-figure__credit', 'data-field': 'credit' }, block.credit),
        )
      : null,
  )
}
