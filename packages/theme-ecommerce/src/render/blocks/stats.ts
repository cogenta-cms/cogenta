import type { StatsBlock } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext } from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'

/**
 * Figures a shop can stand behind (years of making, repairs done, makers
 * worked with), set as a row of columns under one hairline: the number (the `dd`, drawn above its label) at the
 * section size in tabular figures, its unit a step smaller, and a sentence of
 * context under it. No box, no tint, no counter animation.
 */
export function renderStats(block: StatsBlock, _ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'stats',
    'ce-figures',
    { 'data-count': String(Math.min(block.items.length, 4)) },
    'div',
    sectionHead('stats', block.title),
    h(
      'dl',
      { class: 'ce-figures__items' },
      block.items.map((item) =>
        h(
          'div',
          { class: 'ce-figures__item' },
          h('dt', { class: 'ce-figures__label' }, item.label),
          h(
            'dd',
            { class: 'ce-figures__value' },
            item.value,
            item.unit === undefined ? null : h('span', { class: 'ce-figures__unit' }, item.unit),
          ),
        ),
      ),
    ),
  )
}
