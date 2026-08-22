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
 * The cover story. `hero` carries the page's own `h1` (contract B's
 * `headingLevel: 'h1'`), so this is the one place the masthead's front page
 * lives: an eyebrow set as a kicker, a big serif headline, a dek, and the
 * lead image on the other side of a hairline column rule — the two-column
 * "story well" a print front page opens on, rather than a centred banner.
 */
export function renderHero(block: HeroBlock, ctx: RenderContext): HtmlElement {
  const tag = blockHeadingTag('hero') ?? 'h1'
  return h(
    'section',
    { class: 'cg-block cg-hero', 'data-block': 'hero' },
    h(
      'div',
      { class: 'cg-hero__grid' },
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
            { class: 'cg-hero__media' },
            // The only image above the fold, so the only one loaded eagerly —
            // lazy-loading it is a measured LCP regression, not a theory.
            image(ctx, block.media, {
              className: 'cg-hero__image',
              loading: 'eager',
              sizes: '(min-width: 64rem) 56vw, 100vw',
            }),
          ),
    ),
  )
}
