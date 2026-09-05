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
 * `blocks@2.0` (RFC 0001). Rendered as a set-menu comparison — a "tasting
 * menu" / "prix fixe" tier is the shape this block already has (a name, a
 * price, a feature list), so this theme reuses the same restrained bordered
 * plates the rest of the vocabulary uses rather than a distinct pricing
 * skin. `highlighted` becomes a small "chef's pick" rule rather than a
 * colour.
 */
function renderTier(tier: PricingTier, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  return h(
    'li',
    {
      class: 'cg-set-menu__tier',
      'data-highlighted': tier.highlighted === true ? 'true' : undefined,
      'aria-current': tier.highlighted === true ? 'true' : undefined,
    },
    heading(tag, { class: 'cg-set-menu__name' }, tier.name),
    h(
      'p',
      { class: 'cg-set-menu__price' },
      h('span', { class: 'cg-set-menu__amount' }, tier.price),
      tier.interval === undefined
        ? null
        : h('span', { class: 'cg-set-menu__interval' }, tier.interval),
    ),
    tier.features.length === 0
      ? null
      : h(
          'ul',
          { class: 'cg-set-menu__features' },
          tier.features.map((feature) => h('li', { class: 'cg-set-menu__feature' }, feature)),
        ),
    tier.action === undefined
      ? null
      : h(
          'div',
          { class: 'cg-set-menu__action' },
          actionLink(ctx, { ...tier.action, emphasis: tier.action.emphasis ?? 'primary' }),
        ),
  )
}

export function renderPricingTable(block: PricingTableBlock, ctx: RenderContext): HtmlElement {
  const hasTitle = block.title !== undefined
  const tierTag = nestedHeadingTag('pricingTable', hasTitle)
  return h(
    'section',
    { class: 'cg-set-menu', 'data-block': 'pricingTable' },
    hasTitle
      ? heading(
          blockHeadingTag('pricingTable') ?? 'h2',
          { class: 'cg-set-menu__title', 'data-field': 'title' },
          block.title ?? '',
        )
      : null,
    h(
      'ul',
      { class: 'cg-set-menu__tiers' },
      block.tiers.map((tier) => renderTier(tier, ctx, tierTag)),
    ),
  )
}
