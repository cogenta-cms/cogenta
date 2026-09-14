import type { FeatureGridBlock, FeatureItem } from '@cogenta/blocks'
import {
  type HtmlElement,
  h,
  heading,
  href,
  nestedHeadingTag,
  type RenderContext,
  renderIcon,
} from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'

/**
 * Two readings of the same block, chosen by its content rather than by a
 * setting:
 *
 * - **A ruled line.** When no item carries a sentence, the items are short
 *   statements (the shop's commitments: delivery, returns, repairs) and read
 *   as one line of text between two hairlines, each statement a link when it
 *   has one. No icon, no card.
 * - **Ruled columns.** Otherwise each item is a column under a hairline: a
 *   small line icon when the item names one this theme can draw, the name,
 *   its sentence. Never a tinted tile behind an icon, never a card.
 */
function isLine(block: FeatureGridBlock): boolean {
  return block.items.every((item) => item.text === undefined)
}

function lineItem(item: FeatureItem, ctx: RenderContext): HtmlElement {
  return h(
    'li',
    { class: 'ce-line__item' },
    item.link === undefined
      ? h('span', { class: 'ce-line__text' }, item.title)
      : h('a', { class: 'ce-line__text ce-line__link', href: href(ctx, item.link) }, item.title),
  )
}

function column(item: FeatureItem, ctx: RenderContext, titled: boolean): HtmlElement {
  const icon =
    item.icon === undefined
      ? null
      : renderIcon(item.icon, { className: 'ce-columns__icon', size: 20 })
  const name = heading(
    nestedHeadingTag('featureGrid', titled),
    { class: 'ce-columns__name' },
    item.link === undefined
      ? item.title
      : h('a', { class: 'ce-arrow-link', href: href(ctx, item.link) }, item.title),
  )
  return h(
    'li',
    { class: 'ce-columns__item' },
    icon,
    name,
    item.text === undefined ? null : h('p', { class: 'ce-columns__text' }, item.text),
  )
}

export function renderFeatureGrid(block: FeatureGridBlock, ctx: RenderContext): HtmlElement {
  const titled = block.title !== undefined
  if (isLine(block)) {
    return section(
      'section',
      'featureGrid',
      'ce-line',
      { 'data-titled': String(titled) },
      'div',
      sectionHead('featureGrid', block.title),
      h(
        'ul',
        { class: 'ce-line__items' },
        block.items.map((item) => lineItem(item, ctx)),
      ),
    )
  }
  return section(
    'section',
    'featureGrid',
    'ce-columns',
    { 'data-titled': String(titled), 'data-count': String(Math.min(block.items.length, 4)) },
    'div',
    sectionHead('featureGrid', block.title),
    h(
      'ul',
      { class: 'ce-columns__items' },
      block.items.map((item) => column(item, ctx, titled)),
    ),
  )
}
