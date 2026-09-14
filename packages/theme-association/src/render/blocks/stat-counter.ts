import type { StatCounterBlock } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext } from '@cogenta/theme-kit'
import { isBreakdown } from '../figures.js'
import { section, sectionHead } from '../layout.js'
import { renderBreakdown } from './breakdown.js'

/**
 * The narrower sibling of `stats` (a value and a short label, no unit): a
 * single row of figures across the container, divided by vertical hairlines,
 * each number in the display face over its label. Percentages of one whole
 * are drawn as a breakdown, the same as `stats`. Nothing counts up; a number
 * that animates into place is a number a visitor has to wait for.
 */
export function renderStatCounter(block: StatCounterBlock, ctx: RenderContext): HtmlElement {
  const breakdown = isBreakdown(block.stats)
  return section(
    'section',
    'statCounter',
    'ca-counter',
    {
      'data-shape': breakdown ? 'breakdown' : 'row',
      'data-count': String(Math.min(block.stats.length, 4)),
      'data-titled': String(block.title !== undefined),
    },
    'div',
    sectionHead('statCounter', block.title),
    breakdown
      ? renderBreakdown(block.stats, ctx)
      : h(
          'dl',
          { class: 'ca-counter__items' },
          block.stats.map((stat) =>
            h(
              'div',
              { class: 'ca-counter__item' },
              h('dt', { class: 'ca-counter__label' }, stat.label),
              h('dd', { class: 'ca-counter__value' }, stat.value),
            ),
          ),
        ),
  )
}
