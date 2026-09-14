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
 * Questions before a visit (a table for eight, a child's plate, a dog in the
 * room), in two columns on a wide screen: the title on the first four, and
 * the questions on the last eight, each under a hairline.
 *
 * Every answer is a `<details>`: it opens without a script and is found by
 * the browser's own search. The question sits in a real heading inside the
 * summary, so a screen reader's heading list still reaches every one of
 * them. The plus that turns into a minus is two hairlines drawn by the
 * stylesheet, not a glyph.
 */
export function answerItem(
  item: FaqItem,
  ctx: RenderContext,
  blockName: 'faq' | 'accordion',
  titled: boolean,
): HtmlElement {
  return h(
    'li',
    { class: 'cr-answers__item' },
    h(
      'details',
      { class: 'cr-answers__details' },
      h(
        'summary',
        { class: 'cr-answers__summary' },
        h(nestedHeadingTag(blockName, titled), { class: 'cr-answers__question' }, item.question),
        h('span', { class: 'cr-answers__mark', 'aria-hidden': 'true' }),
      ),
      h('div', { class: 'cr-answers__answer' }, renderRichText(ctx, item.answer)),
    ),
  )
}

export function renderFaq(block: FaqBlock, ctx: RenderContext): HtmlElement {
  const titled = block.title !== undefined
  return section(
    'section',
    'faq',
    'cr-answers',
    { 'data-titled': String(titled) },
    'div',
    sectionHead('faq', block.title),
    h(
      'ul',
      { class: 'cr-answers__items' },
      block.items.map((item) => answerItem(item, ctx, 'faq', titled)),
    ),
  )
}
