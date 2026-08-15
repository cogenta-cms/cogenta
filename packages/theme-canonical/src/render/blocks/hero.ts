import type { HeroBlock } from '@cogenta/blocks'
import type { RenderContext } from '../../theme-contract.js'
import { actionList } from '../actions.js'
import { blockHeadingTag, heading } from '../heading.js'
import { type HtmlElement, h } from '../html.js'
import { image } from '../media.js'

/**
 * The hero carries the page's `h1` — contract B declares `headingLevel: 'h1'`
 * for it, and `renderPage` relies on that to avoid emitting a second one.
 *
 * The eyebrow is a paragraph, not a small heading: it labels the page, and
 * turning it into a heading would put an `h*` above the `h1` in the outline.
 */
export function renderHero(block: HeroBlock, ctx: RenderContext): HtmlElement {
  const tag = blockHeadingTag('hero') ?? 'h1'
  return h(
    'section',
    { class: 'cg-block cg-hero', 'data-block': 'hero' },
    h(
      'div',
      { class: 'cg-hero__body' },
      block.eyebrow === undefined
        ? null
        : h('p', { class: 'cg-hero__eyebrow', 'data-field': 'eyebrow' }, block.eyebrow),
      heading(tag, { class: 'cg-hero__title', 'data-field': 'title' }, block.title),
      block.subtitle === undefined
        ? null
        : h('p', { class: 'cg-hero__subtitle', 'data-field': 'subtitle' }, block.subtitle),
      actionList(ctx, block.actions, ctx.t('hero.actions')),
    ),
    block.media === undefined
      ? null
      : h(
          'div',
          { class: 'cg-hero__media' },
          // The only image on the page that is above the fold by construction,
          // so the only one that must not be lazy: lazy-loading the LCP element
          // is a measured Lighthouse regression, not a theoretical one.
          image(ctx, block.media, {
            loading: 'eager',
            sizes: '(min-width: 60rem) 50vw, 100vw',
          }),
        ),
  )
}
