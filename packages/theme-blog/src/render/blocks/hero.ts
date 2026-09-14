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
import { section } from '../layout.js'

/**
 * The featured essay, opened the way a printed feature opens: the kicker in
 * small capitals under a rule, the title set large across ten columns, then
 * the picture at 3:2 from the text line to the right edge, with the
 * standfirst and the way in waiting in the margin beside it.
 *
 * Without a picture the standfirst takes the text line under the title, so
 * the block never keeps an empty frame. The picture loads eagerly: this is
 * the one image above the fold.
 */
export function renderHero(block: HeroBlock, ctx: RenderContext): HtmlElement {
  const media =
    block.media === undefined
      ? null
      : h(
          'div',
          { class: 'cg-hero__media' },
          image(ctx, block.media, {
            className: 'cg-hero__image',
            loading: 'eager',
            sizes: '(min-width: 64rem) 60vw, 100vw',
          }),
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
    block.eyebrow === undefined
      ? null
      : h('p', { class: 'cg-hero__eyebrow', 'data-field': 'eyebrow' }, block.eyebrow),
    heading(
      blockHeadingTag('hero') ?? 'h1',
      { class: 'cg-hero__title', 'data-field': 'title' },
      block.title,
    ),
    aside,
    media,
  )
}
