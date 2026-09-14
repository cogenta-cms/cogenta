import type { HeroBlock } from '@cogenta/blocks'
import { actionList, type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { optionalText } from '../layout.js'

/**
 * The opening of a page: a photograph of the people the organisation works
 * with, across the whole width of the window, and the statement of the cause
 * set large on a sheet of the page's own paper that starts at the window's
 * left edge and rises into the bottom of the photograph.
 *
 * On a wide screen the sheet holds the eyebrow and the statement on the first
 * seven columns; the subtitle and the actions sit under the photograph on
 * the last four, starting where the photograph ends, so the two halves of the
 * opening read as one composition rather than a box with a hole beside it.
 *
 * The words are never laid over the picture. A headline floated in the middle
 * of a dimmed photograph needs a veil to stay legible on every picture an
 * editor may choose, and that veil is the look of every generated charity
 * template; on the paper the statement is legible in both schemes whatever
 * the photograph, and the faces keep their own light.
 *
 * The first action is the donation ask, drawn in the signal yellow; the
 * others are underlined words. An eyebrow, when there is one, is a short line
 * in the organisation's green, never a badge. Without media the block is the
 * sheet alone.
 *
 * The image is the only one on a page loaded eagerly: it is above the fold
 * by construction.
 */
export function renderHero(block: HeroBlock, ctx: RenderContext): HtmlElement {
  const hasMedia = block.media !== undefined
  const actions = actionList(ctx, block.actions, ctx.t('hero.actions'))
  const hasAside = block.subtitle !== undefined || actions !== null
  return h(
    'section',
    {
      class: 'ca-section ca-hero ca-ask',
      'data-block': 'hero',
      'data-media': String(hasMedia),
    },
    block.media === undefined
      ? null
      : h(
          'figure',
          { class: 'ca-hero__media' },
          image(ctx, block.media, {
            className: 'ca-hero__image',
            loading: 'eager',
            sizes: '100vw',
          }),
        ),
    h(
      'div',
      { class: 'ca-container ca-hero__inner' },
      h(
        'div',
        { class: 'ca-hero__panel' },
        optionalText('p', 'ca-kicker ca-hero__eyebrow', block.eyebrow, {
          'data-field': 'eyebrow',
        }),
        h('h1', { class: 'ca-hero__title', 'data-field': 'title' }, block.title),
      ),
      hasAside
        ? h(
            'div',
            { class: 'ca-hero__aside' },
            optionalText('p', 'ca-hero__subtitle', block.subtitle, { 'data-field': 'subtitle' }),
            actions,
          )
        : null,
    ),
  )
}
