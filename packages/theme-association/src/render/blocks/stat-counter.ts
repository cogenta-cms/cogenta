import type { StatCounterBlock, StatCounterItem } from '@cogenta/blocks'
import {
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
} from '@cogenta/theme-kit'

/**
 * `blocks@2.0` (RFC 0001). A `<dl>`, exactly like `stats` — narrower on
 * purpose (no `unit`), for one big figure and its label.
 */
function renderItem(item: StatCounterItem): HtmlElement {
  return h(
    'div',
    { class: 'cg-stat-counter' },
    h('dt', { class: 'cg-stat-counter__label' }, item.label),
    h('dd', { class: 'cg-stat-counter__value' }, item.value),
  )
}

export function renderStatCounter(block: StatCounterBlock, _ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'cg-block cg-stat-counters', 'data-block': 'statCounter' },
    block.title === undefined
      ? null
      : heading(
          blockHeadingTag('statCounter') ?? 'h2',
          { class: 'cg-stat-counters__title', 'data-field': 'title' },
          block.title,
        ),
    h('dl', { class: 'cg-stat-counters__items' }, block.stats.map(renderItem)),
  )
}
