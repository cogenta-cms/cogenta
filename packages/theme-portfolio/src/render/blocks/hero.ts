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
 * The hero carries the page's `h1` — contract B declares `headingLevel: 'h1'`
 * for it, and `renderPage` relies on that to avoid emitting a second one.
 *
 * Structurally distinct from a centred banner: the eyebrow becomes a running
 * index mark set in the mono register (`— eyebrow`), the title is a display
 * headline that overflows its own column on wide screens (`blocks.css` gives
 * it a fluid `clamp()`), and the media is offset into the title's own
 * negative margin rather than sitting in a tidy second column — the overlap
 * is what makes this a poster, not a slide.
 */
export function renderHero(block: HeroBlock, ctx: RenderContext): HtmlElement {
  const tag = blockHeadingTag('hero') ?? 'h1'
  return h(
    'section',
    { class: 'cg-block cg-hero', 'data-block': 'hero' },
    h(
      'div',
      { class: 'cg-hero__frame' },
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
            className: 'cg-hero__image',
            loading: 'eager',
            sizes: '(min-width: 64rem) 46vw, 100vw',
          }),
        ),
  )
}
