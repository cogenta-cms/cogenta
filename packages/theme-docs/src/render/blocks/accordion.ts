import type { AccordionBlock } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext } from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'
import { renderDocsRichText } from '../rich-text.js'

/**
 * Detail a reader opens when they need it (every error code, the fields of a
 * response) as ruled rows on the reading measure.
 *
 * Every row is a `<details>`: it opens without a script, and the browser's
 * own find-in-page still reaches a closed answer. The plus that turns into a
 * minus is two hairlines drawn by the stylesheet, not a glyph.
 */
export function renderAccordion(block: AccordionBlock, ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'accordion',
    'cd-accordion',
    {},
    'div',
    sectionHead('accordion', block.title),
    h(
      'div',
      { class: 'cd-accordion__items' },
      block.items.map((item) =>
        h(
          'details',
          { class: 'cd-accordion__item' },
          h(
            'summary',
            { class: 'cd-accordion__summary' },
            h('span', { class: 'cd-accordion__question' }, item.question),
            h('span', { class: 'cd-accordion__sign', 'aria-hidden': 'true' }),
          ),
          h('div', { class: 'cd-accordion__answer cd-rich' }, renderDocsRichText(ctx, item.answer)),
        ),
      ),
    ),
  )
}
