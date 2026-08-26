import type { AccordionBlock, AccordionItem } from '@cogenta/blocks'
import {
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
  renderRichText,
} from '@cogenta/theme-kit'

/**
 * Same zero-JS mechanism as `faq.ts` — `<details>`/`<summary>` gives
 * expand/collapse, keyboard operation and the `[open]` state to assistive
 * technology for free — but with markup and class names of its own
 * (`cg-accordion__*`, never `cg-faq__*`) so the two blocks can diverge
 * visually later without one quietly dragging the other along. RFC 0001
 * treats them as two distinct editorial intents sharing one data shape; this
 * package keeps that distinction in its markup too.
 *
 * The marker here is a plain rotating caret rather than `faq.ts`'s plus/
 * cross, and questions sit in a numbered ledger the same way `logos.ts`'s
 * items do — an accordion reads as an indexed list of topics, not a wall of
 * frequently-asked questions.
 */
function renderItem(item: AccordionItem, ctx: RenderContext, index: number): HtmlElement {
  return h(
    'li',
    { class: 'cg-accordion__item' },
    h(
      'details',
      { class: 'cg-accordion__details' },
      h(
        'summary',
        { class: 'cg-accordion__question' },
        h(
          'span',
          { class: 'cg-accordion__index', 'aria-hidden': 'true' },
          String(index + 1).padStart(2, '0'),
        ),
        h('span', { class: 'cg-accordion__label' }, item.question),
      ),
      h('div', { class: 'cg-accordion__answer' }, renderRichText(ctx, item.answer)),
    ),
  )
}

export function renderAccordion(block: AccordionBlock, ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'cg-block cg-accordion', 'data-block': 'accordion' },
    block.title === undefined
      ? null
      : heading(
          blockHeadingTag('accordion') ?? 'h2',
          { class: 'cg-accordion__title', 'data-field': 'title' },
          block.title,
        ),
    h(
      'ul',
      { class: 'cg-accordion__items' },
      block.items.map((item, index) => renderItem(item, ctx, index)),
    ),
  )
}
