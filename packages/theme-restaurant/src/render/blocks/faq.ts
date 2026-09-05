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
 * `<details>`/`<summary>` — zero bytes of JavaScript. Kept visually distinct
 * from `accordion` (this theme's own "Hours & location"): each question
 * carries a small serif numeral rather than the plus/minus mark, the
 * "questions before you book" register of a restaurant's own FAQ.
 */
function renderItem(item: FaqItem, ctx: RenderContext, index: number): HtmlElement {
  const number = String(index + 1).padStart(2, '0')
  return h(
    'li',
    { class: 'cg-faq__item' },
    h(
      'details',
      { class: 'cg-faq__details' },
      h(
        'summary',
        { class: 'cg-faq__question' },
        h('span', { class: 'cg-faq__index', 'aria-hidden': 'true' }, number),
        h('span', { class: 'cg-faq__question-text' }, item.question),
      ),
      h('div', { class: 'cg-faq__answer' }, renderRichText(ctx, item.answer)),
    ),
  )
}

export function renderFaq(block: FaqBlock, ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'cg-faq', 'data-block': 'faq' },
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
      block.items.map((item, index) => renderItem(item, ctx, index)),
    ),
  )
}
