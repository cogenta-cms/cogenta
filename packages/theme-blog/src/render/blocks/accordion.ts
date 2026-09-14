import type { AccordionBlock, AccordionItem } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext, renderRichText } from '@cogenta/theme-kit'
import { ordinal, section, sectionHead } from '../layout.js'

/**
 * Numbered sections of a longer explanation. The same native `<details>`
 * mechanics as `faq`, set differently: the head spans the grid, and each
 * row carries its number in the margin, so an accordion reads as the parts
 * of one document where a FAQ reads as separate questions.
 */
function renderItem(item: AccordionItem, index: number, ctx: RenderContext): HtmlElement {
  return h(
    'li',
    { class: 'cg-parts__item' },
    h(
      'details',
      { class: 'cg-parts__details' },
      h(
        'summary',
        { class: 'cg-parts__question' },
        h('span', { class: 'cg-parts__index', 'aria-hidden': 'true' }, ordinal(index)),
        h('span', { class: 'cg-parts__question-text' }, item.question),
        h('span', { class: 'cg-parts__mark', 'aria-hidden': 'true' }),
      ),
      h('div', { class: 'cg-parts__answer' }, renderRichText(ctx, item.answer)),
    ),
  )
}

export function renderAccordion(block: AccordionBlock, ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'accordion',
    'cg-parts',
    {},
    'div',
    sectionHead('accordion', block.title),
    h(
      'ol',
      { class: 'cg-parts__items' },
      block.items.map((item, index) => renderItem(item, index, ctx)),
    ),
  )
}
