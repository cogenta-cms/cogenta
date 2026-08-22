import type { ProseBlock } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext, renderRichText } from '@cogenta/theme-kit'

/**
 * `prose` declares `headingLevel: 'none'`: it contributes no heading of its
 * own. Whatever headings appear come from the rich text document, whose
 * vocabulary starts at `h2`.
 *
 * The wrapper is deliberately plain — a rich text document is arbitrary
 * editorial content, and the only honest DOM shape for arbitrary content is
 * "here it is". The distinctive editorial treatment (a dropped first
 * capital, an oversized `h2`, a hairline-and-number rule before each
 * heading) lives entirely in `blocks.css`, driven off the very structure
 * `renderRichText` already produces.
 */
export function renderProse(block: ProseBlock, ctx: RenderContext): HtmlElement {
  return h(
    'div',
    { class: 'cg-block cg-prose', 'data-block': 'prose' },
    renderRichText(ctx, block.body),
  )
}
