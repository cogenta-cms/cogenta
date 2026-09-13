import type { HeroBlock } from '@cogenta/blocks'
import {
  actionList,
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  image,
  type RenderContext,
} from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * A typographic hero on the twelve-column grid.
 *
 * The title leads, set large in the display serif across ten columns. Below
 * it the page splits: the subtitle and the actions hold a narrow column on
 * the left, and the photograph takes the right-hand seven columns, cropped
 * frankly, with no frame, no shadow and no shape behind it. The eyebrow is
 * a line of small capitals after a short rule, never a pill.
 *
 * With no media the subtitle moves to the right half of the grid instead, so
 * a hero without a picture is still an asymmetric composition rather than a
 * column of centred text.
 *
 * The hero carries the page's `h1` (contract B: `headingLevel: 'h1'`), which
 * is why `renderPage` never adds a second one.
 */
export function renderHero(block: HeroBlock, ctx: RenderContext): HtmlElement {
  const tag = blockHeadingTag('hero') ?? 'h1'
  const actions = actionList(ctx, block.actions, ctx.t('hero.actions'))
  const hasAside = block.subtitle !== undefined || actions !== null
  return section(
    'section',
    'hero',
    'cg-hero',
    { 'data-media': block.media === undefined ? 'none' : 'present' },
    'div',
    h(
      'div',
      { class: 'cg-hero__intro' },
      block.eyebrow === undefined
        ? null
        : h('p', { class: 'cg-hero__eyebrow', 'data-field': 'eyebrow' }, block.eyebrow),
      heading(tag, { class: 'cg-hero__title', 'data-field': 'title' }, block.title),
    ),
    hasAside
      ? h(
          'div',
          { class: 'cg-hero__aside' },
          block.subtitle === undefined
            ? null
            : h('p', { class: 'cg-hero__subtitle', 'data-field': 'subtitle' }, block.subtitle),
          actions,
        )
      : null,
    block.media === undefined
      ? null
      : h(
          'div',
          { class: 'cg-hero__media' },
          // The only image above the fold by construction, so the only one
          // that must not be lazy: a lazy-loaded LCP element is a measured
          // Lighthouse regression.
          image(ctx, block.media, {
            className: 'cg-hero__image',
            loading: 'eager',
            sizes: '(min-width: 64rem) 56vw, 100vw',
          }),
        ),
  )
}
