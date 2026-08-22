import type { MediaFigureBlock } from '@cogenta/blocks'
import { aspectRatio, type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'

/**
 * A single framed shot — a lookbook plate, a product-in-context photo — in a
 * card that matches the same aspect-ratio-and-shadow language the grid blocks
 * use, so a lone figure reads as part of the same catalogue rather than as a
 * different component. `<figure>`/`<figcaption>` keeps the caption announced
 * as belonging to the image, not as loose trailing text.
 *
 * `align` is a data attribute, never a class: contract B's `start`/`end`
 * mirror in right-to-left locales, and the skin decides what that means.
 */
export function renderMediaFigure(block: MediaFigureBlock, ctx: RenderContext): HtmlElement {
  const ratio = aspectRatio(block.ratio)
  const hasCaption = block.caption !== undefined || block.credit !== undefined
  return h(
    'figure',
    {
      class: 'ce-block ce-figure',
      'data-block': 'mediaFigure',
      'data-align': block.align ?? 'center',
      style: ratio === undefined ? undefined : `--ce-ratio:${ratio}`,
    },
    h(
      'div',
      { class: 'ce-figure__frame' },
      image(ctx, block.media, {
        className: 'ce-figure__media',
        sizes: '(min-width: 48rem) 42rem, 100vw',
      }),
    ),
    hasCaption
      ? h(
          'figcaption',
          { class: 'ce-figure__caption' },
          block.caption === undefined
            ? null
            : h('span', { class: 'ce-figure__caption-text' }, block.caption),
          block.credit === undefined
            ? null
            : h('span', { class: 'ce-figure__credit', 'data-field': 'credit' }, block.credit),
        )
      : null,
  )
}
