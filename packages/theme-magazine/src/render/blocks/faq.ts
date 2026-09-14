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
 * Questions and their answers, set open, the way a newspaper prints a
 * reader's guide: the title in the left three columns, and down the right
 * the questions in the display face with each answer under it, divided by
 * hairlines. Nothing is hidden behind a disclosure: a short guide is read
 * whole. (`accordion` is the collapsible form of the same content.)
 */
function renderItem(item: FaqItem, ctx: RenderContext, tag: 'h3' | 'h2'): HtmlElement {
  return h(
    'div',
    { class: 'cg-guide__item' },
    heading(tag, { class: 'cg-guide__question' }, item.question),
    h('div', { class: 'cg-guide__answer' }, renderRichText(ctx, item.answer)),
  )
}

export function renderFaq(block: FaqBlock, ctx: RenderContext): HtmlElement {
  const titled = block.title !== undefined
  return section(
    'section',
    'faq',
    'cg-guide',
    { 'data-titled': titled ? 'true' : 'false' },
    'div',
    titled
      ? h(
          'div',
          { class: 'cg-guide__head' },
          heading(
            blockHeadingTag('faq') ?? 'h2',
            { class: 'cg-guide__title', 'data-field': 'title' },
            block.title ?? '',
          ),
        )
      : null,
    h(
      'div',
      { class: 'cg-guide__items' },
      block.items.map((item) => renderItem(item, ctx, titled ? 'h3' : 'h2')),
    ),
  )
}
