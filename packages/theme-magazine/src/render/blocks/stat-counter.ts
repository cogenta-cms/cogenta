import type { StatCounterBlock, StatCounterItem } from '@cogenta/blocks'
import {
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
} from '@cogenta/theme-kit'

/**
 * `blocks@2.0` (RFC 0001). A circulation tally, set apart from `stats`'s own
 * `cg-figures` (which carries vertical column rules and an optional `unit`):
 * `statCounter` has no `unit`, so it is laid out as a single running line —
 * each figure and its label separated only by a shared baseline rule, the
 * way a masthead prints its circulation and edition counts along one strip.
 */
function renderItem(item: StatCounterItem): HtmlElement {
  return h(
    'div',
    { class: 'cg-tally__item' },
    h('dd', { class: 'cg-tally__value' }, item.value),
    h('dt', { class: 'cg-tally__label' }, item.label),
  )
}

export function renderStatCounter(block: StatCounterBlock, _ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'cg-block cg-tally', 'data-block': 'statCounter' },
    block.title === undefined
      ? null
      : heading(
          blockHeadingTag('statCounter') ?? 'h2',
          { class: 'cg-tally__title', 'data-field': 'title' },
          block.title,
        ),
    h('dl', { class: 'cg-tally__items' }, block.stats.map(renderItem)),
  )
}
