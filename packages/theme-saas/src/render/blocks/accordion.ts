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
 * `blocks@2.0` (RFC 0001). Reuses `faq`'s zero-JS `<details>`/`<summary>`
 * mechanics — expanding, keyboard operation and the expanded state
 * announced to assistive technology all come from the browser — but with a
 * markup vocabulary and class names of its own (`cg-panels`, not
 * `cg-faq`) so the two blocks can diverge visually later without one
 * depending on the other: "accordion" and "frequently asked question" are
 * different editorial intents even where the underlying question/answer
 * shape coincides.
 *
 * Where `faq` numbers its rows, this one reads as a stack of bordered
 * panels with a rotating chevron mark, closer to a features/specification
 * accordion than a support page.
 */
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
