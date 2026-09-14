import type { AccordionBlock } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext } from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'
import { answerItem } from './faq.js'

/**
 * Collapsible notes: allergens, what a deposit covers, how a group menu is
 * chosen. The same `<details>` rows as `faq`, drawn in the same register, but
 * set in one narrower column under their title (the third to the tenth),
 * because an accordion usually sits inside running text rather than as a
 * section of its own.
 */
export function renderAccordion(block: AccordionBlock, ctx: RenderContext): HtmlElement {
  const titled = block.title !== undefined
  return section(
    'section',
    'accordion',
    'cr-answers',
    { 'data-titled': String(titled), 'data-variant': 'notes' },
    'div',
    sectionHead('accordion', block.title),
    h(
      'ul',
      { class: 'cr-answers__items' },
      block.items.map((item) => answerItem(item, ctx, 'accordion', titled)),
    ),
  )
}
