import type { FaqBlock } from '@cogenta/blocks'
import { type HtmlElement, h, nestedHeadingTag, type RenderContext } from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'
import { renderDocsRichText } from '../rich-text.js'

/**
 * Questions a reader asks before reading further ("Which databases are
 * supported"), answered in the open: no disclosure to click. The title on
 * the first four columns, the questions and answers on the last eight in two
 * columns of ruled items on a wide screen, each question a real heading so a
 * screen reader's heading list reaches it.
 */
export function renderFaq(block: FaqBlock, ctx: RenderContext): HtmlElement {
  const tag = nestedHeadingTag('faq', block.title !== undefined)
  return section(
    'section',
    'faq',
    'cd-faq',
    { 'data-titled': block.title === undefined ? 'false' : 'true' },
    'div',
    sectionHead('faq', block.title),
    h(
      'div',
      { class: 'cd-faq__items' },
      block.items.map((item) =>
        h(
          'div',
          { class: 'cd-faq__item' },
          h(tag, { class: 'cd-faq__question' }, item.question),
          h('div', { class: 'cd-faq__answer cd-rich' }, renderDocsRichText(ctx, item.answer)),
        ),
      ),
    ),
  )
}
