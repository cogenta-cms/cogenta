import type { ProseBlock } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext, renderRichText } from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * Running text: a single reading column from the first column of the grid,
 * held to a 68-character measure, so a security page, a changelog entry and
 * a legal notice read like documentation rather than a marketing banner.
 * Headings inside it start at `h2` (contract B), links are the blue, and a
 * picture inside it gets the same hairline frame as every screenshot.
 */
export function renderProse(block: ProseBlock, ctx: RenderContext): HtmlElement {
  return section(
    'div',
    'prose',
    'cs-prose',
    {},
    'div',
    h('div', { class: 'cs-prose__body' }, renderRichText(ctx, block.body)),
  )
}
