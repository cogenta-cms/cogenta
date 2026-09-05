import type { ProseBlock } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext, renderRichText } from '@cogenta/theme-kit'

/** `prose` declares `headingLevel: 'none'` — no heading of its own; the reading column's typography lives in `blocks.css`'s `.cg-prose` rules. */
export function renderProse(block: ProseBlock, ctx: RenderContext): HtmlElement {
  return h('div', { class: 'cg-prose', 'data-block': 'prose' }, renderRichText(ctx, block.body))
}
