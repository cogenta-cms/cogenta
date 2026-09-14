import type { StatItem, StatsBlock } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext } from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'

/**
 * A line of figures between two rules: each value in the text face at a
 * display size, lining tabular numerals, its unit beside it at the text
 * size, and the label in small interface type underneath. No boxes and no
 * colour: the numbers are typography.
 */
function renderItem(item: StatItem): HtmlElement {
  return h(
    'div',
    { class: 'cg-figures__item' },
    h('dt', { class: 'cg-figures__label' }, item.label),
    h(
      'dd',
      { class: 'cg-figures__value' },
      item.value,
      item.unit === undefined ? null : h('span', { class: 'cg-figures__unit' }, item.unit),
    ),
  )
}

export function renderStats(block: StatsBlock, _ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'stats',
    'cg-figures',
    {},
    'div',
    sectionHead('stats', block.title),
    h('dl', { class: 'cg-figures__items' }, block.items.map(renderItem)),
  )
}
