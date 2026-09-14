import type { FeatureGridBlock, FeatureItem } from '@cogenta/blocks'
import {
  type HtmlElement,
  h,
  href,
  nestedHeadingTag,
  type RenderContext,
  renderIcon,
} from '@cogenta/theme-kit'
import { optionalText, section, sectionHead } from '../layout.js'

/**
 * Short entries in three columns: "Start here", "Get help". No card, no tile,
 * no background: each entry hangs from a hairline, its title is the link (an
 * underlined arrow link when there is one), and one or two lines under it say
 * what the reader will find. An icon, when the item names one this theme
 * knows, is a small stroke drawing inline before the title in the secondary
 * ink, the size of the text it sits beside.
 *
 * Three columns on a desk, two on a tablet, one on a phone; four items make
 * a row of four on a wide screen, so no row is left with an empty cell.
 */
function entry(item: FeatureItem, ctx: RenderContext, tag: string): HtmlElement {
  const icon =
    item.icon === undefined
      ? null
      : renderIcon(item.icon, { className: 'cd-features__icon', size: 18 })
  return h(
    'li',
    { class: 'cd-features__item' },
    h(
      tag,
      { class: 'cd-features__title' },
      icon,
      item.link === undefined
        ? h('span', {}, item.title)
        : h('a', { class: 'cd-arrow-link', href: href(ctx, item.link) }, item.title),
    ),
    optionalText('p', 'cd-features__text', item.text),
  )
}

export function renderFeatureGrid(block: FeatureGridBlock, ctx: RenderContext): HtmlElement {
  const tag = nestedHeadingTag('featureGrid', block.title !== undefined)
  const count = block.items.length
  return section(
    'section',
    'featureGrid',
    'cd-features',
    { 'data-count': String(count % 4 === 0 ? 4 : Math.min(count, 3)) },
    'div',
    sectionHead('featureGrid', block.title),
    h(
      'ul',
      { class: 'cd-features__items' },
      block.items.map((item) => entry(item, ctx, tag)),
    ),
  )
}
