import type { ProseBlock } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext, renderRichText } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * The reading column: from the fourth column to the tenth, held to a 68ch
 * measure, the margin to its left kept empty for the eye. A figure inside
 * the text steps out past the column on the right; a pull quote hangs its
 * opening mark in the margin (`blocks.css`).
 *
 * `prose` declares `headingLevel: 'none'`: whatever headings appear come
 * from the rich text document, whose vocabulary starts at `h2`.
 */
export function renderProse(block: ProseBlock, ctx: RenderContext): HtmlElement {
  return section(
    'div',
    'prose',
    'cg-text',
    {},
    'div',
    h('div', { class: 'cg-prose' }, renderRichText(ctx, block.body)),
  )
}
