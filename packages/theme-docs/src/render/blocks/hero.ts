import type { HeroBlock } from '@cogenta/blocks'
import {
  actionList,
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  image,
  type RenderContext,
  renderIcon,
} from '@cogenta/theme-kit'

/**
 * The hero carries the page's `h1` (contract B: `headingLevel: 'h1'`), so
 * `renderPage` relies on it to avoid emitting a second one.
 *
 * A reference-docs hero: copy on the left, a decorative search-looking
 * prompt right under the actions (purely presentational — `aria-hidden`,
 * no `<input>`, no `<form>` — this theme ships zero client JavaScript and a
 * fake control that looked operable would be a worse failure than no
 * control at all), and an optional small illustration on the right rather
 * than a full-bleed image wash, matching the information-dense register the
 * aesthetic direction asks for.
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
        : h('p', { class: 'cg-hero__eyebrow', 'data-field': 'eyebrow' }, block.eyebrow),
      heading(tag, { class: 'cg-hero__title', 'data-field': 'title' }, block.title),
      block.subtitle === undefined
        ? null
        : h('p', { class: 'cg-hero__subtitle', 'data-field': 'subtitle' }, block.subtitle),
      actionList(ctx, block.actions, ctx.t('hero.actions')),
      h(
        'div',
        { class: 'cg-hero__search', 'aria-hidden': 'true' },
        renderIcon('search', { className: 'cg-hero__search-icon' }),
        h('span', { class: 'cg-hero__search-text' }, 'Search the docs…'),
        h('kbd', { class: 'cg-hero__search-key' }, '/'),
      ),
    ),
    block.media === undefined
      ? null
      : h(
          'div',
          { class: 'cg-hero__panel' },
          image(ctx, block.media, {
            className: 'cg-hero__media',
            loading: 'eager',
            sizes: '(min-width: 64rem) 32vw, 100vw',
          }),
        ),
  )
}
