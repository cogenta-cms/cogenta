import type { AccordionBlock, AccordionItem } from '@cogenta/blocks'
import {
  type HtmlElement,
  h,
  nestedHeadingTag,
  type RenderContext,
  renderRichText,
} from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'

/**
 * Notes a visitor opens when they need them: what to bring, parking, the
 * safeguarding check. The title on the first four columns and the rows on the
 * last eight, each row a `<details>` under a hairline. It opens without a
 * script and is found by the browser's own search. The question sits in a
 * real heading inside the summary, so a screen reader's heading list still
 * reaches every one. The plus that becomes a minus is two bars drawn by the
 * stylesheet, not a glyph.
 */
function row(item: AccordionItem, ctx: RenderContext, titled: boolean): HtmlElement {
  return h(
    'li',
    { class: 'ca-notes__item' },
    h(
      'details',
      { class: 'ca-notes__details' },
      h(
        'summary',
        { class: 'ca-notes__summary' },
        h(nestedHeadingTag('accordion', titled), { class: 'ca-notes__question' }, item.question),
        h('span', { class: 'ca-notes__mark', 'aria-hidden': 'true' }),
      ),
      h('div', { class: 'ca-notes__answer' }, renderRichText(ctx, item.answer)),
    ),
  )
}

export function renderAccordion(block: AccordionBlock, ctx: RenderContext): HtmlElement {
  const titled = block.title !== undefined
  return section(
    'section',
    'accordion',
    'ca-notes',
    { 'data-titled': String(titled) },
    'div',
    sectionHead('accordion', block.title),
    h(
      'ul',
      { class: 'ca-notes__items' },
      block.items.map((item) => row(item, ctx, titled)),
    ),
  )
}
