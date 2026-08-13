import type { ProseBlock } from '@cogenta/blocks'
import type { RenderContext } from '../../theme-contract.js'
import { type HtmlElement, h } from '../html.js'
import { renderRichText } from '../rich-text.js'

/**
 * `prose` declares `headingLevel: 'none'`: it contributes no heading of its
 * own. Whatever headings appear come from the rich text document, whose
 * vocabulary starts at `h2`.
 */
export function renderProse(block: ProseBlock, ctx: RenderContext): HtmlElement {
  return h(
    'div',
    { class: 'cg-block cg-prose', 'data-block': 'prose' },
    renderRichText(ctx, block.body),
  )
}
