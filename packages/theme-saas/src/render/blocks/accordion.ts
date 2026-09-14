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
 * Collapsible detail (a list of subprocessors, what an auditor role can see,
 * the limits of a plan) as ruled rows on the first eight columns.
 *
 * Every row is a `<details>`: it opens without a script and the browser's own
 * search still finds a closed answer. The question sits in a real heading
 * inside the summary, so a screen reader's heading list reaches every one of
 * them. The plus that becomes a minus is two hairlines drawn by the
 * stylesheet, not a glyph.
 */
function row(item: AccordionItem, ctx: RenderContext, titled: boolean): HtmlElement {
  return h(
    'li',
    { class: 'cs-accordion__item' },
    h(
      'details',
      { class: 'cs-accordion__details' },
      h(
        'summary',
        { class: 'cs-accordion__summary' },
        h(
          nestedHeadingTag('accordion', titled),
          { class: 'cs-accordion__question' },
          item.question,
        ),
        h('span', { class: 'cs-accordion__mark', 'aria-hidden': 'true' }),
      ),
      h('div', { class: 'cs-accordion__answer' }, renderRichText(ctx, item.answer)),
    ),
  )
}

export function renderAccordion(block: AccordionBlock, ctx: RenderContext): HtmlElement {
  const titled = block.title !== undefined
  return section(
    'section',
    'accordion',
    'cs-accordion',
    { 'data-titled': String(titled) },
    'div',
    sectionHead('accordion', block.title),
    h(
      'ul',
      { class: 'cs-accordion__items' },
      block.items.map((item) => row(item, ctx, titled)),
    ),
  )
}
