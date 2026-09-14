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
 * Levels side by side: a membership, a regular gift, a sponsored place.
 * Ruled columns rather than cards: the name of the level, the amount large in
 * the display face with tabular figures and what it covers ("a month") beside
 * it, then what it includes one line at a time between hairlines, and the
 * action at the foot.
 *
 * `highlighted` is an editorial emphasis, drawn as the column's top rule in
 * the organisation's green, thicker, and its name in the same green. No
 * ribbon, no raised card, no fill.
 */
function tier(item: PricingTier, ctx: RenderContext, titled: boolean): HtmlElement {
  return h(
    'li',
    { class: 'ca-levels__tier', 'data-highlighted': item.highlighted === true ? 'true' : 'false' },
    heading(nestedHeadingTag('pricingTable', titled), { class: 'ca-levels__name' }, item.name),
    h(
      'p',
      { class: 'ca-levels__price' },
      h('span', { class: 'ca-levels__amount' }, item.price),
      item.interval === undefined
        ? null
        : h('span', { class: 'ca-levels__interval' }, item.interval),
    ),
    item.features.length === 0
      ? null
      : h(
          'ul',
          { class: 'ca-levels__lines' },
          item.features.map((feature) => h('li', { class: 'ca-levels__line' }, feature)),
        ),
    item.action === undefined
      ? null
      : h('div', { class: 'ca-levels__action' }, actionLink(ctx, item.action)),
  )
}

export function renderPricingTable(block: PricingTableBlock, ctx: RenderContext): HtmlElement {
  const titled = block.title !== undefined
  return section(
    'section',
    'pricingTable',
    'ca-levels',
    { 'data-count': String(Math.min(block.tiers.length, 4)) },
    'div',
    sectionHead('pricingTable', block.title),
    h(
      'ul',
      { class: 'ca-levels__tiers' },
      block.tiers.map((item) => tier(item, ctx, titled)),
    ),
  )
}
