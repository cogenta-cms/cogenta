import type { HeroBlock } from '@cogenta/blocks'
import { actionList, type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { optionalText } from '../layout.js'

/**
 * The opening of a page: the photograph of the room across the whole width
 * of the window, then the name of the place set large and light in the
 * display serif, on the page's own ground.
 *
 * The words sit under the picture, never on it. A headline laid over a
 * photograph needs a veil to stay legible on every picture an editor may
 * choose, and a veil over a dining room is exactly what makes it look like
 * every other restaurant template; set on the paper, the name is legible in
 * both schemes whatever the photograph, and the room stays as it was lit.
 *
 * Name on the first eight columns, its baseline shared with the subtitle and
 * the action on the last four. An eyebrow, when there is one, is a line of
 * small capitals above the name, never a badge. Without media the block is
 * the name row alone.
 *
 * The image is the only one on a page loaded eagerly: it is above the fold
 * by construction.
 */
export function renderHero(block: HeroBlock, ctx: RenderContext): HtmlElement {
  const actions = actionList(ctx, block.actions, ctx.t('hero.actions'))
  const hasAside = block.subtitle !== undefined || actions !== null

  return h(
    'section',
    {
      class: 'cr-section cr-hero',
      'data-block': 'hero',
      'data-media': block.media === undefined ? 'false' : 'true',
    },
    block.media === undefined
      ? null
      : h(
          'figure',
          { class: 'cr-hero__media' },
          image(ctx, block.media, {
            className: 'cr-hero__image',
            loading: 'eager',
            sizes: '100vw',
          }),
        ),
    h(
      'div',
      { class: 'cr-container cr-hero__inner' },
      h(
        'div',
        { class: 'cr-hero__heading' },
        optionalText('p', 'cr-hero__eyebrow', block.eyebrow, { 'data-field': 'eyebrow' }),
        h('h1', { class: 'cr-hero__title', 'data-field': 'title' }, block.title),
      ),
      hasAside
        ? h(
            'div',
            { class: 'cr-hero__aside' },
            optionalText('p', 'cr-hero__subtitle', block.subtitle, { 'data-field': 'subtitle' }),
            actions,
          )
        : null,
    ),
  )
}
