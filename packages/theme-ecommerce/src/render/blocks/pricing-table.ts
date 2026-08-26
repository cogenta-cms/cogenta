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
 * The side-by-side plan comparison a storefront reaches for — subscription
 * tiers, service bundles, shipping speeds — styled with the same card
 * language as `featureGrid`'s product cards, so a pricing panel reads as one
 * more shoppable surface rather than a bolted-on SaaS widget.
 *
 * `highlighted` is an editorial signal, never a colour: it surfaces only as
 * `data-highlighted`/`aria-current`, both read by the stylesheet and by
 * assistive technology, and the skin decides what (if anything) that means
 * visually.
 */
function renderTier(tier: PricingTier, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  return h(
    'li',
    {
      class: 'ce-pricing__tier',
      'data-highlighted': tier.highlighted === true ? 'true' : undefined,
      'aria-current': tier.highlighted === true ? 'true' : undefined,
    },
    heading(tag, { class: 'ce-pricing__name' }, tier.name),
    h(
      'p',
      { class: 'ce-pricing__price' },
      h('span', { class: 'ce-pricing__amount' }, tier.price),
      tier.interval === undefined
        ? null
        : h('span', { class: 'ce-pricing__interval' }, tier.interval),
    ),
    tier.features.length === 0
      ? null
      : h(
          'ul',
          { class: 'ce-pricing__features' },
          tier.features.map((feature) => h('li', { class: 'ce-pricing__feature' }, feature)),
        ),
    tier.action === undefined
      ? null
      : h('div', { class: 'ce-pricing__action' }, actionLink(ctx, tier.action)),
  )
}

export function renderPricingTable(block: PricingTableBlock, ctx: RenderContext): HtmlElement {
  const hasTitle = block.title !== undefined
  const tierTag = nestedHeadingTag('pricingTable', hasTitle)
  return h(
    'section',
    { class: 'ce-block ce-pricing', 'data-block': 'pricingTable' },
    hasTitle
      ? heading(
          blockHeadingTag('pricingTable') ?? 'h2',
          { class: 'ce-pricing__title', 'data-field': 'title' },
          block.title ?? '',
        )
      : null,
    h(
      'ul',
      { class: 'ce-pricing__tiers' },
      block.tiers.map((tier) => renderTier(tier, ctx, tierTag)),
    ),
  )
}
