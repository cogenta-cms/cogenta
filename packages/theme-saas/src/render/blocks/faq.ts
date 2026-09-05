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
 *
 * Each row carries a numeral (`01`, `02`, …) ahead of the question — the
 * same indexing language `featureGrid` uses — and the disclosure affordance
 * is a plus/minus mark drawn from two CSS borders, not an icon font.
 *
 * The question is plain text inside `<summary>`, never a heading: a heading
 * nested in a `<summary>` renders inconsistently across screen readers, and
 * the questions are already reachable as a list under the block's own
 * heading.
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
