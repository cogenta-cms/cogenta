import type { BlockElement, CustomElement, CustomText, Descendant } from './slate-types.js'

/**
 * Clean-paste (fiche 04 task 4): normalises HTML pasted from a word
 * processor into the editor's own vocabulary, rather than either losing all
 * structure (plain text) or smuggling in foreign markup (R3 — a block never
 * stores HTML or CSS).
 *
 * Kept, because the vocabulary already has a place for them: `h2`-`h4`
 * headings (`h1` demoted to `h2` — the page's `h1` is the title, never the
 * body, same as the editor's own toolbar), paragraphs, block quotes,
 * bulleted/numbered lists (nesting preserved), `strong`/`em`/`code` marks,
 * and external links.
 *
 * Dropped, because nothing in contract A's `richText` can hold them: tables,
 * images (task 3's own toolbar/drop-zone path is the supported way in),
 * horizontal rules, colours, fonts, alignment, and every `class`/`style`
 * attribute a word processor writes — Word's own `mso-*` properties and
 * Google Docs' inline `font-weight`/`font-style` spans included. Their text
 * content survives; the presentation does not.
 */

const HEADING_LEVEL: Readonly<Record<string, 'h2' | 'h3' | 'h4' | null>> = {
  h1: 'h2',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  // h5/h6 have no equivalent in the vocabulary; their text lands in a
  // paragraph rather than being dropped outright.
  h5: null,
  h6: null,
}

interface InlineMarks {
  readonly strong: boolean
  readonly em: boolean
  readonly code: boolean
}

const NO_MARKS: InlineMarks = { strong: false, em: false, code: false }

/** Word's own way of saying "this `<b>` is not actually bold" — a real quirk of its HTML export, not a hypothetical. */
function impliesNormalWeight(style: string): boolean {
  return /(?:^|;)\s*(?:mso-bidi-)?font-weight\s*:\s*normal\s*(?:;|$)/i.test(style)
}

function impliesBold(style: string): boolean {
  return /(?:^|;)\s*font-weight\s*:\s*(?:bold|[6-9]\d\d)\s*(?:;|$)/i.test(style)
}

function impliesItalic(style: string): boolean {
  return /(?:^|;)\s*font-style\s*:\s*italic\s*(?:;|$)/i.test(style)
}

function impliesMonospace(style: string): boolean {
  return /font-family\s*:\s*[^;]*(?:courier|consolas|monospace|menlo)/i.test(style)
}

function marksOf(element: Element, inherited: InlineMarks): InlineMarks {
  const tag = element.tagName.toLowerCase()
  const style = element.getAttribute('style') ?? ''

  let strong = inherited.strong
  if (tag === 'strong' || tag === 'b') strong = !impliesNormalWeight(style)
  if (impliesBold(style)) strong = true

  let em = inherited.em
  if (tag === 'em' || tag === 'i') em = true
  if (impliesItalic(style)) em = true

  let code = inherited.code
  if (tag === 'code' || tag === 'tt' || tag === 'kbd' || tag === 'samp') code = true
  if (impliesMonospace(style)) code = true

  return { strong, em, code }
}

function leaf(text: string, marks: InlineMarks): CustomText {
  return {
    text,
    ...(marks.strong ? { strong: true as const } : {}),
    ...(marks.em ? { em: true as const } : {}),
    ...(marks.code ? { code: true as const } : {}),
  }
}

/** Collects the inline runs of one block-level element: text leaves, external links, marks. */
function inlineChildren(node: Node, inherited: InlineMarks): Descendant[] {
  const out: Descendant[] = []

  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3 /* Text */) {
      const text = normaliseWhitespace(child.textContent ?? '')
      if (text !== '') out.push(leaf(text, inherited))
      continue
    }
    if (child.nodeType !== 1 /* Element */) continue
    const element = child as Element
    const tag = element.tagName.toLowerCase()

    if (tag === 'br') {
      out.push(leaf(' ', inherited))
      continue
    }
    // A list item's own nested `<ul>`/`<ol>` is walked separately by
    // `listItems`, as further list items rather than as this item's text.
    if (tag === 'ul' || tag === 'ol') continue
    // Word's own bullet/number glyph, injected as a `<span
    // style='mso-list:Ignore'>` right before a fake list paragraph's real
    // text (see `wordListParagraph`) — never part of the item's content.
    if ((element.getAttribute('style') ?? '').includes('mso-list:Ignore')) continue
    if (tag === 'a') {
      const href = element.getAttribute('href')
      const text = inlineChildren(element, marksOf(element, inherited))
      if (href === null || href.trim() === '') {
        out.push(...text)
        continue
      }
      out.push({ type: 'link', kind: 'external', href: href.trim(), children: flattenLeaves(text) })
      continue
    }
    // Any other inline or unknown element: its marks apply, its own tag does
    // not — an unrecognised element is transparent, never dropped outright,
    // so text inside a foreign wrapper (`<font>`, a Word `<span lang=...>`)
    // still comes through.
    out.push(...inlineChildren(element, marksOf(element, inherited)))
  }

  return out
}

/** A link's own children must be plain leaves — Slate does not nest an inline inside an inline. */
function flattenLeaves(nodes: readonly Descendant[]): CustomText[] {
  const leaves: CustomText[] = []
  for (const node of nodes) {
    if ('text' in node) leaves.push(node)
  }
  return leaves.length > 0 ? leaves : [{ text: '' }]
}

function normaliseWhitespace(text: string): string {
  return text.replace(/[\t\n\r]+/gu, ' ').replace(/ {2,}/gu, ' ')
}

function isEmptyInline(nodes: readonly Descendant[]): boolean {
  return nodes.every((node) => 'text' in node && node.text.trim() === '')
}

function isWhitespaceLeaf(node: Descendant): boolean {
  return 'text' in node && node.text.trim() === ''
}

/**
 * Drops purely-formatting whitespace text nodes at the edges of a block —
 * the indentation a real browser collapses to nothing when it lays out
 * `<p>\n  <span>text</span>\n</p>`, which `DOMParser` otherwise keeps as a
 * real text node either side of the meaningful content.
 */
function trimEdgeWhitespace(nodes: readonly Descendant[]): Descendant[] {
  let start = 0
  let end = nodes.length
  while (start < end && isWhitespaceLeaf(nodes[start] as Descendant)) start += 1
  while (end > start && isWhitespaceLeaf(nodes[end - 1] as Descendant)) end -= 1
  return nodes.slice(start, end)
}

function textBlock(type: BlockElement['type'], node: Node): CustomElement | null {
  const children = trimEdgeWhitespace(inlineChildren(node, NO_MARKS))
  if (isEmptyInline(children)) return null
  return { type, children: children.length > 0 ? children : [{ text: '' }] } as BlockElement
}

function listItems(list: Element, kind: 'bullet' | 'number', level: number): CustomElement[] {
  const out: CustomElement[] = []
  for (const child of Array.from(list.children)) {
    if (child.tagName.toLowerCase() !== 'li') continue
    // A nested list can appear either as a child of the `<li>` (the common
    // case) or, in some Word exports, as the `<li>`'s own next sibling at a
    // deeper indent — only the nested-child shape is structurally
    // unambiguous without guessing at indentation, so that is the one this
    // reads; the flat, mis-nested export still lands as one level, not lost.
    const nestedList = Array.from(child.children).find((candidate) =>
      ['ul', 'ol'].includes(candidate.tagName.toLowerCase()),
    )
    const ownText = trimEdgeWhitespace(inlineChildren(child, NO_MARKS))
    if (!isEmptyInline(ownText) || nestedList === undefined) {
      out.push({
        type: 'list-item',
        listType: kind,
        level,
        children: ownText.length > 0 ? ownText : [{ text: '' }],
      })
    }
    if (nestedList !== undefined) {
      const nestedKind = nestedList.tagName.toLowerCase() === 'ol' ? 'number' : 'bullet'
      out.push(...listItems(nestedList, nestedKind, level + 1))
    }
  }
  return out
}

/**
 * Word's clipboard HTML does not export a bulleted/numbered paragraph as a
 * real `<ul>`/`<ol>` — it exports a plain `<p style="mso-list:l0 level1
 * lfo1">` carrying a `<span style="mso-list:Ignore">` glyph for the marker.
 * Real Word HTML, not a hypothetical: this is what "File > Save As > Web
 * Page, Filtered" and a normal copy-paste both actually produce. Without
 * reading this shape, every bulleted paragraph in a pasted Word list would
 * silently become an ordinary paragraph.
 */
function wordListParagraph(
  element: Element,
): { readonly level: number; readonly ordered: boolean } | null {
  const style = element.getAttribute('style') ?? ''
  const match = /mso-list:\s*l\d+\s+level(\d+)/i.exec(style)
  if (match === null) return null
  const level = Number.parseInt(match[1] ?? '1', 10)

  const marker = element.querySelector<HTMLElement>('span[style*="mso-list:Ignore" i]')
  const markerText = marker?.textContent ?? ''
  const ordered = /\d/u.test(markerText)

  return { level: Number.isNaN(level) ? 1 : level, ordered }
}

function blockChildren(root: Element, level: number): CustomElement[] {
  const out: CustomElement[] = []

  for (const child of Array.from(root.children)) {
    const tag = child.tagName.toLowerCase()

    if (tag === 'p') {
      const wordList = wordListParagraph(child)
      if (wordList !== null) {
        const children = trimEdgeWhitespace(inlineChildren(child, NO_MARKS))
        if (!isEmptyInline(children)) {
          out.push({
            type: 'list-item',
            listType: wordList.ordered ? 'number' : 'bullet',
            level: wordList.level,
            children: children.length > 0 ? children : [{ text: '' }],
          })
        }
        continue
      }
    }

    if (tag in HEADING_LEVEL) {
      const style = HEADING_LEVEL[tag] ?? null
      const block = style === null ? textBlock('paragraph', child) : textBlock(style, child)
      if (block !== null) out.push(block)
      continue
    }
    if (tag === 'blockquote') {
      const block = textBlock('blockquote', child)
      if (block !== null) out.push(block)
      continue
    }
    if (tag === 'ul' || tag === 'ol') {
      out.push(...listItems(child, tag === 'ol' ? 'number' : 'bullet', 1))
      continue
    }
    if (tag === 'p' || tag === 'div') {
      // A `<div>` wrapping further block elements (a common Word/Google Docs
      // shape) is recursed into rather than flattened to one paragraph.
      const hasBlockChildren = Array.from(child.children).some((candidate) =>
        ['p', 'div', 'ul', 'ol', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(
          candidate.tagName.toLowerCase(),
        ),
      )
      if (hasBlockChildren) {
        out.push(...blockChildren(child, level))
        continue
      }
      const block = textBlock('paragraph', child)
      if (block !== null) out.push(block)
      continue
    }
    if (tag === 'br' || tag === 'hr') continue
    if (tag === 'table' || tag === 'img') continue

    // Any other block-level wrapper (`<section>`, a Word `<o:p>`…): recurse,
    // never drop its text outright.
    out.push(...blockChildren(child, level))
  }

  return out
}

/**
 * Converts pasted HTML into the editor's Slate document — the vocabulary
 * this file's own header describes. Returns `null` when there is nothing
 * usable at all, so the caller can fall back to Slate's default plain-text
 * insertion rather than inserting an empty fragment.
 */
export function htmlToSlateFragment(html: string): CustomElement[] | null {
  const parser = new DOMParser()
  const document = parser.parseFromString(html, 'text/html')
  const body = document.body
  if (body === null) return null

  const blocks = blockChildren(body, 1)
  return blocks.length === 0 ? null : blocks
}
