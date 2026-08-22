import type { ProseBlock } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext, renderRichText } from '@cogenta/theme-kit'

/**
 * `prose` declares `headingLevel: 'none'` — it contributes no heading of its
 * own, and whatever headings appear come from the rich text document, whose
 * vocabulary starts at `h2`. Editorial copy (a size guide, a brand story, a
 * shipping policy) reads as a narrow, generously spaced column rather than a
 * product card, which is the one place in this theme that is deliberately
 * calm.
 */
export function renderProse(block: ProseBlock, ctx: RenderContext): HtmlElement {
  return h(
    'div',
    { class: 'ce-block ce-prose', 'data-block': 'prose' },
    renderRichText(ctx, block.body),
  )
}
