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
 * A cover story. `hero` carries the page's own `h1` (contract B), so it is
 * set as the opening of a special issue: the eyebrow as a red kicker, the
 * headline in the display face at its largest, the subtitle as an italic
 * standfirst, and the photograph beside the words across seven columns,
 * its bottom edge on the same line as the last action. Without a photograph
 * the headline takes ten columns over a double rule.
 */
export function renderHero(block: HeroBlock, ctx: RenderContext): HtmlElement {
  const tag = blockHeadingTag('hero') ?? 'h1'
  return section(
    'section',
    'hero',
    'cg-cover',
    { 'data-media': block.media === undefined ? 'none' : 'image' },
    'div',
    h(
      'div',
      { class: 'cg-cover__copy' },
      block.eyebrow === undefined
        ? null
        : h('p', { class: 'cg-cover__kicker', 'data-field': 'eyebrow' }, block.eyebrow),
      heading(tag, { class: 'cg-cover__title', 'data-field': 'title' }, block.title),
      block.subtitle === undefined
        ? null
        : h('p', { class: 'cg-cover__standfirst', 'data-field': 'subtitle' }, block.subtitle),
      actionList(ctx, block.actions, ctx.t('hero.actions')),
    ),
    block.media === undefined
      ? null
      : h(
          'div',
          { class: 'cg-cover__media' },
          // The one image above the fold, so the one loaded eagerly.
          image(ctx, block.media, {
            className: 'cg-cover__image',
            loading: 'eager',
            sizes: '(min-width: 64rem) 46rem, 100vw',
          }),
        ),
  )
}
