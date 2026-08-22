import type { ProseBlock } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext, renderRichText } from '@cogenta/theme-kit'

/**
 * `prose` declares `headingLevel: 'none'` — it contributes no heading of its
 * own, and `renderRichText` (shared, `@cogenta/theme-kit`) is what actually
 * turns the document into markup, including its embedded figures
 * (`.cg-prose__figure`, a class name that module already fixes — this file's
 * own container class has to match it).
 *
 * The drop cap and the pull-quote treatment on a nested `<blockquote>` are
 * both pure CSS, keyed off `.cg-prose > :first-child` and `.cg-prose
 * blockquote` in `blocks.css` — nothing here has to know which paragraph
 * came first.
 */
export function renderProse(block: ProseBlock, ctx: RenderContext): HtmlElement {
  return h(
    'div',
    { class: 'cg-block cg-prose', 'data-block': 'prose' },
    renderRichText(ctx, block.body),
  )
}
