import type { StatCounterBlock } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext } from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'

/**
 * Headline counts (customers, countries, people on the team) as one band
 * between two hairlines, divided into equal cells by vertical hairlines: the
 * count large in Geist with tabular numerals, its label under it. The same
 * system as `stats`, drawn as a single ruled strip rather than separate
 * columns, since a counter carries no unit to align on.
 */
export function renderStatCounter(block: StatCounterBlock, _ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'statCounter',
    'cs-counters',
    { 'data-count': String(Math.min(block.stats.length, 4)) },
    'div',
    sectionHead('statCounter', block.title),
    h(
      'dl',
      { class: 'cs-counters__items' },
      block.stats.map((item) =>
        h(
          'div',
          { class: 'cs-counters__item' },
          h('dt', { class: 'cs-counters__label' }, item.label),
          h('dd', { class: 'cs-counters__value' }, item.value),
        ),
      ),
    ),
  )
}
