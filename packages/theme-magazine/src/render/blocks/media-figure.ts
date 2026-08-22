import type { MediaFigureBlock } from '@cogenta/blocks'
import { aspectRatio, type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'

/**
 * A plate, in the print sense: the picture runs large, and the caption sits
 * under a hairline rule set in small caps with the credit line trailing it —
 * the way a photo essay is captioned, rather than a card with a paragraph
 * under it.
 *
 * `<figure>`/`<figcaption>` keep the caption announced as belonging to the
 * image; `align` stays a data attribute (contract B's intent, not a class),
 * so the skin — here, this theme — decides what `start`/`end`/`wide`/`full`
 * mean.
 */
export function renderMediaFigure(block: MediaFigureBlock, ctx: RenderContext): HtmlElement {
  const ratio = aspectRatio(block.ratio)
  const hasCaption = block.caption !== undefined || block.credit !== undefined
  return h(
    'figure',
    {
      class: 'cg-block cg-plate',
      'data-block': 'mediaFigure',
      'data-align': block.align ?? 'center',
      style: ratio === undefined ? undefined : `--cg-ratio:${ratio}`,
    },
    image(ctx, block.media, {
      className: 'cg-plate__media',
      sizes: '(min-width: 60rem) 48rem, 100vw',
    }),
    hasCaption
      ? h(
          'figcaption',
          { class: 'cg-plate__caption' },
          block.caption === undefined
            ? null
            : h('span', { class: 'cg-plate__text' }, block.caption),
          block.credit === undefined
            ? null
            : h('span', { class: 'cg-plate__credit', 'data-field': 'credit' }, block.credit),
        )
      : null,
  )
}
