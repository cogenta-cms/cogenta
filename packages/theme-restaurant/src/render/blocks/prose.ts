import type { ProseBlock } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext, renderRichText } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * Running text: the kitchen's story, how to book, a legal notice.
 *
 * `prose` declares `headingLevel: 'none'`, so it adds no heading of its own;
 * the rich text's own headings start at `h2`. The column starts at the third
 * of twelve and holds a reading measure of about sixty-four characters, so a
 * page title set at the first column and the text under it make one
 * asymmetric line rather than a centred column.
 *
 * One exception, asked for by the editor rather than guessed: a prose block
 * whose `align` variant is `center` is a welcome, a few sentences set large
 * in the display serif and centred under the opening photograph, the way a
 * menu card opens with a line from the house.
 */
export function renderProse(block: ProseBlock, ctx: RenderContext): HtmlElement {
  return section(
    'div',
    'prose',
    'cr-prose',
    {},
    'div',
    h('div', { class: 'cr-prose__body' }, renderRichText(ctx, block.body)),
  )
}
