import type { PricingTableBlock, PricingTier } from '@cogenta/blocks'
import type { RenderContext } from '../../theme-contract.js'
import { actionLink } from '../actions.js'
import { blockHeadingTag, type HeadingTag, heading, nestedHeadingTag } from '../heading.js'
import { type HtmlElement, h } from '../html.js'

/**
 * `blocks@2.0` (RFC 0001). `highlighted` is editorial emphasis, not a colour:
 * it becomes `data-highlighted` for the skin to style, and `aria-current`
 * (loosely "the one on offer") so it is announced, not only shown.
 */
function renderTier(tier: PricingTier, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  return h(
    'li',
    {
      class: 'cg-pricing__tier',
      'data-highlighted': tier.highlighted === true ? 'true' : undefined,
      'aria-current': tier.highlighted === true ? 'true' : undefined,
    },
    heading(tag, { class: 'cg-pricing__name' }, tier.name),
    h(
      'p',
      { class: 'cg-pricing__price' },
      h('span', { class: 'cg-pricing__amount' }, tier.price),
      tier.interval === undefined
        ? null
        : h('span', { class: 'cg-pricing__interval' }, tier.interval),
    ),
    tier.features.length === 0
      ? null
      : h(
          'ul',
          { class: 'cg-pricing__features' },
          tier.features.map((feature) => h('li', {}, feature)),
        ),
    tier.action === undefined
      ? null
      : h(
          'div',
          { class: 'cg-pricing__action' },
          actionLink(ctx, { ...tier.action, emphasis: tier.action.emphasis ?? 'primary' }),
        ),
  )
}

export function renderPricingTable(block: PricingTableBlock, ctx: RenderContext): HtmlElement {
  const hasTitle = block.title !== undefined
  const tierTag = nestedHeadingTag('pricingTable', hasTitle)
  return h(
    'section',
    { class: 'cg-block cg-pricing', 'data-block': 'pricingTable' },
    hasTitle
      ? heading(
          blockHeadingTag('pricingTable') ?? 'h2',
          { class: 'cg-pricing__title', 'data-field': 'title' },
          block.title ?? '',
        )
      : null,
    h(
      'ul',
      { class: 'cg-pricing__tiers' },
      block.tiers.map((tier) => renderTier(tier, ctx, tierTag)),
    ),
  )
}
