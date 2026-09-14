import type { ProseBlock } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext, renderRichText } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * Running text: a brand story, a care guide, terms of sale.
 *
 * `prose` declares `headingLevel: 'none'`, so it adds no heading of its own;
 * the rich text's own headings start at `h2`. The column starts at the
 * fourth of twelve and holds a reading measure of about sixty-five
 * characters, so a page title set at the first column and the text under it
 * make one asymmetric line rather than a centred column.
 */
export function renderProse(block: ProseBlock, ctx: RenderContext): HtmlElement {
  return section(
    'div',
    'prose',
    'ce-prose',
    {},
    'div',
    h('div', { class: 'ce-prose__body' }, renderRichText(ctx, block.body)),
  )
}
