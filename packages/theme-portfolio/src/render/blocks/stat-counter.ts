import type { StatCounterBlock, StatCounterItem } from '@cogenta/blocks'
import {
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
} from '@cogenta/theme-kit'

/**
 * Narrower than `stats` (no `unit`, RFC 0001's own reasoning), so this is not
 * `stats.ts`'s description list of labelled figures again with a field
 * dropped — it is set as a single running strip of oversized digits
 * separated by hairlines, the way a spec sheet's headline numbers run across
 * a masthead, each with its own zero-padded index the way `logos.ts` numbers
 * its marks. `stats.ts` stays the fuller, boxed "by the numbers" panel.
 */
function renderItem(item: StatCounterItem, index: number): HtmlElement {
  return h(
    'li',
    { class: 'cg-counter__item' },
    h(
      'span',
      { class: 'cg-counter__index', 'aria-hidden': 'true' },
      String(index + 1).padStart(2, '0'),
    ),
    h('span', { class: 'cg-counter__value' }, item.value),
    h('span', { class: 'cg-counter__label' }, item.label),
  )
}

export function renderStatCounter(block: StatCounterBlock, _ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'cg-block cg-counter', 'data-block': 'statCounter' },
    block.title === undefined
      ? null
      : heading(
          blockHeadingTag('statCounter') ?? 'h2',
          { class: 'cg-counter__title', 'data-field': 'title' },
          block.title,
        ),
    h(
      'ul',
      { class: 'cg-counter__items' },
      block.stats.map((item, index) => renderItem(item, index)),
    ),
  )
}
