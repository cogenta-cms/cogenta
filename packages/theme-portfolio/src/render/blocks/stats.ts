import type { StatItem, StatsBlock } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext } from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'

/**
 * Figures side by side, the way a studio states its record: each figure very
 * large in the display width with tabular numerals, its unit after it at the
 * text size, and what it counts under it, a hairline over every column.
 */
function renderItem(item: StatItem): HtmlElement {
  return h(
    'div',
    { class: 'cg-figures__item' },
    h(
      'dt',
      { class: 'cg-figures__figure' },
      h('span', { class: 'cg-figures__value' }, item.value),
      item.unit === undefined ? null : h('span', { class: 'cg-figures__unit' }, item.unit),
    ),
    h('dd', { class: 'cg-figures__label' }, item.label),
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
