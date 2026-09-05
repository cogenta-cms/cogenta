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
 * `blocks@2.0` (RFC 0001). Shares `faq`'s `<details>`/`<summary>` mechanics —
 * the same zero-JavaScript disclosure this theme's own mobile nav toggle
 * uses — but is its own block, since "accordion" and "frequently asked
 * question" are different editorial intents even when the shape coincides.
 */
function renderItem(item: AccordionItem, ctx: RenderContext): HtmlElement {
  return h(
    'li',
    { class: 'cg-accordion__item' },
    h(
      'details',
      { class: 'cg-accordion__details' },
      h('summary', { class: 'cg-accordion__question' }, item.question),
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
      block.items.map((item) => renderItem(item, ctx)),
    ),
  )
}
