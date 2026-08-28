import { EMPTY_DOCUMENT } from './convert.js'
import { htmlToSlateFragment } from './paste-html.js'
import type { CustomElement, Descendant } from './slate-types.js'

/**
 * The HTML half of the source-view toggle (L21 task 5) — the other
 * direction of `paste-html.ts`'s clean-paste reader, which already turns
 * foreign HTML into this editor's vocabulary. Export builds semantic markup
 * for exactly what the toolbar can produce (`<s>` for `strikethrough` and a
 * bare `<hr>` since fiche 42 task 2, alongside the pre-existing marks/blocks);
 * import is `htmlToSlateFragment` itself, extended (see `paste-html.ts`) to
 * recognise the two shapes this file's own encoder emits that no ordinary
 * pasted document would ever contain: `<img data-media-id>` and
 * `<pre><code>`.
 *
 * Never the stored value: R3 (a block never stores HTML or CSS) is about
 * `richText`'s persisted shape, not this admin-only round trip through a
 * `<textarea>`. `slateToPortableText` still runs on whatever the person
 * switches back with, the same conversion every other path through this
 * editor uses.
 */

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;')
}

function collectPlainText(children: readonly Descendant[]): string {
  return children
    .map((child) => ('text' in child ? child.text : collectPlainText(child.children)))
    .join('')
}

function inlineToHtml(children: readonly Descendant[]): string {
  return children
    .map((child) => {
      if ('text' in child) {
        let html = escapeHtml(child.text)
        if (child.code === true) html = `<code>${html}</code>`
        if (child.em === true) html = `<em>${html}</em>`
        if (child.strong === true) html = `<strong>${html}</strong>`
        if (child.strikethrough === true) html = `<s>${html}</s>`
        return html
      }
      if (child.type !== 'link') return ''
      const label = inlineToHtml(child.children)
      if (child.kind === 'external') {
        const rel = child.rel === undefined ? '' : ` rel="${escapeAttr(child.rel)}"`
        return `<a href="${escapeAttr(child.href)}"${rel}>${label}</a>`
      }
      return (
        `<a data-collection="${escapeAttr(child.collection)}" ` +
        `data-entry-id="${escapeAttr(child.entryId)}">${label}</a>`
      )
    })
    .join('')
}

type ListItem = Extract<CustomElement, { type: 'list-item' }>

function isListItem(node: CustomElement | undefined): node is ListItem {
  return node !== undefined && node.type === 'list-item'
}

/**
 * Mirrors `theme-canonical/src/render/rich-text.ts`'s own `buildList` —
 * flat, level-tagged list items grouped into real nested `<ul>`/`<ol>`, so
 * `paste-html.ts`'s existing `listItems()` reader (already tested against
 * exactly this shape) reads it back without any change of its own.
 */
function buildList(
  nodes: readonly CustomElement[],
  start: number,
  level: number,
): { readonly html: string; readonly next: number } {
  const first = nodes[start]
  if (!isListItem(first)) return { html: '', next: start + 1 }
  const kind = first.listType
  const items: string[] = []
  let index = start

  while (index < nodes.length) {
    const node = nodes[index]
    if (!isListItem(node)) break
    if (node.level < level || node.listType !== kind) break

    if (node.level > level) {
      const nested = buildList(nodes, index, node.level)
      const last = items.pop() ?? '<li></li>'
      items.push(last.replace(/<\/li>$/, `${nested.html}</li>`))
      index = nested.next
      continue
    }

    items.push(`<li>${inlineToHtml(node.children)}</li>`)
    index += 1
  }

  const tag = kind === 'number' ? 'ol' : 'ul'
  return { html: `<${tag}>${items.join('')}</${tag}>`, next: index }
}

export function slateToHtml(nodes: readonly CustomElement[]): string {
  const parts: string[] = []
  let index = 0

  while (index < nodes.length) {
    const node = nodes[index]
    if (node === undefined) break

    if (isListItem(node)) {
      const list = buildList(nodes, index, node.level)
      parts.push(list.html)
      index = list.next
      continue
    }

    if (node.type === 'media') {
      const caption = node.caption ?? ''
      const captionAttr = node.caption === undefined ? '' : ` data-caption="${escapeAttr(caption)}"`
      parts.push(
        `<img data-media-id="${escapeAttr(node.mediaId)}" alt="${escapeAttr(caption)}"${captionAttr}>`,
      )
      index += 1
      continue
    }

    if (node.type === 'hr') {
      parts.push('<hr>')
      index += 1
      continue
    }

    if (node.type === 'code-block') {
      const lines: string[] = []
      while (index < nodes.length) {
        const current = nodes[index]
        if (current === undefined || current.type !== 'code-block') break
        lines.push(collectPlainText(current.children))
        index += 1
      }
      parts.push(`<pre><code>${escapeHtml(lines.join('\n'))}</code></pre>`)
      continue
    }

    if (node.type === 'h2' || node.type === 'h3' || node.type === 'h4') {
      parts.push(`<${node.type}>${inlineToHtml(node.children)}</${node.type}>`)
      index += 1
      continue
    }

    if (node.type === 'blockquote') {
      parts.push(`<blockquote><p>${inlineToHtml(node.children)}</p></blockquote>`)
      index += 1
      continue
    }

    parts.push(`<p>${inlineToHtml(node.children)}</p>`)
    index += 1
  }

  return parts.join('\n')
}

/** `htmlToSlateFragment` returns `null` for an empty/unusable fragment — a source view always needs a real document to hand back to the Slate editor. */
export function htmlToSlate(html: string): CustomElement[] {
  return htmlToSlateFragment(html) ?? EMPTY_DOCUMENT
}
