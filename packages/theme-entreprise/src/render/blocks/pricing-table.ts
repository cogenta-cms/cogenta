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
import { section } from '../layout.js'

/**
 * `blocks@2.0` (RFC 0001). A comparison set as a ruled table rather than a
 * row of cards: tiers stand side by side between vertical hairlines, each
 * with its name in small capitals, the price in the display serif with
 * tabular numerals, the inclusions as a ruled list and the action at the
 * foot, aligned across tiers.
 *
 * `highlighted` is an editorial signal, never a colour: it becomes
 * `data-highlighted` (a heavier rule above that tier, in ink) and
 * `aria-current`, so the emphasis is announced as well as shown.
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
          tier.features.map((feature) => h('li', { class: 'cg-pricing__feature' }, feature)),
        ),
    tier.action === undefined
      ? null
      : h(
          'div',
          { class: 'cg-pricing__action' },
          actionLink(ctx, {
            ...tier.action,
            emphasis: tier.action.emphasis ?? (tier.highlighted === true ? 'primary' : 'secondary'),
          }),
        ),
  )
}

export function renderPricingTable(block: PricingTableBlock, ctx: RenderContext): HtmlElement {
  const hasTitle = block.title !== undefined
  const tierTag = nestedHeadingTag('pricingTable', hasTitle)
  return section(
    'section',
    'pricingTable',
    'cg-pricing',
    {},
    'div',
    hasTitle
      ? h(
          'div',
          { class: 'cg-head' },
          heading(
            blockHeadingTag('pricingTable') ?? 'h2',
            { class: 'cg-head__title', 'data-field': 'title' },
            block.title ?? '',
          ),
        )
      : null,
    h(
      'ul',
      { class: 'cg-pricing__tiers', 'data-count': String(Math.min(block.tiers.length, 4)) },
      block.tiers.map((tier) => renderTier(tier, ctx, tierTag)),
    ),
  )
}
