import type { MediaFigureBlock } from '@cogenta/blocks'
import { aspectRatio, type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * An image and its caption, placed on the grid by `align`.
 *
 * `wide` gives the image nine columns and sets the caption in the three to
 * its right, under a hairline, aligned to the image's foot, the way an
 * annual report places an exhibit and its note. `start` and `end` do the
 * same on a narrower image; `center` keeps the caption under the image;
 * `full` lets the image run the full width of the page. No frame, no shadow,
 * no rounded corner: the picture is the object.
 *
 * `<figure>`/`<figcaption>` keep the caption associated with the image for
 * assistive technology, which is why the figure is the grid container itself.
 */
export function renderMediaFigure(block: MediaFigureBlock, ctx: RenderContext): HtmlElement {
  const ratio = aspectRatio(block.ratio)
  const hasCaption = block.caption !== undefined || block.credit !== undefined
  return section(
    'div',
    'mediaFigure',
    'cg-figure',
    {
      'data-align': block.align ?? 'center',
      style: ratio === undefined ? undefined : `--cg-ratio:${ratio}`,
    },
    'figure',
    h(
      'div',
      { class: 'cg-figure__media' },
      image(ctx, block.media, {
        className: 'cg-figure__image',
        sizes: block.align === 'full' ? '100vw' : '(min-width: 64rem) 75vw, 100vw',
      }),
    ),
    hasCaption
      ? h(
          'figcaption',
          { class: 'cg-figure__caption' },
          block.caption === undefined
            ? null
            : h('span', { class: 'cg-figure__text', 'data-field': 'caption' }, block.caption),
          block.credit === undefined
            ? null
            : h('span', { class: 'cg-figure__credit', 'data-field': 'credit' }, block.credit),
        )
      : null,
  )
}
