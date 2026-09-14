import type { MediaFigureBlock } from '@cogenta/blocks'
import { aspectRatio, type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { optionalText } from '../layout.js'

/**
 * A picture of the product, or of anything else an editor places: framed by
 * the same single hairline as the hero screenshot, with its caption and
 * credit under it on the grid.
 *
 * `align` (contract B) places the frame on the twelve columns: `wide` takes
 * all twelve, `center` the middle eight, `start` the first eight and `end`
 * the last eight (so a sequence of figures can alternate sides), and `full`
 * runs past the container to the edges of the window, without a frame.
 *
 * `ratio` crops the picture from its top edge: a screenshot keeps its title
 * bar and loses its bottom rows, which is how a crop of an interface is read.
 * A focal point set in the media library still wins.
 */
const SIZES: Readonly<Record<string, string>> = {
  full: '100vw',
  wide: '(min-width: 80rem) 76rem, 100vw',
  center: '(min-width: 64rem) 50rem, 100vw',
  start: '(min-width: 64rem) 50rem, 100vw',
  end: '(min-width: 64rem) 50rem, 100vw',
}

export function renderMediaFigure(block: MediaFigureBlock, ctx: RenderContext): HtmlElement {
  const align = block.align ?? 'wide'
  const ratio = aspectRatio(block.ratio)
  const hasCaption = block.caption !== undefined || block.credit !== undefined

  return h(
    'div',
    { class: 'cs-section cs-figure', 'data-block': 'mediaFigure', 'data-align': align },
    h(
      'figure',
      { class: 'cs-container cs-figure__inner' },
      h(
        'div',
        {
          class: align === 'full' ? 'cs-figure__media' : 'cs-figure__media cs-frame',
          style: ratio === undefined ? undefined : `aspect-ratio:${ratio}`,
          'data-ratio': ratio === undefined ? 'original' : 'fixed',
        },
        image(ctx, block.media, {
          className: 'cs-figure__image cs-frame__image',
          sizes: SIZES[align] ?? '100vw',
        }),
      ),
      hasCaption
        ? h(
            'figcaption',
            { class: 'cs-figure__caption' },
            optionalText('span', 'cs-figure__text', block.caption, { 'data-field': 'caption' }),
            optionalText('span', 'cs-figure__credit', block.credit, { 'data-field': 'credit' }),
          )
        : null,
    ),
  )
}
