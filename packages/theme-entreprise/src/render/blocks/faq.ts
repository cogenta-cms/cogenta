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
 * Two columns: the title holds the left four and stays in view while the
 * questions, on the right eight, scroll past it. Each question is a row
 * between hairlines with a plus that turns into a minus when open.
 *
 * `<details>`/`<summary>` rather than a scripted accordion: expanding,
 * keyboard operation and the expanded state announced to assistive
 * technology all come from the browser, at zero bytes of JavaScript. The
 * question is plain text inside `<summary>`, never a heading: a heading
 * nested in a `<summary>` is announced inconsistently across screen readers.
 */
function renderItem(item: FaqItem, ctx: RenderContext): HtmlElement {
  return h(
    'li',
    { class: 'cg-faq__item' },
    h(
      'details',
      { class: 'cg-faq__details' },
      h(
        'summary',
        { class: 'cg-faq__question' },
        h('span', { class: 'cg-faq__question-text' }, item.question),
        h('span', { class: 'cg-toggle-mark', 'aria-hidden': 'true' }),
      ),
      h('div', { class: 'cg-faq__answer' }, renderRichText(ctx, item.answer)),
    ),
  )
}

export function renderFaq(block: FaqBlock, ctx: RenderContext): HtmlElement {
  return section(
    'section',
    'faq',
    'cg-faq',
    { 'data-titled': block.title === undefined ? 'false' : 'true' },
    'div',
    block.title === undefined
      ? null
      : h(
          'div',
          { class: 'cg-head cg-head--aside cg-head--sticky' },
          heading(
            blockHeadingTag('faq') ?? 'h2',
            { class: 'cg-head__title', 'data-field': 'title' },
            block.title,
          ),
        ),
    h(
      'ul',
      { class: 'cg-faq__items' },
      block.items.map((item) => renderItem(item, ctx)),
    ),
  )
}
