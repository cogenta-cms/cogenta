import type { StatsBlock } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext } from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'

/**
 * Figures a kitchen can stand behind (covers a night, farms it buys from, the
 * year it opened), set as a row of columns under one hairline: the number
 * (the `dd`, drawn above its label) light and large in the display serif with
 * lining tabular figures, its unit a step smaller, and a sentence of context
 * under it. No box, no tint, no counter animation.
 */
export function renderStats(block: StatsBlock, _ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'stats',
    'cr-figures',
    { 'data-count': String(Math.min(block.items.length, 4)) },
    'div',
    sectionHead('stats', block.title),
    h(
      'dl',
      { class: 'cr-figures__items' },
      block.items.map((item) =>
        h(
          'div',
          { class: 'cr-figures__item' },
          h('dt', { class: 'cr-figures__label' }, item.label),
          h(
            'dd',
            { class: 'cr-figures__value' },
            item.value,
            item.unit === undefined ? null : h('span', { class: 'cr-figures__unit' }, item.unit),
          ),
        ),
      ),
    ),
  )
}
