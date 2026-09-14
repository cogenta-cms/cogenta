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
 * Plans side by side (a repair plan, a subscription for coffee, a set price
 * for a workshop), as ruled columns rather than cards: the name, the price at
 * the section size in tabular figures with its interval, the inclusions each
 * under a hairline, and the action at the foot.
 *
 * `highlighted` is an editorial emphasis, drawn as the column's top rule in
 * ink instead of a hairline. No ribbon, no raised card, no accent fill.
 */
function tier(item: PricingTier, ctx: RenderContext, titled: boolean): HtmlElement {
  return h(
    'li',
    { class: 'ce-plans__tier', 'data-highlighted': item.highlighted === true ? 'true' : 'false' },
    heading(nestedHeadingTag('pricingTable', titled), { class: 'ce-plans__name' }, item.name),
    h(
      'p',
      { class: 'ce-plans__price' },
      h('span', { class: 'ce-plans__amount' }, item.price),
      item.interval === undefined
        ? null
        : h('span', { class: 'ce-plans__interval' }, item.interval),
    ),
    item.features.length === 0
      ? null
      : h(
          'ul',
          { class: 'ce-plans__features' },
          item.features.map((feature) => h('li', { class: 'ce-plans__feature' }, feature)),
        ),
    item.action === undefined
      ? null
      : h('div', { class: 'ce-plans__action' }, actionLink(ctx, item.action)),
  )
}

export function renderPricingTable(block: PricingTableBlock, ctx: RenderContext): HtmlElement {
  const titled = block.title !== undefined
  return section(
    'section',
    'pricingTable',
    'ce-plans',
    { 'data-count': String(Math.min(block.tiers.length, 4)) },
    'div',
    sectionHead('pricingTable', block.title),
    h(
      'ul',
      { class: 'ce-plans__tiers' },
      block.tiers.map((item) => tier(item, ctx, titled)),
    ),
  )
}
