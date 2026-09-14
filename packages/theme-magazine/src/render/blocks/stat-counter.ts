import type { StatCounterBlock, StatCounterItem } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext } from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'

/**
 * "By the numbers": a ruled table of figures down the page, each row a value
 * in the display face on the left and what it counts on the right. Where
 * `stats` sets figures side by side, this sets them as a list a reader runs
 * down, which suits a longer set. It carries no unit, the narrower shape
 * contract B gives it.
 */
function renderItem(item: StatCounterItem): HtmlElement {
  return h(
    'div',
    { class: 'cg-tally__row' },
    h('dt', { class: 'cg-tally__label' }, item.label),
    h('dd', { class: 'cg-tally__value' }, item.value),
  )
}

export function renderStatCounter(block: StatCounterBlock, _ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'statCounter',
    'cg-tally',
    {},
    'div',
    sectionHead('statCounter', block.title),
    h('dl', { class: 'cg-tally__rows' }, block.stats.map(renderItem)),
  )
}
