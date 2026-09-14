import type { ProseBlock } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext, renderRichText } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * Running text, in the reading column: Source Serif at the reading size and
 * a measure of about 66 characters, subheads in the display face, a
 * blockquote set as a pull quote, figures captioned. On an article the first
 * paragraph of the first `prose` block may open on a drop cap (`article.css`,
 * keyed on `data-opening`), and only where the browser can set a real
 * initial letter.
 */
export function renderProse(block: ProseBlock, ctx: RenderContext): HtmlElement {
  return section(
    'div',
    'prose',
    'cg-prose',
    {},
    'div',
    h('div', { class: 'cg-prose__body' }, renderRichText(ctx, block.body)),
  )
}
