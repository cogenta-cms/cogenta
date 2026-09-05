import type { StatCounterBlock, StatCounterItem } from '@cogenta/blocks'
import {
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
} from '@cogenta/theme-kit'

/**
 * `blocks@2.0` (RFC 0001). Narrower than `stats` (no `unit`), and treated
 * that way here: `stats` reads as a quiet KPI strip on the page's own
 * surface, while `statCounter` is this theme's confident "impact numbers"
 * band — an accent-tinted panel of big, tabular figures, the instinct the
 * aesthetic direction already asks for on `stats` pushed one step further
 * for the narrower, single-figure shape this block offers.
 *
 * A `<dl>`, exactly like `stats`: each figure is the description of its
 * label, which is what `<dt>`/`<dd>` mean. The label sits before the figure
 * in markup, the same reading-order guarantee `stats` gives (WCAG 1.3.2);
 * the stylesheet is free to paint the big figure first.
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
