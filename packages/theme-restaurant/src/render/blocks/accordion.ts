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
 * `blocks@2.0` (RFC 0001). `<details>`/`<summary>` — expanding, keyboard
 * operation and the expanded state announced to assistive technology all
 * come from the browser, at zero bytes of JavaScript. This theme's own
 * blueprint uses it for "Hours & location": opening hours as a small table,
 * the address, and parking — three panels a diner opens one at a time
 * rather than a wall of text under the menu.
 *
 * A thin plus/minus mark, drawn from two CSS borders rather than an icon
 * font, rotates to a single line when the panel is open.
 */
function renderItem(item: AccordionItem, ctx: RenderContext): HtmlElement {
  return h(
    'li',
    { class: 'cg-hours__item' },
    h(
      'details',
      { class: 'cg-hours__details' },
      h(
        'summary',
        { class: 'cg-hours__question' },
        h('span', { class: 'cg-hours__question-text' }, item.question),
        h('span', { class: 'cg-hours__mark', 'aria-hidden': 'true' }),
      ),
      h('div', { class: 'cg-hours__answer' }, renderRichText(ctx, item.answer)),
    ),
  )
}

export function renderAccordion(block: AccordionBlock, ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'cg-hours', 'data-block': 'accordion' },
    block.title === undefined
      ? null
      : heading(
          blockHeadingTag('accordion') ?? 'h2',
          { class: 'cg-hours__title', 'data-field': 'title' },
          block.title,
        ),
    h(
      'ul',
      { class: 'cg-hours__items' },
      block.items.map((item) => renderItem(item, ctx)),
    ),
  )
}
