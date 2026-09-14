import type { FaqBlock, FaqItem } from '@cogenta/blocks'
import {
  blockHeadingTag,
  type HtmlElement,
  h,
  heading,
  type RenderContext,
  renderRichText,
} from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * Questions readers ask, in two columns: the title holds the margin (and
 * stays in view while the answers scroll past on a wide screen), the
 * questions run down the text line as ruled `<details>` rows. Opening and
 * keyboard behaviour, and the announced open state, are all native: no
 * script. The plus that turns into a minus is two hairlines drawn in CSS.
 */
function renderItem(item: FaqItem, ctx: RenderContext): HtmlElement {
  return h(
    'li',
    { class: 'cg-questions__item' },
    h(
      'details',
      { class: 'cg-questions__details' },
      h(
        'summary',
        { class: 'cg-questions__question' },
        h('span', { class: 'cg-questions__question-text' }, item.question),
        h('span', { class: 'cg-questions__mark', 'aria-hidden': 'true' }),
      ),
      h('div', { class: 'cg-questions__answer' }, renderRichText(ctx, item.answer)),
    ),
  )
}

export function renderFaq(block: FaqBlock, ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'faq',
    'cg-questions',
    { 'data-titled': block.title === undefined ? 'false' : 'true' },
    'div',
    block.title === undefined
      ? null
      : h(
          'div',
          { class: 'cg-questions__head' },
          heading(
            blockHeadingTag('faq') ?? 'h2',
            { class: 'cg-questions__title', 'data-field': 'title' },
            block.title,
          ),
        ),
    h(
      'ul',
      { class: 'cg-questions__items' },
      block.items.map((item) => renderItem(item, ctx)),
    ),
  )
}
