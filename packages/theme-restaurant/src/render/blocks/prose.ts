import type { ProseBlock } from '@cogenta/blocks'
import { type HtmlElement, h, type RenderContext, renderRichText } from '@cogenta/theme-kit'

/**
 * "Our story" — a short, centred, narrow column (`--cg-measure-narrow` in
 * `tokens.css`), the quiet editorial interlude every one of the reference
 * templates (Divi/Astra "Restaurant") places between the hero and the menu.
 *
 * `prose` declares `headingLevel: 'none'`: it contributes no heading of its
 * own. Whatever headings appear come from the rich text document, whose
 * vocabulary starts at `h2`.
 */
export function renderProse(block: ProseBlock, ctx: RenderContext): HtmlElement {
  return h(
    'div',
    { class: 'cg-story', 'data-block': 'prose' },
    h('div', { class: 'cg-story__body' }, renderRichText(ctx, block.body)),
  )
}
