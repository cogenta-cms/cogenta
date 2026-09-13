import type { StatItem, StatsBlock } from '@cogenta/blocks'
import {
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
} from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * Key figures as one typographic row between vertical rules: the figure in
 * the display serif with lining, tabular numerals, its unit set smaller in
 * the same face, and the label in small text beneath. No coloured band and
 * no tiles.
 *
 * A description list, because each figure is the description of its label.
 * The label comes first in the markup, so a screen reader announces what a
 * number means before the number (WCAG 1.3.2); the stylesheet paints the
 * figure above it.
 */
function renderItem(item: StatItem): HtmlElement {
  return h(
    'div',
    { class: 'cg-stat' },
    h('dt', { class: 'cg-stat__label' }, item.label),
    h(
      'dd',
      { class: 'cg-stat__value' },
      item.value,
      item.unit === undefined ? null : h('span', { class: 'cg-stat__unit' }, item.unit),
    ),
  )
}

export function renderStats(block: StatsBlock, _ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'stats',
    'cg-stats',
    {},
    'div',
    block.title === undefined
      ? null
      : h(
          'div',
          { class: 'cg-head' },
          heading(
            blockHeadingTag('stats') ?? 'h2',
            { class: 'cg-head__title', 'data-field': 'title' },
            block.title,
          ),
        ),
    h(
      'dl',
      { class: 'cg-stats__items', 'data-count': String(Math.min(block.items.length, 5)) },
      block.items.map(renderItem),
    ),
  )
}
