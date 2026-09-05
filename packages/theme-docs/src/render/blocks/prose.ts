import type { ProseBlock } from '@cogenta/blocks'
import {
  type HtmlElement,
  type HtmlNode,
  h,
  type RenderContext,
  renderRichText,
} from '@cogenta/theme-kit'

/**
 * `prose` declares `headingLevel: 'none'`: it contributes no heading of its
 * own. Whatever headings appear come from the rich text document, whose
 * vocabulary starts at `h2`.
 *
 * Contract A's rich text schema (`@cogenta/schema`, frozen) has no fenced
 * "code block" node — the only code-shaped thing it can carry is a
 * paragraph whose sole span carries the `code` mark, which
 * `renderRichText` (`@cogenta/theme-kit`) already turns into
 * `<p><code>…</code></p>`. A documentation theme without a real, multi-line
 * code block would be dishonest about what it is for, so this is the one
 * place in the theme that post-processes theme-kit's own output rather than
 * writing a second rich-text renderer: a `<p>` whose only child is a bare
 * `<code>` is promoted to `<pre><code>`, everything else is untouched. The
 * transform only ever changes two tag names on an already-escaped tree — no
 * new content is invented, and R3 (a block never stores HTML) still holds,
 * since the source is still the same structured span the editor wrote.
 */
function promoteCodeBlocks(nodes: readonly HtmlNode[]): readonly HtmlNode[] {
  return nodes.map((node) => {
    if (node.kind !== 'element') return node
    if (
      node.tag === 'p' &&
      node.children.length === 1 &&
      node.children[0]?.kind === 'element' &&
      node.children[0].tag === 'code'
    ) {
      return h('pre', { class: 'cg-prose__code' }, node.children[0])
    }
    return node
  })
}

export function renderProse(block: ProseBlock, ctx: RenderContext): HtmlElement {
  return h(
    'div',
    { class: 'cg-block cg-prose', 'data-block': 'prose' },
    promoteCodeBlocks(renderRichText(ctx, block.body)),
  )
}
