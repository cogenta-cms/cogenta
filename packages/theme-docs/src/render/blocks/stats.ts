import type { StatItem, StatsBlock } from '@cogenta/blocks'
import {
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
} from '@cogenta/theme-kit'

/** A description list: each figure is the description of its label. */
function renderItem(item: StatItem): HtmlElement {
  return h(
    'div',
    { class: 'cg-stat' },
    h('dt', { class: 'cg-stat__label' }, item.label),
    h(
      'dd',
      { class: 'cg-stat__value' },
      item.value,
      item.unit === undefined ? null : h('span', { class: 'cg-stat__unit' }, item.unit),
    ),
  )
}

export function renderStats(block: StatsBlock, _ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'cg-block cg-stats', 'data-block': 'stats' },
    block.title === undefined
      ? null
      : heading(
          blockHeadingTag('stats') ?? 'h2',
          { class: 'cg-stats__title', 'data-field': 'title' },
          block.title,
        ),
    h('dl', { class: 'cg-stats__items' }, block.items.map(renderItem)),
  )
}
