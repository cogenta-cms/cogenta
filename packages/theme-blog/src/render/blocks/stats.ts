import type { StatItem, StatsBlock } from '@cogenta/blocks'
import {
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
} from '@cogenta/theme-kit'

/** A quiet, ruled `<dl>` strip — figures set in tabular numerals, labels in the small-caps-style UI sans. */
function renderItem(item: StatItem): HtmlElement {
  return h(
    'div',
    { class: 'cg-metric' },
    h('dt', { class: 'cg-metric__label' }, item.label),
    h(
      'dd',
      { class: 'cg-metric__value' },
      item.value,
      item.unit === undefined ? null : h('span', { class: 'cg-metric__unit' }, item.unit),
    ),
  )
}

export function renderStats(block: StatsBlock, _ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'cg-metrics', 'data-block': 'stats' },
    block.title === undefined
      ? null
      : heading(
          blockHeadingTag('stats') ?? 'h2',
          { class: 'cg-metrics__title', 'data-field': 'title' },
          block.title,
        ),
    h('dl', { class: 'cg-metrics__items' }, block.items.map(renderItem)),
  )
}
