import type { FaqBlock, FaqItem } from '@cogenta/blocks'
import {
  type HtmlElement,
  h,
  nestedHeadingTag,
  type RenderContext,
  renderRichText,
} from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'

/**
 * Questions a buyer asks before a call, answered in the open: two columns on
 * a wide screen, each question hanging from a hairline with its answer under
 * it. Nothing to click open, because a procurement team reads every answer,
 * and the browser's own search finds all of them.
 */
function pair(item: FaqItem, ctx: RenderContext, titled: boolean): HtmlElement {
  return h(
    'div',
    { class: 'cs-faq__item' },
    h(nestedHeadingTag('faq', titled), { class: 'cs-faq__question' }, item.question),
    h('div', { class: 'cs-faq__answer' }, renderRichText(ctx, item.answer)),
  )
}

export function renderFaq(block: FaqBlock, ctx: RenderContext): HtmlElement {
  const titled = block.title !== undefined
  return section(
    'section',
    'faq',
    'cs-faq',
    { 'data-titled': String(titled) },
    'div',
    sectionHead('faq', block.title),
    h(
      'div',
      { class: 'cs-faq__items' },
      block.items.map((item) => pair(item, ctx, titled)),
    ),
  )
}
