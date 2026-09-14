import type { PricingTableBlock, PricingTier } from '@cogenta/blocks'
import type { RenderContext } from '../../theme-contract.js'
import { actionLink } from '../actions.js'
import { blockHeadingTag, type HeadingTag, heading, nestedHeadingTag } from '../heading.js'
import { type HtmlElement, h } from '../html.js'
import { word } from '../strings.js'

/**
 * `blocks@2.0` (RFC 0001). `highlighted` is editorial emphasis, not a colour:
 * it becomes `data-highlighted` for the stylesheet, `aria-current` (loosely
 * "the one on offer") so it is announced, and a short label under the plan's
 * name so it is read in words, never only seen as a heavier rule.
 *
 * Each plan is four rows (name, price, features, action) that the stylesheet
 * lines up across plans, so prices sit on one line and actions on another
 * whatever the length of each feature list.
 */
function renderTier(tier: PricingTier, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  return h(
    'li',
    {
      class: 'cg-pricing__tier',
      'data-highlighted': tier.highlighted === true ? 'true' : undefined,
      'aria-current': tier.highlighted === true ? 'true' : undefined,
    },
    h(
      'div',
      { class: 'cg-pricing__head' },
      heading(tag, { class: 'cg-pricing__name' }, tier.name),
      tier.highlighted === true
        ? h('p', { class: 'cg-pricing__flag' }, word(ctx.locale, 'recommended'))
        : null,
    ),
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
          actionLink(ctx, {
            ...tier.action,
            // An emphasis the editor left unset follows the plan: the
            // recommended plan gets the filled button, the others an outline.
            emphasis: tier.action.emphasis ?? (tier.highlighted === true ? 'primary' : 'secondary'),
          }),
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
