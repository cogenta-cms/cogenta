import type { StatCounterBlock } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext } from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'

/**
 * The narrower sibling of `stats` (a value and a label, no unit), drawn in
 * the same register: figures in the display serif under one hairline.
 * Nothing counts up; a number that animates into place is a number a guest
 * has to wait for.
 */
export function renderStatCounter(block: StatCounterBlock, _ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'statCounter',
    'cr-figures',
    { 'data-count': String(Math.min(block.stats.length, 4)) },
    'div',
    sectionHead('statCounter', block.title),
    h(
      'dl',
      { class: 'cr-figures__items' },
      block.stats.map((stat) =>
        h(
          'div',
          { class: 'cr-figures__item' },
          h('dt', { class: 'cr-figures__label' }, stat.label),
          h('dd', { class: 'cr-figures__value' }, stat.value),
        ),
      ),
    ),
  )
}
