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
 * `blocks@2.0` (RFC 0001). A classified-ads rate card: tiers set side by
 * side and separated by the theme's one visible column rule (the same
 * device `hero` and `collectionList` use), rather than a set of raised
 * cards — a print page has no elevation to raise a card off of.
 *
 * `highlighted` is an editorial signal, not a colour: it becomes
 * `data-highlighted` for the stylesheet to pick up (an ink-reversed panel,
 * here) and `aria-current` so it is announced, not only shown.
 */
function renderTier(tier: PricingTier, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  return h(
    'li',
    {
      class: 'cg-ratecard__tier',
      'data-highlighted': tier.highlighted === true ? 'true' : undefined,
      'aria-current': tier.highlighted === true ? 'true' : undefined,
    },
    heading(tag, { class: 'cg-ratecard__name' }, tier.name),
    h(
      'p',
      { class: 'cg-ratecard__price' },
      h('span', { class: 'cg-ratecard__amount' }, tier.price),
      tier.interval === undefined
        ? null
        : h('span', { class: 'cg-ratecard__interval' }, tier.interval),
    ),
    tier.features.length === 0
      ? null
      : h(
          'ul',
          { class: 'cg-ratecard__features' },
          tier.features.map((feature) => h('li', { class: 'cg-ratecard__feature' }, feature)),
        ),
    tier.action === undefined
      ? null
      : h(
          'div',
          { class: 'cg-ratecard__action' },
          actionLink(ctx, { ...tier.action, emphasis: tier.action.emphasis ?? 'primary' }),
        ),
  )
}

export function renderPricingTable(block: PricingTableBlock, ctx: RenderContext): HtmlElement {
  const hasTitle = block.title !== undefined
  const tierTag = nestedHeadingTag('pricingTable', hasTitle)
  return h(
    'section',
    { class: 'cg-block cg-ratecard', 'data-block': 'pricingTable' },
    hasTitle
      ? heading(
          blockHeadingTag('pricingTable') ?? 'h2',
          { class: 'cg-ratecard__title', 'data-field': 'title' },
          block.title ?? '',
        )
      : null,
    h(
      'ul',
      { class: 'cg-ratecard__tiers' },
      block.tiers.map((tier) => renderTier(tier, ctx, tierTag)),
    ),
  )
}
