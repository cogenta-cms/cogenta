import type { StatItem, StatsBlock } from '@cogenta/blocks'
import {
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
} from '@cogenta/theme-kit'

/**
 * "By the numbers" — an infographic sidebar with a real newspaper
 * `column-rule` between figures, each set in the display serif with tabular
 * numerals so a column of changing digits never shifts width.
 *
 * A description list, as in the reference theme: each figure *describes* its
 * label, which is exactly what `<dt>`/`<dd>` mean, and it survives being read
 * linearly by anything that ignores the stylesheet.
 */
function renderItem(item: StatItem): HtmlElement {
  return h(
    'div',
    { class: 'cg-figures__item' },
    h('dt', { class: 'cg-figures__label' }, item.label),
    h(
      'dd',
      { class: 'cg-figures__value' },
      item.value,
      item.unit === undefined ? null : h('span', { class: 'cg-figures__unit' }, item.unit),
    ),
  )
}

export function renderStats(block: StatsBlock, _ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'cg-block cg-figures', 'data-block': 'stats' },
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
