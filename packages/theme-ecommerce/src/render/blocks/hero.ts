import type { HeroBlock } from '@cogenta/blocks'
import { actionList, type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { optionalText } from '../layout.js'

/**
 * The opening of a page: a sober headline on the grid, then the photograph
 * across the whole width of the window.
 *
 * The words sit above the picture rather than on it. Text laid over a
 * photograph needs a veil to stay legible on every picture an editor may
 * choose, and a veil over a product shot is exactly what dulls it; set on the
 * page's own ground, the headline is legible in both schemes whatever the
 * photograph, and the photograph stays as it was taken.
 *
 * Headline on the first seven columns; the subtitle and the actions on the
 * last four, aligned to the headline's last line. No badge, no shape behind
 * anything. Without media the block is the headline row alone.
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
      class: 'ce-section ce-hero',
      'data-block': 'hero',
      'data-media': block.media === undefined ? 'false' : 'true',
    },
    h(
      'div',
      { class: 'ce-container ce-hero__inner' },
      h(
        'div',
        { class: 'ce-hero__heading' },
        optionalText('p', 'ce-hero__eyebrow', block.eyebrow, { 'data-field': 'eyebrow' }),
        h('h1', { class: 'ce-hero__title', 'data-field': 'title' }, block.title),
      ),
      hasAside
        ? h(
            'div',
            { class: 'ce-hero__aside' },
            optionalText('p', 'ce-hero__subtitle', block.subtitle, { 'data-field': 'subtitle' }),
            actions,
          )
        : null,
    ),
    block.media === undefined
      ? null
      : h(
          'figure',
          { class: 'ce-hero__media' },
          image(ctx, block.media, {
            className: 'ce-hero__image',
            loading: 'eager',
            sizes: '100vw',
          }),
        ),
  )
}
