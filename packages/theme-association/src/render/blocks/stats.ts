import type { StatItem, StatsBlock } from '@cogenta/blocks'
import {
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
} from '@cogenta/theme-kit'

/**
 * The impact band — "12,400 meals served", "380 volunteers" — rendered as a
 * description list so each big figure stays the description of its label
 * (WCAG 1.3.2). Reading order is label then figure, exactly as the markup
 * says; the stylesheet paints the figure first with `column-reverse` (see
 * `blocks.css`'s own comment on `.cg-impact-stat`) — the paint order changes,
 * the DOM order a screen reader follows does not.
 */
function renderItem(item: StatItem): HtmlElement {
  return h(
    'div',
    { class: 'cg-impact-stat' },
    h('dt', { class: 'cg-impact-stat__label' }, item.label),
    h(
      'dd',
      { class: 'cg-impact-stat__value' },
      item.value,
      item.unit === undefined ? null : h('span', { class: 'cg-impact-stat__unit' }, item.unit),
    ),
  )
}

export function renderStats(block: StatsBlock, _ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'cg-block cg-impact', 'data-block': 'stats' },
    block.title === undefined
      ? null
      : heading(
          blockHeadingTag('stats') ?? 'h2',
          { class: 'cg-impact__title', 'data-field': 'title' },
          block.title,
        ),
    h('dl', { class: 'cg-impact__items' }, block.items.map(renderItem)),
  )
}
