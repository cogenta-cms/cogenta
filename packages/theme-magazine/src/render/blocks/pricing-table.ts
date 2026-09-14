import type { PricingTableBlock, PricingTier } from '@cogenta/blocks'
import {
  actionLink,
  type HeadingTag,
  type HtmlElement,
  h,
  heading,
  nestedHeadingTag,
  type RenderContext,
} from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'

/**
 * Subscription rates, set as the columns of a ruled table rather than as
 * cards: each tier opens on a hairline, its name in small capitals, the price
 * in the display face with tabular numerals and the interval after it, what
 * it includes as a list divided by hairlines, and its action at the foot. The
 * tier the editor highlighted opens on a heavy red rule instead, and its
 * action is the filled one; every other tier's action is drawn as an outlined
 * control in `blocks.css`, so the four actions line up as one row.
 */
function renderTier(tier: PricingTier, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const highlighted = tier.highlighted === true
  return h(
    'li',
    { class: 'cg-rates__tier', 'data-highlighted': highlighted ? 'true' : undefined },
    heading(tag, { class: 'cg-rates__name' }, tier.name),
    h(
      'p',
      { class: 'cg-rates__price' },
      h('span', { class: 'cg-rates__amount' }, tier.price),
      tier.interval === undefined
        ? null
        : h('span', { class: 'cg-rates__interval' }, tier.interval),
    ),
    tier.features.length === 0
      ? null
      : h(
          'ul',
          { class: 'cg-rates__features' },
          tier.features.map((feature) => h('li', { class: 'cg-rates__feature' }, feature)),
        ),
    tier.action === undefined
      ? null
      : h(
          'div',
          { class: 'cg-rates__action' },
          actionLink(ctx, {
            ...tier.action,
            emphasis: tier.action.emphasis ?? (highlighted ? 'primary' : 'secondary'),
          }),
        ),
  )
}

export function renderPricingTable(block: PricingTableBlock, ctx: RenderContext): HtmlElement {
  const tierTag = nestedHeadingTag('pricingTable', block.title !== undefined)
  return section(
    'section',
    'pricingTable',
    'cg-rates',
    { 'data-count': String(Math.min(block.tiers.length, 4)) },
    'div',
    sectionHead('pricingTable', block.title),
    h(
      'ul',
      { class: 'cg-rates__tiers' },
      block.tiers.map((tier) => renderTier(tier, ctx, tierTag)),
    ),
  )
}
