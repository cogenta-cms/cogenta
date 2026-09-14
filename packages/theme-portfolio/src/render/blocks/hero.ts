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
 * The statement. `hero` carries the page's own `h1` (contract B), and on a
 * studio's home page that heading is what the studio says it does, set very
 * large in the display width across eleven columns. The eyebrow is a small
 * line above it in the text face, never a badge. The subtitle drops to the
 * right half of the grid, so the opening is asymmetric by construction; the
 * actions follow it as underlined words.
 *
 * A photograph or a film, when there is one, runs under the words across the
 * whole container at 16:9: the one image above the fold, loaded eagerly.
 */
export function renderHero(block: HeroBlock, ctx: RenderContext): HtmlElement {
  const tag = blockHeadingTag('hero') ?? 'h1'
  return section(
    'section',
    'hero',
    'cg-statement',
    { 'data-media': block.media === undefined ? 'none' : 'image' },
    'div',
    block.eyebrow === undefined
      ? null
      : h('p', { class: 'cg-statement__eyebrow', 'data-field': 'eyebrow' }, block.eyebrow),
    heading(tag, { class: 'cg-statement__title', 'data-field': 'title' }, block.title),
    block.subtitle === undefined && (block.actions === undefined || block.actions.length === 0)
      ? null
      : h(
          'div',
          { class: 'cg-statement__aside' },
          block.subtitle === undefined
            ? null
            : h('p', { class: 'cg-statement__subtitle', 'data-field': 'subtitle' }, block.subtitle),
          actionList(ctx, block.actions, ctx.t('hero.actions')),
        ),
    block.media === undefined
      ? null
      : h(
          'div',
          { class: 'cg-statement__media' },
          image(ctx, block.media, {
            className: 'cg-statement__image',
            loading: 'eager',
            sizes: '(min-width: 96rem) 92rem, 100vw',
          }),
        ),
  )
}
