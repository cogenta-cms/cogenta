import type { StatCounterBlock, StatCounterItem } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext } from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'

/**
 * A few large figures side by side, each column opened by a vertical
 * hairline: the number in the light cut of the text face at its largest
 * size, the label beneath. Where `stats` is a ruled line of facts, this is
 * the figure a page wants remembered.
 */
function renderItem(item: StatCounterItem): HtmlElement {
  return h(
    'div',
    { class: 'cg-tally__item' },
    h('dt', { class: 'cg-tally__label' }, item.label),
    h('dd', { class: 'cg-tally__value' }, item.value),
  )
}

export function renderStatCounter(block: StatCounterBlock, _ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'statCounter',
    'cg-tally',
    { 'data-count': String(Math.min(block.stats.length, 4)) },
    'div',
    sectionHead('statCounter', block.title),
    h('dl', { class: 'cg-tally__items' }, block.stats.map(renderItem)),
  )
}
