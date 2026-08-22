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
 * Shipping, returns, sizing — the questions a storefront visitor actually
 * has before checking out. `<details>`/`<summary>` rather than a scripted
 * accordion: expanding, keyboard operation and the expanded state announced
 * to assistive technology all come from the browser, at zero bytes of
 * JavaScript.
 *
 * The question is plain text inside `<summary>`, not a heading: a heading
 * nested in a summary renders inconsistently across screen readers, and the
 * questions are already reachable as a list under the block's own heading.
 */
function renderItem(item: FaqItem, ctx: RenderContext): HtmlElement {
  return h(
    'li',
    { class: 'ce-faq__item' },
    h(
      'details',
      { class: 'ce-faq__details' },
      h(
        'summary',
        { class: 'ce-faq__question' },
        h('span', { class: 'ce-faq__question-text' }, item.question),
        h('span', { class: 'ce-faq__marker', 'aria-hidden': 'true' }),
      ),
      h('div', { class: 'ce-faq__answer' }, renderRichText(ctx, item.answer)),
    ),
  )
}

export function renderFaq(block: FaqBlock, ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'ce-block ce-faq', 'data-block': 'faq' },
    block.title === undefined
      ? null
      : heading(
          blockHeadingTag('faq') ?? 'h2',
          { class: 'ce-faq__title', 'data-field': 'title' },
          block.title,
        ),
    h(
      'ul',
      { class: 'ce-faq__items' },
      block.items.map((item) => renderItem(item, ctx)),
    ),
  )
}
