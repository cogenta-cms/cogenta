import type { StatCounterBlock, StatCounterItem } from '@cogenta/blocks'
import {
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
} from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * `blocks@2.0` (RFC 0001). Narrower than `stats` (no `unit`), and laid out as
 * its counterpart: where `stats` is a single row between vertical rules,
 * `statCounter` keeps its title in the left four columns and sets its
 * figures in a two-by-two table on the right eight, each under a horizontal
 * hairline, the way an annual report lists its headline numbers.
 *
 * A `<dl>`, with the label first in the markup for the same reading-order
 * reason as `stats`.
 */
function renderItem(item: StatCounterItem): HtmlElement {
  return h(
    'div',
    { class: 'cg-counter' },
    h('dt', { class: 'cg-counter__label' }, item.label),
    h('dd', { class: 'cg-counter__value' }, item.value),
  )
}

export function renderStatCounter(block: StatCounterBlock, _ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'statCounter',
    'cg-counters',
    { 'data-titled': block.title === undefined ? 'false' : 'true' },
    'div',
    block.title === undefined
      ? null
      : h(
          'div',
          { class: 'cg-head cg-head--aside' },
          heading(
            blockHeadingTag('statCounter') ?? 'h2',
            { class: 'cg-head__title', 'data-field': 'title' },
            block.title,
          ),
        ),
    h('dl', { class: 'cg-counters__items' }, block.stats.map(renderItem)),
  )
}
