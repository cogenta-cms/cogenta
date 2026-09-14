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
 * Ways to support the writing, set as columns of a ruled table rather than
 * as cards: each tier opens with a hairline, its name in small capitals, the
 * price at a display size in tabular numerals, and what it includes as a
 * list divided by hairlines. The tier the editor highlighted opens with a
 * rule in ink instead, and its action is the filled one.
 */
function renderTier(tier: PricingTier, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  const highlighted = tier.highlighted === true
  return h(
    'li',
    { class: 'cg-tiers__tier', 'data-highlighted': highlighted ? 'true' : undefined },
    heading(tag, { class: 'cg-tiers__name' }, tier.name),
    h(
      'p',
      { class: 'cg-tiers__price' },
      h('span', { class: 'cg-tiers__amount' }, tier.price),
      tier.interval === undefined
        ? null
        : h('span', { class: 'cg-tiers__interval' }, tier.interval),
    ),
    tier.features.length === 0
      ? null
      : h(
          'ul',
          { class: 'cg-tiers__features' },
          tier.features.map((feature) => h('li', { class: 'cg-tiers__feature' }, feature)),
        ),
    tier.action === undefined
      ? null
      : h(
          'div',
          { class: 'cg-tiers__action' },
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
    'cg-tiers',
    { 'data-count': String(Math.min(block.tiers.length, 4)) },
    'div',
    sectionHead('pricingTable', block.title),
    h(
      'ul',
      { class: 'cg-tiers__items' },
      block.tiers.map((tier) => renderTier(tier, ctx, tierTag)),
    ),
  )
}
