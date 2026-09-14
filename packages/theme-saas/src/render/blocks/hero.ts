import type { HeroBlock } from '@cogenta/blocks'
import { actionList, type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { optionalText } from '../layout.js'

/**
 * The opening of a page, left-aligned on the grid.
 *
 * An eyebrow, when there is one, is a line of Geist Mono above the title,
 * never a badge. The title is short and set large and tight on the first
 * nine columns; the subtitle sits under it on seven columns at the lead size;
 * the actions follow (one filled blue button for the primary intent, the rest
 * as underlined arrow links).
 *
 * The media is the product itself: a screenshot across all twelve columns,
 * framed by a single hairline with a hair of softening on the corners. No
 * shadow, no tilt, no floating shape behind it, no second picture beside it.
 * It is the one image of a page loaded eagerly: above the fold by
 * construction.
 *
 * Without media the hero is the opening of an inner page (pricing, security,
 * a company page): the same words at the page-title size, and nothing else.
 */
export function renderHero(block: HeroBlock, ctx: RenderContext): HtmlElement {
  const actions = actionList(ctx, block.actions, ctx.t('hero.actions'))

  return h(
    'section',
    {
      class: 'cs-section cs-hero',
      'data-block': 'hero',
      'data-media': block.media === undefined ? 'false' : 'true',
    },
    h(
      'div',
      { class: 'cs-container cs-hero__inner' },
      optionalText('p', 'cs-hero__eyebrow', block.eyebrow, { 'data-field': 'eyebrow' }),
      h('h1', { class: 'cs-hero__title', 'data-field': 'title' }, block.title),
      optionalText('p', 'cs-hero__subtitle', block.subtitle, { 'data-field': 'subtitle' }),
      actions === null ? null : h('div', { class: 'cs-hero__actions' }, actions),
      block.media === undefined
        ? null
        : h(
            'figure',
            { class: 'cs-hero__media cs-frame' },
            image(ctx, block.media, {
              className: 'cs-hero__image cs-frame__image',
              loading: 'eager',
              sizes: '(min-width: 80rem) 76rem, 100vw',
            }),
          ),
    ),
  )
}
