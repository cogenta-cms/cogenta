import type { StatItem, StatsBlock } from '@cogenta/blocks'
import {
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
} from '@cogenta/theme-kit'

/**
 * Social-proof numbers — order volume, review counts, years trading — read
 * with the same confidence a price tag gets: the figure in the accent
 * colour, large and tabular, the label small and quiet beneath it.
 *
 * A description list: each figure is the description of its label, exactly
 * what `<dt>`/`<dd>` mean, and it survives being read linearly. The label
 * comes first in the markup and the skin paints the figure above it —
 * reading order and visual order stay independent (WCAG 1.3.2).
 */
function renderItem(item: StatItem): HtmlElement {
  return h(
    'div',
    { class: 'ce-stat' },
    h('dt', { class: 'ce-stat__label' }, item.label),
    h(
      'dd',
      { class: 'ce-stat__value' },
      item.value,
      item.unit === undefined ? null : h('span', { class: 'ce-stat__unit' }, item.unit),
    ),
  )
}

export function renderStats(block: StatsBlock, _ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'ce-block ce-stats', 'data-block': 'stats' },
    block.title === undefined
      ? null
      : heading(
          blockHeadingTag('stats') ?? 'h2',
          { class: 'ce-stats__title', 'data-field': 'title' },
          block.title,
        ),
    h('dl', { class: 'ce-stats__items' }, block.items.map(renderItem)),
  )
}
