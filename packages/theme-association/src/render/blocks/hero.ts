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
 * The warm, community read this theme opens with: a rounded "eyebrow" pill
 * (the cause, not a generic label), a big friendly title in the display
 * face, and — when there is one — the media sitting in its own big rounded
 * card with a soft halo glow behind it (`cg-hero__halo`, purely decorative,
 * `aria-hidden`), rather than a hard-edged frame. Centred copy on mobile,
 * two columns from `md` up.
 */
export function renderHero(block: HeroBlock, ctx: RenderContext): HtmlElement {
  const tag = blockHeadingTag('hero') ?? 'h1'
  return h(
    'section',
    { class: 'cg-block cg-hero', 'data-block': 'hero' },
    h(
      'div',
      { class: 'cg-hero__copy' },
      block.eyebrow === undefined
        ? null
        : h(
            'p',
            { class: 'cg-hero__eyebrow', 'data-field': 'eyebrow' },
            h('span', { class: 'cg-pill' }, block.eyebrow),
          ),
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
          h('span', { class: 'cg-hero__halo', 'aria-hidden': 'true' }),
          // The only image above the fold by construction, so the only one
          // that must not be lazy — a lazy-loaded LCP element is a measured
          // Lighthouse regression, not a theoretical one.
          image(ctx, block.media, {
            className: 'cg-hero__media',
            loading: 'eager',
            sizes: '(min-width: 60rem) 44vw, 100vw',
          }),
        ),
  )
}
