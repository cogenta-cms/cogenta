import type { StatsBlock } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext } from '@cogenta/theme-kit'
import { isBreakdown } from '../figures.js'
import { section, sectionHead } from '../layout.js'
import { renderBreakdown } from './breakdown.js'

/**
 * What a year of work added up to, with the sentence that makes each number
 * mean something: the title on the first four columns, and the figures on the
 * last eight in two columns, each under a rule. The number in the display
 * face, narrow and large, in the organisation's green with lining tabular
 * figures and its unit a step smaller; under it the sentence of context in
 * the text face. No box, no tint, nothing counts up.
 *
 * Figures that are all percentages of one whole are drawn as a breakdown
 * instead (`renderBreakdown`).
 */
export function renderStats(block: StatsBlock, ctx: RenderContext): HtmlElement {
  const breakdown = isBreakdown(block.items)
  return section(
    'section',
    'stats',
    'ca-figures',
    {
      'data-shape': breakdown ? 'breakdown' : 'figures',
      'data-count': String(Math.min(block.items.length, 4)),
      'data-titled': String(block.title !== undefined),
    },
    'div',
    sectionHead('stats', block.title),
    breakdown
      ? renderBreakdown(block.items, ctx)
      : h(
          'dl',
          { class: 'ca-figures__items' },
          block.items.map((item) =>
            h(
              'div',
              { class: 'ca-figures__item' },
              h('dt', { class: 'ca-figures__label' }, item.label),
              h(
                'dd',
                { class: 'ca-figures__value' },
                item.value,
                item.unit === undefined
                  ? null
                  : h('span', { class: 'ca-figures__unit' }, item.unit),
              ),
            ),
          ),
        ),
  )
}
