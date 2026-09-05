import type { StatCounterBlock, StatCounterItem } from '@cogenta/blocks'
import {
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
} from '@cogenta/theme-kit'

/**
 * `blocks@2.0` (RFC 0001). Narrower than `stats` (no `unit`) — rendered the
 * same restrained "figures row" way as `stats`, one accent hairline apart:
 * this theme has no boastful, boxed "impact numbers" register to reach for.
 */
function renderItem(item: StatCounterItem): HtmlElement {
  return h(
    'div',
    { class: 'cg-tally' },
    h('dd', { class: 'cg-tally__value' }, item.value),
    h('dt', { class: 'cg-tally__label' }, item.label),
  )
}

export function renderStatCounter(block: StatCounterBlock, _ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'cg-tallies', 'data-block': 'statCounter' },
    block.title === undefined
      ? null
      : heading(
          blockHeadingTag('statCounter') ?? 'h2',
          { class: 'cg-tallies__title', 'data-field': 'title' },
          block.title,
        ),
    h('dl', { class: 'cg-tallies__items' }, block.stats.map(renderItem)),
  )
}
