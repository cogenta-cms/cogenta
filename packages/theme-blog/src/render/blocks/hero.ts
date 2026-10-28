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
import { section, withAttributes } from '../layout.js'

/**
 * The lead story, set the way a magazine opens its front page: the picture
 * at the left taking seven columns, and a solid ink panel at the right with
 * the topic label (the block's eyebrow), the headline set large in the
 * condensed face, the standfirst (the subtitle) and the way in. Without a
 * picture the panel runs the full width, so the block never keeps an empty
 * frame. On a narrow screen the picture comes first and the panel under it.
 *
 * The picture is the largest paint of the page and is marked as such:
 * loaded eagerly, fetched with high priority, and never animated.
 */
export function renderHero(block: HeroBlock, ctx: RenderContext): HtmlElement {
  const media =
    block.media === undefined
      ? null
      : h(
          'div',
          { class: 'cg-hero__media' },
          withAttributes(
            image(ctx, block.media, {
              className: 'cg-hero__image',
              loading: 'eager',
              sizes: '(min-width: 80rem) 46rem, (min-width: 64rem) 58vw, 100vw',
            }),
            { fetchpriority: 'high' },
          ),
        )
  const aside =
    block.subtitle === undefined && (block.actions ?? []).length === 0
      ? null
      : h(
          'div',
          { class: 'cg-hero__aside' },
          block.subtitle === undefined
            ? null
            : h('p', { class: 'cg-hero__subtitle', 'data-field': 'subtitle' }, block.subtitle),
          actionList(ctx, block.actions, ctx.t('hero.actions')),
        )

  return section(
    'section',
    'hero',
    'cg-hero',
    { 'data-media': media === null ? 'none' : 'present' },
    'div',
    media,
    h(
      'div',
      { class: 'cg-hero__panel' },
      block.eyebrow === undefined
        ? null
        : h('p', { class: 'cg-hero__eyebrow cg-label', 'data-field': 'eyebrow' }, block.eyebrow),
      heading(
        blockHeadingTag('hero') ?? 'h1',
        { class: 'cg-hero__title', 'data-field': 'title' },
        block.title,
      ),
      aside,
    ),
  )
}
