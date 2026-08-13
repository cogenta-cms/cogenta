import type { FaqBlock, FaqItem } from '@cogenta/blocks'
import type { RenderContext } from '../../theme-contract.js'
import { blockHeadingTag, heading } from '../heading.js'
import { type HtmlElement, h } from '../html.js'
import { renderRichText } from '../rich-text.js'

/**
 * `<details>`/`<summary>` rather than a scripted accordion: expanding, keyboard
 * operation, the expanded state announced to assistive technology and in-page
 * search all come from the browser, at zero bytes of JavaScript.
 *
 * The question is plain text inside `<summary>`, not a heading: a heading
 * nested in a summary is rendered inconsistently across screen readers, and the
 * questions are already reachable as a list under the block's own heading.
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
      : heading(blockHeadingTag('faq') ?? 'h2', { class: 'cg-faq__title' }, block.title),
    h(
      'ul',
      { class: 'cg-faq__items' },
      block.items.map((item) => renderItem(item, ctx)),
    ),
  )
}
