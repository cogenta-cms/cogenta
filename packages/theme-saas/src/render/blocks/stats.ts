import type { StatItem, StatsBlock } from '@cogenta/blocks'
import {
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
} from '@cogenta/theme-kit'

/**
 * The "by the numbers" strip. A description list, exactly as the canonical
 * theme uses — each figure is the description of its label, which is what
 * `<dt>`/`<dd>` mean, and it survives being read linearly — but laid out as
 * one continuous row of big, confident figures separated by vertical rules
 * (`border-inline-start` on every item but the first) rather than as
 * separate shadowed tiles: the "real KPI strip" read the aesthetic
 * direction asks for.
 *
 * The label sits above the figure in the markup and the skin is free to
 * repaint the order visually; reading order and visual order stay
 * independent either way (WCAG 1.3.2).
 */
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
