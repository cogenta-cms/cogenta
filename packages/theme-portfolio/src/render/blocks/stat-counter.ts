import type { StatCounterBlock, StatCounterItem } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext } from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'

/**
 * A ruled table of figures from the fourth column, one row per figure: what
 * it counts on the left in the text face, the value on the right in the
 * display width with tabular numerals, so a column of numbers lines up.
 * Where `stats` sets figures side by side, this sets them as a list read
 * down the page. It carries no unit, the narrower shape contract B gives it.
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
    'cg-tally cg-split',
    { 'data-titled': block.title === undefined ? 'false' : 'true' },
    'div',
    sectionHead('statCounter', block.title),
    h('dl', { class: 'cg-tally__rows' }, block.stats.map(renderItem)),
  )
}
