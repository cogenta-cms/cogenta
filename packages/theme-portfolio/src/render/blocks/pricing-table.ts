import type { PricingTableBlock, PricingTier } from '@cogenta/blocks'
import {
  actionLink,
  blockHeadingTag,
  type HeadingTag,
  type HtmlElement,
  h,
  heading,
  nestedHeadingTag,
  type RenderContext,
} from '@cogenta/theme-kit'

/**
 * `highlighted` is an editorial signal, never a colour (RFC 0001's own
 * comment on the field): it is written as `data-highlighted="true"` for the
 * skin to key off, and the tier additionally carries `aria-current="true"`
 * — the closest native semantic for "the one the author means you to pick"
 * among a set of siblings.
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
      tier.price,
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
      : h('div', { class: 'cg-pricing__action' }, actionLink(ctx, tier.action)),
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
