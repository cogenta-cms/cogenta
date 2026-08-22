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
 * A reader-mailbag column: numbered questions set in the display serif, the
 * answer running underneath once opened. `<details>`/`<summary>` still does
 * all the work — expand/collapse, keyboard operation and the announced
 * expanded state all come from the browser at zero bytes of JavaScript,
 * exactly as in the reference theme; only the typography and the numbering
 * are this theme's own.
 */
function renderItem(item: FaqItem, ctx: RenderContext, index: number): HtmlElement {
  return h(
    'li',
    { class: 'cg-mailbag__item' },
    h(
      'details',
      { class: 'cg-mailbag__details' },
      h(
        'summary',
        { class: 'cg-mailbag__question' },
        h(
          'span',
          { class: 'cg-mailbag__number', 'aria-hidden': 'true' },
          String(index + 1).padStart(2, '0'),
        ),
        h('span', { class: 'cg-mailbag__question-text' }, item.question),
      ),
      h('div', { class: 'cg-mailbag__answer' }, renderRichText(ctx, item.answer)),
    ),
  )
}

export function renderFaq(block: FaqBlock, ctx: RenderContext): HtmlElement {
  return h(
    'section',
    { class: 'cg-block cg-mailbag', 'data-block': 'faq' },
    block.title === undefined
      ? null
      : heading(
          blockHeadingTag('faq') ?? 'h2',
          { class: 'cg-mailbag__title', 'data-field': 'title' },
          block.title,
        ),
    h(
      'ul',
      { class: 'cg-mailbag__items' },
      block.items.map((item, index) => renderItem(item, ctx, index)),
    ),
  )
}
