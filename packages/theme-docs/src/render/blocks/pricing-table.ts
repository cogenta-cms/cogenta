import type { PricingTableBlock, PricingTier } from '@cogenta/blocks'
import {
  actionLink,
  type HtmlElement,
  h,
  nestedHeadingTag,
  type RenderContext,
} from '@cogenta/theme-kit'
import { optionalText, section, sectionHead } from '../layout.js'
import { word } from '../strings.js'

/**
 * Plans, the way a documentation site shows them (support plans, usage
 * limits): columns side by side between hairlines, never cards. Each plan
 * names itself, prints its price in tabular numerals with the interval after
 * it, lists what it includes as ruled lines, and ends on its action. The
 * recommended plan is marked by a rule in ink above it and a word, never by a
 * tinted background.
 */
function tier(item: PricingTier, ctx: RenderContext, tag: string): HtmlElement {
  const highlighted = item.highlighted === true
  return h(
    'li',
    { class: 'cd-plans__item', 'data-highlighted': highlighted ? 'true' : 'false' },
    h(
      'div',
      { class: 'cd-plans__head' },
      h(tag, { class: 'cd-plans__name' }, item.name),
      highlighted ? h('p', { class: 'cd-plans__flag' }, word(ctx.locale, 'recommended')) : null,
    ),
    h(
      'p',
      { class: 'cd-plans__price' },
      h('span', { class: 'cd-plans__amount' }, item.price),
      optionalText('span', 'cd-plans__interval', item.interval),
    ),
    item.features.length === 0
      ? null
      : h(
          'ul',
          { class: 'cd-plans__features' },
          item.features.map((feature) => h('li', { class: 'cd-plans__feature' }, feature)),
        ),
    item.action === undefined
      ? null
      : h('div', { class: 'cd-plans__action' }, actionLink(ctx, item.action)),
  )
}

export function renderPricingTable(block: PricingTableBlock, ctx: RenderContext): HtmlElement {
  const tag = nestedHeadingTag('pricingTable', block.title !== undefined)
  return section(
    'section',
    'pricingTable',
    'cd-plans',
    { 'data-count': String(Math.min(block.tiers.length, 4)) },
    'div',
    sectionHead('pricingTable', block.title),
    h(
      'ul',
      { class: 'cd-plans__items' },
      block.tiers.map((item) => tier(item, ctx, tag)),
    ),
  )
}
