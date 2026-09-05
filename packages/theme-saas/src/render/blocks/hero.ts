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
 * The hero carries the page's `h1` (contract B: `headingLevel: 'h1'`), so
 * `renderPage` relies on it to avoid emitting a second one.
 *
 * The Linear/Stripe/Vercel read: a left-aligned copy column (mono-caps
 * eyebrow pill, a big tight-tracked title, a subtitle, two actions) beside
 * a floating product-visual frame on wide screens. The mesh-gradient halos
 * behind the whole section are pure CSS (`.cg-hero::before`/`::after` in
 * `blocks.css`) — no image is required for the glow, so the halo still
 * shows even on a hero with no `media` set; `block.media` (when present) is
 * this theme's own version of the "product screenshot floating above the
 * fold" convention.
 */
export function renderHero(block: HeroBlock, ctx: RenderContext): HtmlElement {
  const tag = blockHeadingTag('hero') ?? 'h1'
  return h(
    'section',
    { class: 'cg-hero', 'data-block': 'hero' },
    h(
      'div',
      { class: 'cg-hero__copy' },
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
          { class: 'cg-hero__frame' },
          // The only image above the fold by construction, so the only one
          // that must not be lazy — a lazy-loaded LCP element is a measured
          // Lighthouse regression, not a theoretical one.
          image(ctx, block.media, {
            className: 'cg-hero__media',
            loading: 'eager',
            sizes: '(min-width: 64rem) 46vw, 100vw',
          }),
        ),
  )
}
