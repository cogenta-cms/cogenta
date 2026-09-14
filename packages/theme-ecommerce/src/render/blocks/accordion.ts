import type { AccordionBlock } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext } from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'
import { faqItem } from './faq.js'

/**
 * Collapsible notes: the materials of a piece, how it is made, how to look
 * after it. The same `<details>` rows as `faq`, drawn in the same register,
 * but set narrower (columns four to ten) because an accordion usually sits
 * under a product or inside running text rather than as a section of its own.
 */
export function renderAccordion(block: AccordionBlock, ctx: RenderContext): HtmlElement {
  const titled = block.title !== undefined
  return section(
    'section',
    'accordion',
    'ce-answers',
    { 'data-titled': String(titled), 'data-variant': 'notes' },
    'div',
    sectionHead('accordion', block.title),
    h(
      'ul',
      { class: 'ce-answers__items' },
      block.items.map((item) => faqItem(item, ctx, 'accordion', titled)),
    ),
  )
}
