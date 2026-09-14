import type { MediaFigureBlock } from '@cogenta/blocks'
import { aspectRatio, type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { optionalText } from '../layout.js'

/**
 * A diagram, a screenshot or a photograph, in the hairline frame, with its
 * caption and credit under it in the secondary ink.
 *
 * `align` (contract B) places the frame: `wide` takes the whole container
 * (or the whole reading column on a documentation page), `center` the middle
 * eight columns, `start` and `end` eight columns on either side, and `full`
 * runs to the edges of the window, without a frame.
 *
 * `ratio` crops from the top edge, so an interface keeps its title bar; a
 * focal point set in the media library still wins.
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
    { class: 'cd-section cd-figure', 'data-block': 'mediaFigure', 'data-align': align },
    h(
      'figure',
      { class: 'cd-container cd-figure__inner' },
      h(
        'div',
        {
          class: align === 'full' ? 'cd-figure__media' : 'cd-figure__media cd-frame',
          style: ratio === undefined ? undefined : `aspect-ratio:${ratio}`,
          'data-ratio': ratio === undefined ? 'original' : 'fixed',
        },
        image(ctx, block.media, {
          className: 'cd-figure__image cd-frame__image',
          sizes: SIZES[align] ?? '100vw',
        }),
      ),
      hasCaption
        ? h(
            'figcaption',
            { class: 'cd-figure__caption' },
            optionalText('span', 'cd-figure__text', block.caption, { 'data-field': 'caption' }),
            optionalText('span', 'cd-figure__credit', block.credit, { 'data-field': 'credit' }),
          )
        : null,
    ),
  )
}
