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
 * - **A ruled table**, when no item names an icon. The items are facts a
 *   guest looks up (lunch, dinner, the address, the metro stop; a supplier
 *   and what they bring), so they are set like the back of a menu card: the
 *   title of the table on the first four columns, then one row per item under
 *   a hairline, its name in the serif on the left and its sentence on the
 *   right. A name with a link is an arrow link.
 * - **Ruled columns**, when an item names an icon this theme can draw: a
 *   small line icon, the name, its sentence, each column under a hairline.
 *   Never a tinted tile behind an icon, never a card.
 */
function hasIcons(block: FeatureGridBlock): boolean {
  return block.items.some((item) => item.icon !== undefined)
}

function name(item: FeatureItem, ctx: RenderContext, className: string): HtmlElement | string {
  return item.link === undefined
    ? item.title
    : h('a', { class: `cr-arrow-link ${className}`, href: href(ctx, item.link) }, item.title)
}

/**
 * In a table the link belongs to the value a guest acts on (the telephone
 * number, the address), not to its label: "Telephone" is a heading, the
 * number is what they tap. A row with no sentence links its label instead.
 */
function row(item: FeatureItem, ctx: RenderContext, titled: boolean): HtmlElement {
  const label = heading(
    nestedHeadingTag('featureGrid', titled),
    { class: 'cr-table__label' },
    item.text === undefined ? name(item, ctx, 'cr-table__link') : item.title,
  )
  if (item.text === undefined) return h('li', { class: 'cr-table__row' }, label)
  return h(
    'li',
    { class: 'cr-table__row' },
    label,
    h(
      'p',
      { class: 'cr-table__text' },
      item.link === undefined
        ? item.text
        : h('a', { class: 'cr-table__value-link', href: href(ctx, item.link) }, item.text),
    ),
  )
}

function column(item: FeatureItem, ctx: RenderContext, titled: boolean): HtmlElement {
  const icon =
    item.icon === undefined
      ? null
      : renderIcon(item.icon, { className: 'cr-columns__icon', size: 22 })
  return h(
    'li',
    { class: 'cr-columns__item' },
    icon,
    heading(
      nestedHeadingTag('featureGrid', titled),
      { class: 'cr-columns__name' },
      name(item, ctx, 'cr-columns__link'),
    ),
    item.text === undefined ? null : h('p', { class: 'cr-columns__text' }, item.text),
  )
}

export function renderFeatureGrid(block: FeatureGridBlock, ctx: RenderContext): HtmlElement {
  const titled = block.title !== undefined
  if (!hasIcons(block)) {
    return section(
      'section',
      'featureGrid',
      'cr-table',
      { 'data-titled': String(titled) },
      'div',
      sectionHead('featureGrid', block.title),
      h(
        'ul',
        { class: 'cr-table__rows' },
        block.items.map((item) => row(item, ctx, titled)),
      ),
    )
  }
  return section(
    'section',
    'featureGrid',
    'cr-columns',
    { 'data-titled': String(titled), 'data-count': String(Math.min(block.items.length, 4)) },
    'div',
    sectionHead('featureGrid', block.title),
    h(
      'ul',
      { class: 'cr-columns__items' },
      block.items.map((item) => column(item, ctx, titled)),
    ),
  )
}
