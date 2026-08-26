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
 * Product-detail specs, materials, shipping terms — the accordion covers a
 * different editorial intent than `faq` even though the item shape
 * coincides (RFC 0001's own reasoning). It reuses the same zero-JS
 * `<details>`/`<summary>` mechanism `faq.ts` uses, but under its own class
 * names so the two can diverge visually later without one depending on the
 * other.
 */
function renderItem(item: AccordionItem, ctx: RenderContext): HtmlElement {
  return h(
    'li',
    { class: 'ce-accordion__item' },
    h(
      'details',
      { class: 'ce-accordion__details' },
      h(
        'summary',
        { class: 'ce-accordion__question' },
        h('span', { class: 'ce-accordion__question-text' }, item.question),
        h('span', { class: 'ce-accordion__marker', 'aria-hidden': 'true' }),
      ),
      h('div', { class: 'ce-accordion__answer' }, renderRichText(ctx, item.answer)),
    ),
  )
}

export function renderAccordion(block: AccordionBlock, ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'ce-block ce-accordion', 'data-block': 'accordion' },
    block.title === undefined
      ? null
      : heading(
          blockHeadingTag('accordion') ?? 'h2',
          { class: 'ce-accordion__title', 'data-field': 'title' },
          block.title,
        ),
    h(
      'ul',
      { class: 'ce-accordion__items' },
      block.items.map((item) => renderItem(item, ctx)),
    ),
  )
}
