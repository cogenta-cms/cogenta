import type { AccordionBlock, AccordionItem } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext, renderRichText } from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'

/**
 * A set of collapsible notes on a ruled list: each question on its own row
 * in the interface face, a plus drawn from two hairlines that turns into a
 * minus when the row is open, and the answer in the reading face. Opening,
 * keyboard behaviour and the announced state are all native `<details>`. No
 * script.
 */
function renderItem(item: AccordionItem, ctx: RenderContext): HtmlElement {
  return h(
    'li',
    { class: 'cg-notes__item' },
    h(
      'details',
      { class: 'cg-notes__details' },
      h(
        'summary',
        { class: 'cg-notes__question' },
        h('span', { class: 'cg-notes__question-text' }, item.question),
        h('span', { class: 'cg-notes__mark', 'aria-hidden': 'true' }),
      ),
      h('div', { class: 'cg-notes__answer' }, renderRichText(ctx, item.answer)),
    ),
  )
}

export function renderAccordion(block: AccordionBlock, ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'accordion',
    'cg-notes',
    {},
    'div',
    sectionHead('accordion', block.title),
    h(
      'ul',
      { class: 'cg-notes__items' },
      block.items.map((item) => renderItem(item, ctx)),
    ),
  )
}
