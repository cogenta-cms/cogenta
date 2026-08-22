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
 * Structurally distinct from a centred/split "marketing" hero: the eyebrow,
 * title, subtitle and actions sit in a single left-aligned column with a
 * vertical accent rule (`cg-hero__mark`) standing beside the copy — the
 * "confident report cover" read the aesthetic direction asks for — while the
 * media sits in its own bordered frame with corner marks, never behind a
 * decorative gradient wash.
 */
export function renderHero(block: HeroBlock, ctx: RenderContext): HtmlElement {
  const tag = blockHeadingTag('hero') ?? 'h1'
  return h(
    'section',
    { class: 'cg-hero', 'data-block': 'hero' },
    h(
      'div',
      { class: 'cg-hero__intro' },
      h('span', { class: 'cg-hero__mark', 'aria-hidden': 'true' }),
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
