import type { StatItem, StatsBlock } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext } from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'

/**
 * Figures in a row between two rules, the way a newspaper sets a fact box
 * without the box: each value in the display face with lining tabular
 * numerals, its unit smaller beside it, the label under it in the interface
 * face, and a vertical hairline between figures. A description list, so
 * each value is announced with its label.
 */
function renderItem(item: StatItem): HtmlElement {
  return h(
    'div',
    { class: 'cg-figures__item' },
    h('dt', { class: 'cg-figures__label' }, item.label),
    h(
      'dd',
      { class: 'cg-figures__value' },
      h('span', { class: 'cg-figures__number' }, item.value),
      item.unit === undefined ? null : h('span', { class: 'cg-figures__unit' }, item.unit),
    ),
  )
}

export function renderStats(block: StatsBlock, _ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'stats',
    'cg-figures',
    { 'data-count': String(Math.min(block.items.length, 4)) },
    'div',
    sectionHead('stats', block.title),
    h('dl', { class: 'cg-figures__items' }, block.items.map(renderItem)),
  )
}
