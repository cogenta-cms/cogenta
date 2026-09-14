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
 * Questions before an order, in two columns on a wide screen: the title on
 * the first four, held in view while the list scrolls past it, and the
 * questions on the last seven, each under a hairline.
 *
 * Every answer is a `<details>`: it opens without a script and is found by
 * the browser's own search. The question sits in a real heading inside the
 * summary, so a screen reader's heading list still reaches every one of
 * them. The plus that turns into a minus is two hairlines drawn by the
 * stylesheet, not a glyph.
 */
export function faqItem(
  item: FaqItem,
  ctx: RenderContext,
  blockName: 'faq' | 'accordion',
  titled: boolean,
): HtmlElement {
  return h(
    'li',
    { class: 'ce-answers__item' },
    h(
      'details',
      { class: 'ce-answers__details' },
      h(
        'summary',
        { class: 'ce-answers__summary' },
        h(nestedHeadingTag(blockName, titled), { class: 'ce-answers__question' }, item.question),
        h('span', { class: 'ce-answers__mark', 'aria-hidden': 'true' }),
      ),
      h('div', { class: 'ce-answers__answer' }, renderRichText(ctx, item.answer)),
    ),
  )
}

export function renderFaq(block: FaqBlock, ctx: RenderContext): HtmlElement {
  const titled = block.title !== undefined
  return section(
    'section',
    'faq',
    'ce-answers',
    { 'data-titled': String(titled) },
    'div',
    sectionHead('faq', block.title),
    h(
      'ul',
      { class: 'ce-answers__items' },
      block.items.map((item) => faqItem(item, ctx, 'faq', titled)),
    ),
  )
}
