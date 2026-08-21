import type { RichTextDocument, RichTextNode, Span } from '@cogenta/blocks'

/**
 * A deliberately small mapping from contract A's rich-text document
 * (ADR-0013: structured JSON, never HTML) to markup — paragraphs, `h2`-`h4`,
 * block quotes, flat lists, and the three inline marks the editor's toolbar
 * can actually produce (`strong`/`em`/`code`).
 *
 * Two things this starter does **not** handle, on purpose, so the file stays
 * short enough to read in one sitting: a link mark (`markDefs`, resolved
 * through `ctx.link` so a renamed or trashed target degrades to plain text
 * rather than a dead link) and a `media` node inside prose (needs
 * `ctx.image`, which this pure helper has no access to). Both are real
 * three-to-ten-line additions — see `@cogenta/theme-canonical`'s own
 * `src/render/rich-text.ts` for a complete reference implementation before
 * you write your own.
 */

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderSpan(span: Span): string {
  let out = escapeHtml(span.text)
  if (span.marks.includes('code')) out = `<code>${out}</code>`
  if (span.marks.includes('em')) out = `<em>${out}</em>`
  if (span.marks.includes('strong')) out = `<strong>${out}</strong>`
  return out
}

type TextBlock = Extract<RichTextNode, { _type: 'block' }>

function isTextBlock(node: RichTextNode): node is TextBlock {
  return node._type === 'block'
}

export function renderRichText(document: RichTextDocument): string {
  const parts: string[] = []
  let list: { readonly tag: 'ul' | 'ol'; items: string[] } | null = null

  const flushList = (): void => {
    if (list !== null) {
      parts.push(`<${list.tag}>${list.items.join('')}</${list.tag}>`)
      list = null
    }
  }

  for (const node of document) {
    if (!isTextBlock(node)) {
      // A `media` void — see the header comment above for why this starter
      // skips it rather than resolving it half-correctly.
      flushList()
      continue
    }

    const inline = node.children.map(renderSpan).join('')

    if (node.listItem !== undefined) {
      const tag = node.listItem === 'number' ? 'ol' : 'ul'
      if (list === null || list.tag !== tag) {
        flushList()
        list = { tag, items: [] }
      }
      list.items.push(`<li>${inline}</li>`)
      continue
    }

    flushList()
    if (node.style === 'blockquote') parts.push(`<blockquote>${inline}</blockquote>`)
    else if (node.style === 'h2' || node.style === 'h3' || node.style === 'h4') {
      parts.push(`<${node.style}>${inline}</${node.style}>`)
    } else parts.push(`<p>${inline}</p>`)
  }

  flushList()
  return parts.join('\n')
}
