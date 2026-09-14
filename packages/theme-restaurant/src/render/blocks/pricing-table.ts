import type { PricingTableBlock, PricingTier } from '@cogenta/blocks'
import {
  actionLink,
  type HtmlElement,
  h,
  heading,
  nestedHeadingTag,
  type RenderContext,
} from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'

/**
 * Set menus side by side (lunch, the evening menu, a menu for a private
 * party), set the way a menu card prints them: ruled columns rather than
 * cards, the name of the menu in small capitals, the price light and large in
 * the display serif with tabular figures and what it covers ("per guest")
 * under it, then the courses one per line between hairlines, and the action
 * at the foot.
 *
 * `highlighted` is an editorial emphasis, drawn as the column's top rule in
 * ink instead of a hairline. No ribbon, no raised card, no accent fill.
 */
function tier(item: PricingTier, ctx: RenderContext, titled: boolean): HtmlElement {
  return h(
    'li',
    { class: 'cr-set__tier', 'data-highlighted': item.highlighted === true ? 'true' : 'false' },
    heading(nestedHeadingTag('pricingTable', titled), { class: 'cr-set__name' }, item.name),
    h(
      'p',
      { class: 'cr-set__price' },
      h('span', { class: 'cr-set__amount' }, item.price),
      item.interval === undefined ? null : h('span', { class: 'cr-set__interval' }, item.interval),
    ),
    item.features.length === 0
      ? null
      : h(
          'ul',
          { class: 'cr-set__courses' },
          item.features.map((feature) => h('li', { class: 'cr-set__course' }, feature)),
        ),
    item.action === undefined
      ? null
      : h('div', { class: 'cr-set__action' }, actionLink(ctx, item.action)),
  )
}

export function renderPricingTable(block: PricingTableBlock, ctx: RenderContext): HtmlElement {
  const titled = block.title !== undefined
  return section(
    'section',
    'pricingTable',
    'cr-set',
    { 'data-count': String(Math.min(block.tiers.length, 4)) },
    'div',
    sectionHead('pricingTable', block.title),
    h(
      'ul',
      { class: 'cr-set__tiers' },
      block.tiers.map((item) => tier(item, ctx, titled)),
    ),
  )
}
