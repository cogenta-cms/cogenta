import type { StatCounterBlock, StatCounterItem } from '@cogenta/blocks'
import {
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
} from '@cogenta/theme-kit'

/**
 * A narrower cousin of `stats` (no `unit`): a big committed figure and its
 * label, meant to read as a headline number rather than a fuller statistic.
 * Same `<dt>`/`<dd>` description-list pairing `stats.ts` uses, for the same
 * reason — the figure is the description of its label, and reading order
 * stays independent of the visual order the skin paints (WCAG 1.3.2).
 */
function renderItem(item: StatCounterItem): HtmlElement {
  return h(
    'div',
    { class: 'ce-counter' },
    h('dt', { class: 'ce-counter__label' }, item.label),
    h('dd', { class: 'ce-counter__value' }, item.value),
  )
}

export function renderStatCounter(block: StatCounterBlock, _ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'ce-block ce-counters', 'data-block': 'statCounter' },
    block.title === undefined
      ? null
      : heading(
          blockHeadingTag('statCounter') ?? 'h2',
          { class: 'ce-counters__title', 'data-field': 'title' },
          block.title,
        ),
    h('dl', { class: 'ce-counters__items' }, block.stats.map(renderItem)),
  )
}
