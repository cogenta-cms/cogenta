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

/**
 * The storefront's opening statement — a split panel with the copy carrying
 * more visual weight than the picture, a badge-style eyebrow that reads like
 * a merchandising tag ("New season", "Limited drop"), and a primary action
 * cluster styled as the site's boldest button. The hero carries the page's
 * `h1` (contract B `headingLevel: 'h1'`), so `renderPage` never emits a
 * second one when this block is present.
 */
export function renderHero(block: HeroBlock, ctx: RenderContext): HtmlElement {
  const tag = blockHeadingTag('hero') ?? 'h1'
  return h(
    'section',
    { class: 'ce-block ce-hero', 'data-block': 'hero' },
    h(
      'div',
      { class: 'ce-hero__copy' },
      block.eyebrow === undefined
        ? null
        : h('p', { class: 'ce-hero__eyebrow', 'data-field': 'eyebrow' }, block.eyebrow),
      heading(tag, { class: 'ce-hero__title', 'data-field': 'title' }, block.title),
      block.subtitle === undefined
        ? null
        : h('p', { class: 'ce-hero__subtitle', 'data-field': 'subtitle' }, block.subtitle),
      actionList(ctx, block.actions, ctx.t('hero.actions')),
    ),
    block.media === undefined
      ? null
      : h(
          'div',
          { class: 'ce-hero__media' },
          // The only above-the-fold image on the page, so the only one that
          // must not be lazy — a lazy LCP element is a measured regression.
          image(ctx, block.media, {
            className: 'ce-hero__image',
            loading: 'eager',
            sizes: '(min-width: 64rem) 52vw, 100vw',
          }),
        ),
  )
}
