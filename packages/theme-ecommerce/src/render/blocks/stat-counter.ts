import type { StatCounterBlock } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext } from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'

/**
 * The narrower sibling of `stats` (a value and a label, no unit), drawn in
 * the same register: figures in tabular numerals under one hairline. Nothing
 * counts up; a number that animates into place is a number a reader has to
 * wait for.
 */
export function renderStatCounter(block: StatCounterBlock, _ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'statCounter',
    'ce-figures',
    { 'data-count': String(Math.min(block.stats.length, 4)) },
    'div',
    sectionHead('statCounter', block.title),
    h(
      'dl',
      { class: 'ce-figures__items' },
      block.stats.map((stat) =>
        h(
          'div',
          { class: 'ce-figures__item' },
          h('dt', { class: 'ce-figures__label' }, stat.label),
          h('dd', { class: 'ce-figures__value' }, stat.value),
        ),
      ),
    ),
  )
}
