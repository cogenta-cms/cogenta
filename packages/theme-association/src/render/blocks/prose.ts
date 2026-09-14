import type { ProseBlock } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext, renderRichText } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * Running text: the organisation's history, how to give, how volunteering
 * works, a privacy notice.
 *
 * `prose` declares `headingLevel: 'none'`, so it adds no heading of its own;
 * the rich text's own headings start at `h2`. The column starts on the first
 * of twelve columns, on the same edge as the page title above it, and holds a
 * reading measure of about sixty-six characters. The first paragraph of the
 * first text under a page title is set a step larger, the way a report opens
 * with its summary.
 */
export function renderProse(block: ProseBlock, ctx: RenderContext): HtmlElement {
  return section(
    'div',
    'prose',
    'ca-prose',
    {},
    'div',
    h('div', { class: 'ca-prose__body' }, renderRichText(ctx, block.body)),
  )
}
