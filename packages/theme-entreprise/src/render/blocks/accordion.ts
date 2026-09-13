import type { AccordionBlock, AccordionItem } from '@cogenta/blocks'
import {
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
  renderRichText,
} from '@cogenta/theme-kit'
import { ordinal, section } from '../layout.js'

/**
 * `blocks@2.0` (RFC 0001). The same zero-JavaScript `<details>`/`<summary>`
 * mechanics as `faq`, laid out for a different intent: a specification or a
 * method in numbered steps, across the full grid. The title sits above the
 * list rather than beside it, each row carries its ordinal in the left
 * column, and the open panel's text lines up with the question it answers.
 *
 * Class names are its own (`cg-accordion`, not `cg-faq`) so the two blocks
 * can diverge without one depending on the other.
 */
function renderItem(item: AccordionItem, index: number, ctx: RenderContext): HtmlElement {
  return h(
    'li',
    { class: 'cg-accordion__item' },
    h(
      'details',
      { class: 'cg-accordion__details' },
      h(
        'summary',
        { class: 'cg-accordion__question' },
        h('span', { class: 'cg-accordion__index', 'aria-hidden': 'true' }, ordinal(index)),
        h('span', { class: 'cg-accordion__question-text' }, item.question),
        h('span', { class: 'cg-toggle-mark', 'aria-hidden': 'true' }),
      ),
      h('div', { class: 'cg-accordion__answer' }, renderRichText(ctx, item.answer)),
    ),
  )
}

export function renderAccordion(block: AccordionBlock, ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'accordion',
    'cg-accordion',
    {},
    'div',
    block.title === undefined
      ? null
      : h(
          'div',
          { class: 'cg-head' },
          heading(
            blockHeadingTag('accordion') ?? 'h2',
            { class: 'cg-head__title', 'data-field': 'title' },
            block.title,
          ),
        ),
    h(
      'ol',
      { class: 'cg-accordion__items' },
      block.items.map((item, index) => renderItem(item, index, ctx)),
    ),
  )
}
