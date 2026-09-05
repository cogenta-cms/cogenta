import type { AccordionBlock, AccordionItem } from '@cogenta/blocks'
import {
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
  renderRichText,
} from '@cogenta/theme-kit'

/** Reuses `faq`'s zero-JS `<details>` mechanics with its own class names, so the two can diverge visually later without one depending on the other. */
function renderItem(item: AccordionItem, ctx: RenderContext): HtmlElement {
  return h(
    'li',
    { class: 'cg-panels__item' },
    h(
      'details',
      { class: 'cg-panels__details' },
      h(
        'summary',
        { class: 'cg-panels__question' },
        h('span', { class: 'cg-panels__question-text' }, item.question),
        h('span', { class: 'cg-panels__chevron', 'aria-hidden': 'true' }),
      ),
      h('div', { class: 'cg-panels__answer' }, renderRichText(ctx, item.answer)),
    ),
  )
}

export function renderAccordion(block: AccordionBlock, ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'cg-panels', 'data-block': 'accordion' },
    block.title === undefined
      ? null
      : heading(
          blockHeadingTag('accordion') ?? 'h2',
          { class: 'cg-panels__title', 'data-field': 'title' },
          block.title,
        ),
    h(
      'ul',
      { class: 'cg-panels__items' },
      block.items.map((item) => renderItem(item, ctx)),
    ),
  )
}
