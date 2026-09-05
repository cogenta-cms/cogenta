import type { FaqBlock, FaqItem } from '@cogenta/blocks'
import {
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
  renderRichText,
} from '@cogenta/theme-kit'

/**
 * `<details>`/`<summary>` rather than a scripted accordion: expanding,
 * keyboard operation, and the expanded state announced to assistive
 * technology all come from the browser, at zero bytes of JavaScript.
 */
function renderItem(item: FaqItem, ctx: RenderContext): HtmlElement {
  return h(
    'li',
    { class: 'cg-faq__item' },
    h(
      'details',
      { class: 'cg-faq__details' },
      h('summary', { class: 'cg-faq__question' }, item.question),
      h('div', { class: 'cg-faq__answer' }, renderRichText(ctx, item.answer)),
    ),
  )
}

export function renderFaq(block: FaqBlock, ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'cg-block cg-faq', 'data-block': 'faq' },
    block.title === undefined
      ? null
      : heading(
          blockHeadingTag('faq') ?? 'h2',
          { class: 'cg-faq__title', 'data-field': 'title' },
          block.title,
        ),
    h(
      'ul',
      { class: 'cg-faq__items' },
      block.items.map((item) => renderItem(item, ctx)),
    ),
  )
}
