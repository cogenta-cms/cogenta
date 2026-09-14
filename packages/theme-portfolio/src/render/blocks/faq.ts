import type { FaqBlock, FaqItem } from '@cogenta/blocks'
import {
  type HeadingTag,
  type HtmlElement,
  h,
  heading,
  nestedHeadingTag,
  type RenderContext,
  renderRichText,
} from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'

/**
 * Questions a client asks before a project starts, set open: the label in
 * the first three columns, and from the fourth each question in the display
 * width with its answer beside it on a wide screen, divided by hairlines.
 * Nothing is hidden behind a disclosure: a short set of answers is read
 * whole. (`accordion` is the collapsible form of the same content.)
 */
function renderItem(item: FaqItem, ctx: RenderContext, tag: HeadingTag): HtmlElement {
  return h(
    'div',
    { class: 'cg-answers__item' },
    heading(tag, { class: 'cg-answers__question' }, item.question),
    h('div', { class: 'cg-answers__answer' }, renderRichText(ctx, item.answer)),
  )
}

export function renderFaq(block: FaqBlock, ctx: RenderContext): HtmlElement {
  const titled = block.title !== undefined
  const tag = nestedHeadingTag('faq', titled)
  return section(
    'section',
    'faq',
    'cg-answers cg-split',
    { 'data-titled': titled ? 'true' : 'false' },
    'div',
    sectionHead('faq', block.title),
    h(
      'div',
      { class: 'cg-answers__items' },
      block.items.map((item) => renderItem(item, ctx, tag)),
    ),
  )
}
