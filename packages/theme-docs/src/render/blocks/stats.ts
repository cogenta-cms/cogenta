import type { StatsBlock } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext } from '@cogenta/theme-kit'
import { optionalText, section, sectionHead } from '../layout.js'

/**
 * Figures the way a benchmark or a limits page prints them: a ruled row of
 * up to four columns, each value in tabular numerals with its unit smaller on
 * the same baseline, and a one-line label under it. The rule above each
 * figure is the only structure; there is no box behind the row.
 *
 * A `<dl>`, since each figure is the value of its label; the label comes
 * first in the markup (so it is announced first) and is drawn under the
 * figure.
 */
export function renderStats(block: StatsBlock, _ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'stats',
    'cd-figures',
    { 'data-count': String(Math.min(block.items.length, 4)) },
    'div',
    sectionHead('stats', block.title),
    h(
      'dl',
      { class: 'cd-figures__items' },
      block.items.map((item) =>
        h(
          'div',
          { class: 'cd-figures__item' },
          h('dt', { class: 'cd-figures__label' }, item.label),
          h(
            'dd',
            { class: 'cd-figures__value' },
            h('span', { class: 'cd-figures__number' }, item.value),
            optionalText('span', 'cd-figures__unit', item.unit),
          ),
        ),
      ),
    ),
  )
}
