import type { ProseBlock } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext, renderRichText } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * A reading column set on the right-hand two thirds of the grid.
 *
 * On a wide screen the text starts at the fifth column and holds a 66ch
 * measure; a second-level heading inside the document hangs out into the
 * four columns to its left (`blocks.css`), so a long page reads as a report,
 * with its section titles in the margin, rather than as one centred column.
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
