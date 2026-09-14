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
import { section, sectionHead } from '../layout.js'

/**
 * A publication's table of contents rather than a grid of tiles: one ruled
 * row per item, its name set in the text face in the margin columns and its
 * description on the text line beside it. A linked item makes its name the
 * link.
 *
 * `icon` is deliberately not drawn. A symbol in a square beside every topic
 * is the pastel-tile pattern this theme exists to avoid, and a reading site
 * names its subjects in words.
 */
function renderItem(item: FeatureItem, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  return h(
    'li',
    { class: 'cg-contents__item' },
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
      block.items.map((item) => renderItem(item, ctx, itemTag)),
    ),
  )
}
