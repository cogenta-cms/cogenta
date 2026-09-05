import type { StatItem, StatsBlock } from '@cogenta/blocks'
import {
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
} from '@cogenta/theme-kit'

/**
 * "Since 1994 · 3 chefs · 120 seats" — a quiet row of figures set in the
 * display serif, separated by hairline rules rather than boxed into cards:
 * the restrained, editorial register this theme uses everywhere a fact is
 * stated rather than sold.
 *
 * A description list, as every built-in theme uses for `stats`: each figure
 * is the description of its label, which is what `<dt>`/`<dd>` mean, and it
 * survives being read linearly (WCAG 1.3.2 — reading order and visual order
 * stay independent regardless of how the skin repaints them).
 */
function renderItem(item: StatItem): HtmlElement {
  return h(
    'div',
    { class: 'cg-figures__item' },
    h(
      'dd',
      { class: 'cg-figures__value' },
      item.value,
      item.unit === undefined ? null : h('span', { class: 'cg-figures__unit' }, item.unit),
    ),
    h('dt', { class: 'cg-figures__label' }, item.label),
  )
}

export function renderStats(block: StatsBlock, _ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'cg-figures', 'data-block': 'stats' },
    block.title === undefined
      ? null
      : heading(
          blockHeadingTag('stats') ?? 'h2',
          { class: 'cg-figures__title', 'data-field': 'title' },
          block.title,
        ),
    h('dl', { class: 'cg-figures__items' }, block.items.map(renderItem)),
  )
}
