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

/** A plan comparison — kept for contract completeness (a "supporter tiers" use on a reader-funded blog); styled as the same framed-plate cards the rest of this theme uses. */
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
          tier.features.map((feature) => h('li', { class: 'cg-pricing__feature' }, feature)),
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
    { class: 'cg-pricing', 'data-block': 'pricingTable' },
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
