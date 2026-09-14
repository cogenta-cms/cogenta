import type { StatCounterBlock } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext } from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'

/**
 * A row of counts ("Releases this year", "Supported runtimes"): the same
 * ruled, tabular register as `stats`, without units. Nothing counts up on
 * scroll; the figure is simply printed.
 */
export function renderStatCounter(block: StatCounterBlock, _ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'statCounter',
    'cd-figures',
    { 'data-count': String(Math.min(block.stats.length, 4)) },
    'div',
    sectionHead('statCounter', block.title),
    h(
      'dl',
      { class: 'cd-figures__items' },
      block.stats.map((stat) =>
        h(
          'div',
          { class: 'cd-figures__item' },
          h('dt', { class: 'cd-figures__label' }, stat.label),
          h(
            'dd',
            { class: 'cd-figures__value' },
            h('span', { class: 'cd-figures__number' }, stat.value),
          ),
        ),
      ),
    ),
  )
}
