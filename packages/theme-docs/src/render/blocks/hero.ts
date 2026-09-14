import type { HeroBlock } from '@cogenta/blocks'
import { actionList, type HtmlElement, h, image, type RenderContext } from '@cogenta/theme-kit'
import { optionalText } from '../layout.js'
import { renderSearchForm } from '../search.js'

/**
 * The opening of a documentation site: a clear statement and the search.
 *
 * Left-aligned on the grid, never centred. An eyebrow, when there is one, is
 * a quiet line above the title (a product and its version), never a badge.
 * The title is short and set large on the first eight columns, the subtitle
 * says in two sentences what the documentation covers, and under it the
 * search field at its large size: a real `GET /search` form, the first thing
 * a reader of documentation reaches for. The actions follow, the primary one
 * as the small teal control and the rest as underlined arrow links.
 *
 * Media, when an editor adds one, is a diagram or a screenshot on the last
 * five columns in the hairline frame, loaded eagerly: it is above the fold by
 * construction. Nothing decorative stands in for it when there is none.
 */
export function renderHero(block: HeroBlock, ctx: RenderContext): HtmlElement {
  const actions = actionList(ctx, block.actions, ctx.t('hero.actions'))
  const media = block.media !== undefined

  return h(
    'section',
    { class: 'cd-section cd-hero', 'data-block': 'hero', 'data-media': media ? 'true' : 'false' },
    h(
      'div',
      { class: 'cd-container cd-hero__inner' },
      h(
        'div',
        { class: 'cd-hero__copy' },
        optionalText('p', 'cd-hero__eyebrow', block.eyebrow, { 'data-field': 'eyebrow' }),
        h('h1', { class: 'cd-hero__title', 'data-field': 'title' }, block.title),
        optionalText('p', 'cd-hero__subtitle', block.subtitle, { 'data-field': 'subtitle' }),
        h(
          'div',
          { class: 'cd-hero__search' },
          renderSearchForm(ctx.locale, 'cd-search-hero', 'large'),
        ),
        actions === null ? null : h('div', { class: 'cd-hero__actions' }, actions),
      ),
      block.media === undefined
        ? null
        : h(
            'figure',
            { class: 'cd-hero__media cd-frame' },
            image(ctx, block.media, {
              className: 'cd-hero__image cd-frame__image',
              loading: 'eager',
              sizes: '(min-width: 64rem) 30rem, 100vw',
            }),
          ),
    ),
  )
}
