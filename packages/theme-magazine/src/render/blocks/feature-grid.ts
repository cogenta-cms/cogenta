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
 * A set of short items, set as a contents panel: up to four columns divided
 * by vertical hairlines, each item a title in the display face and a line of
 * text. An item with a link makes its title the link, with an arrow set
 * inline after the last word so the underline runs under the words and never
 * under a lone arrow. No icon tiles: `icon` names are ignored on purpose, a
 * newspaper sets a contents panel in type.
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
        : h('a', { class: 'cg-arrow-link', href: href(ctx, item.link) }, item.title),
    ),
    item.text === undefined ? null : h('p', { class: 'cg-contents__text' }, item.text),
  )
}

export function renderFeatureGrid(block: FeatureGridBlock, ctx: RenderContext): HtmlElement {
  const tag = nestedHeadingTag('featureGrid', block.title !== undefined)
  return section(
    'section',
    'featureGrid',
    'cg-contents',
    { 'data-count': String(Math.min(block.items.length, 4)) },
    'div',
    sectionHead('featureGrid', block.title),
    h(
      'ul',
      { class: 'cg-contents__items' },
      block.items.map((item) => renderItem(item, ctx, tag)),
    ),
  )
}
