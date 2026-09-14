import type { FaqBlock, FaqItem } from '@cogenta/blocks'
import {
  type HtmlElement,
  h,
  heading,
  nestedHeadingTag,
  type RenderContext,
  renderRichText,
} from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'

/**
 * The questions people ask before they give an hour or a pound, answered in
 * the open: every answer is printed under its question, two columns of them
 * on a wide screen, each pair under a hairline. A charity's answers are short
 * and they are the point; hiding them behind a click makes a visitor work for
 * reassurance. (The `accordion` block is the collapsible one.)
 */
function pair(item: FaqItem, ctx: RenderContext, titled: boolean): HtmlElement {
  return h(
    'div',
    { class: 'ca-faq__item' },
    heading(nestedHeadingTag('faq', titled), { class: 'ca-faq__question' }, item.question),
    h('div', { class: 'ca-faq__answer' }, renderRichText(ctx, item.answer)),
  )
}

export function renderFaq(block: FaqBlock, ctx: RenderContext): HtmlElement {
  const titled = block.title !== undefined
  return section(
    'section',
    'faq',
    'ca-faq',
    { 'data-titled': String(titled) },
    'div',
    sectionHead('faq', block.title),
    h(
      'div',
      { class: 'ca-faq__items' },
      block.items.map((item) => pair(item, ctx, titled)),
    ),
  )
}
