import type { StatCounterBlock, StatCounterItem } from '@cogenta/blocks'
import {
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
} from '@cogenta/theme-kit'

/** A narrower, single-figure "impact numbers" band — the one block in this theme that spends a solid accent fill. */
function renderItem(item: StatCounterItem): HtmlElement {
  return h(
    'div',
    { class: 'cg-kpi' },
    h('dt', { class: 'cg-kpi__label' }, item.label),
    h('dd', { class: 'cg-kpi__value' }, item.value),
  )
}

export function renderStatCounter(block: StatCounterBlock, _ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'cg-kpis', 'data-block': 'statCounter' },
    block.title === undefined
      ? null
      : heading(
          blockHeadingTag('statCounter') ?? 'h2',
          { class: 'cg-kpis__title', 'data-field': 'title' },
          block.title,
        ),
    h('dl', { class: 'cg-kpis__items' }, block.stats.map(renderItem)),
  )
}
