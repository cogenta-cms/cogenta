import type { StatCounterBlock, StatCounterItem } from '@cogenta/blocks'
import {
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
} from '@cogenta/theme-kit'

/**
 * `blocks@2.0` (RFC 0001). A `<dl>`, exactly like `stats`: the label sits
 * before the figure in markup (WCAG 1.3.2); the stylesheet paints the big
 * figure first.
 */
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
    { class: 'cg-block cg-kpis', 'data-block': 'statCounter' },
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
