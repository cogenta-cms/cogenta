import type { FeatureGridBlock, FeatureItem } from '@cogenta/blocks'
import {
  type HeadingTag,
  type HtmlElement,
  h,
  heading,
  href,
  nestedHeadingTag,
  type RenderContext,
} from '@cogenta/theme-kit'
import { ordinal, section, sectionHead } from '../layout.js'

/**
 * A publication's channels rather than a grid of tiles: one ruled cell per
 * item, a mono ordinal, the name set large in the display face and its
 * description under it. A linked item makes its name the link, and the whole
 * cell follows it (a stretched link), so a topic is one target.
 *
 * `icon` is deliberately not drawn. A symbol in a coloured square beside
 * every topic is the pastel-tile pattern this theme exists to avoid, and a
 * magazine names its sections in words.
 */
function renderItem(
  item: FeatureItem,
  index: number,
  ctx: RenderContext,
  tag: HeadingTag,
): HtmlElement {
  return h(
    'li',
    { class: 'cg-contents__item' },
    h('span', { class: 'cg-contents__index cg-label', 'aria-hidden': 'true' }, ordinal(index)),
    heading(
      tag,
      { class: 'cg-contents__title' },
      item.link === undefined
        ? item.title
        : h('a', { class: 'cg-contents__link', href: href(ctx, item.link) }, item.title),
    ),
    item.text === undefined ? null : h('p', { class: 'cg-contents__text' }, item.text),
  )
}

export function renderFeatureGrid(block: FeatureGridBlock, ctx: RenderContext): HtmlElement {
  const itemTag = nestedHeadingTag('featureGrid', block.title !== undefined)
  return section(
    'section',
    'featureGrid',
    'cg-contents',
    {},
    'div',
    sectionHead('featureGrid', block.title),
    h(
      'ul',
      { class: 'cg-contents__items' },
      block.items.map((item, index) => renderItem(item, index, ctx, itemTag)),
    ),
  )
}
