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
 * The featured post — a magazine cover, not a marketing banner. The cover
 * image sits above the copy on a narrow screen (the physical cover-then-
 * standfirst reading order a print magazine uses) and beside it, framed and
 * slightly inset, from `min-width: 56rem`. The "Featured" eyebrow carries a
 * small accent rule rather than a pill, matching the understated masthead
 * language the rest of this theme uses.
 */
export function renderHero(block: HeroBlock, ctx: RenderContext): HtmlElement {
  const tag = blockHeadingTag('hero') ?? 'h1'
  return h(
    'section',
    { class: 'cg-hero', 'data-block': 'hero' },
    block.media === undefined
      ? null
      : h(
          'div',
          { class: 'cg-hero__frame' },
          image(ctx, block.media, {
            className: 'cg-hero__media',
            loading: 'eager',
            sizes: '(min-width: 56rem) 46vw, 100vw',
          }),
        ),
    h(
      'div',
      { class: 'cg-hero__copy' },
      block.eyebrow === undefined
        ? null
        : h(
            'p',
            { class: 'cg-hero__eyebrow', 'data-field': 'eyebrow' },
            h('span', { class: 'cg-hero__eyebrow-rule', 'aria-hidden': 'true' }),
            block.eyebrow,
          ),
      heading(tag, { class: 'cg-hero__title', 'data-field': 'title' }, block.title),
      block.subtitle === undefined
        ? null
        : h('p', { class: 'cg-hero__subtitle', 'data-field': 'subtitle' }, block.subtitle),
      actionList(ctx, block.actions, ctx.t('hero.actions')),
    ),
  )
}
