import { EMPTY_DOCUMENT } from './convert.js'
import type { CustomElement, CustomText, Descendant } from './slate-types.js'

/**
 * The Markdown half of the source-view toggle (L21 task 5). Scoped to
 * exactly the vocabulary the editor's toolbar can produce — paragraphs,
 * `h2`-`h4`, block quotes, bulleted/numbered lists, `strong`/`em`/`code`,
 * external and internal links, the media void, and the editor-only code
 * block (`slate-types.ts`'s `CodeBlockElement`) — never a general-purpose
 * CommonMark implementation. No new dependency (R9): a hand-written scanner
 * over this closed grammar is a few hundred lines; a real Markdown parser
 * pulled in for it would be a bigger dependency than the feature.
 *
 * An internal link has no URL to write (contract A stores an entity
 * reference, not an href — `slate-types.ts`'s own comment on `LinkElement`)
 * and a media void has no source URL available client-side either, so both
 * round-trip through a private `cogenta-entry:`/`cogenta-media:` pseudo-URL
 * scheme rather than losing the reference or inventing a fetch. Neither
 * scheme is meant to resolve anywhere outside this file's own decoder.
 */

const SPECIAL_CHARS = /[\\`*_[\]]/g

function escapeMdText(text: string): string {
  return text.replace(SPECIAL_CHARS, (match) => `\\${match}`)
}

function collectPlainText(children: readonly Descendant[]): string {
  return children
    .map((child) => ('text' in child ? child.text : collectPlainText(child.children)))
    .join('')
}

function encodeLeaf(leaf: CustomText): string {
  let body =
    leaf.code === true ? '`' + leaf.text.replace(/`/g, '\\`') + '`' : escapeMdText(leaf.text)
  if (leaf.strong === true) body = `**${body}**`
  if (leaf.em === true) body = `_${body}_`
  return body
}

function encodeUrl(url: string): string {
  return /[\s)]/u.test(url) ? `<${url}>` : url
}

function encodeInline(children: readonly Descendant[]): string {
  return children
    .map((child) => {
      if ('text' in child) return encodeLeaf(child)
      if (child.type !== 'link') return ''
      const label = encodeInline(child.children)
      const href =
        child.kind === 'external'
          ? child.href
          : `cogenta-entry:${child.collection}/${child.entryId}`
      return `[${label}](${encodeUrl(href)})`
    })
    .join('')
}

/** Guards a paragraph whose first character would otherwise be read back as a block marker (`#`, `>`, a list bullet…) on the way in. */
function guardLeadingMarker(line: string): string {
  return /^(#{1,6}\s|>|[-*+]\s|\d+\.\s|```)/.test(line) ? `\\${line}` : line
}

export function slateToMarkdown(nodes: readonly CustomElement[]): string {
  const chunks: string[] = []
  let index = 0

  while (index < nodes.length) {
    const node = nodes[index]
    if (node === undefined) break

    if (node.type === 'media') {
      chunks.push(`![${escapeMdText(node.caption ?? '')}](cogenta-media:${node.mediaId})`)
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
      chunks.push(['```', ...lines, '```'].join('\n'))
      continue
    }

    if (node.type === 'list-item') {
      const lines: string[] = []
      while (index < nodes.length) {
        const current = nodes[index]
        if (current === undefined || current.type !== 'list-item') break
        const marker = current.listType === 'number' ? '1.' : '-'
        const indent = '  '.repeat(Math.max(current.level, 1) - 1)
        lines.push(`${indent}${marker} ${encodeInline(current.children)}`)
        index += 1
      }
      chunks.push(lines.join('\n'))
      continue
    }

    if (node.type === 'h2' || node.type === 'h3' || node.type === 'h4') {
      const hashes = node.type === 'h2' ? '##' : node.type === 'h3' ? '###' : '####'
      chunks.push(`${hashes} ${encodeInline(node.children)}`)
      index += 1
      continue
    }

    if (node.type === 'blockquote') {
      chunks.push(`> ${encodeInline(node.children)}`)
      index += 1
      continue
    }

    chunks.push(guardLeadingMarker(encodeInline(node.children)))
    index += 1
  }

  return chunks.join('\n\n')
}

interface Cursor {
  text: string
  pos: number
}

function isLeaf(node: Descendant): node is CustomText {
  return 'text' in node
}

function applyMark(nodes: readonly Descendant[], mark: 'strong' | 'em'): Descendant[] {
  return nodes.map((node) => (isLeaf(node) ? { ...node, [mark]: true } : node))
}

interface LinkMatch {
  readonly label: string
  readonly href: string
  readonly end: number
}

/** `[label](url)` or `[label](<url with spaces or a closing paren>)` — the CommonMark angle-bracket escape this file's own `encodeUrl` uses. */
function matchLink(text: string, pos: number): LinkMatch | null {
  if (text[pos] !== '[') return null
  const closeBracket = text.indexOf(']', pos + 1)
  if (closeBracket === -1 || text[closeBracket + 1] !== '(') return null
  const label = text.slice(pos + 1, closeBracket)
  const parenStart = closeBracket + 2

  if (text[parenStart] === '<') {
    const closeAngle = text.indexOf('>', parenStart + 1)
    if (closeAngle === -1 || text[closeAngle + 1] !== ')') return null
    return { label, href: text.slice(parenStart + 1, closeAngle), end: closeAngle + 2 }
  }

  const closeParen = text.indexOf(')', parenStart)
  if (closeParen === -1) return null
  return { label, href: text.slice(parenStart, closeParen), end: closeParen + 1 }
}

function linkFromHref(label: string, href: string): CustomElement {
  const leaves = parseInlineRun({ text: label, pos: 0 }, null).filter(isLeaf)
  const children: CustomText[] = leaves.length > 0 ? leaves : [{ text: '' }]
  if (href.startsWith('cogenta-entry:')) {
    const [collection = '', entryId = ''] = href.slice('cogenta-entry:'.length).split('/')
    return { type: 'link', kind: 'internal', collection, entryId, children }
  }
  return { type: 'link', kind: 'external', href, children }
}

/**
 * A small recursive-descent scan over exactly this file's own inline
 * grammar: backslash escapes, `` `code` `` spans (content taken literally,
 * no nested marks), `**strong**`, `_em_`, and `[label](url)` links. Marks
 * combine (`**_a_**` is both bold and italic) since a stored span can carry
 * more than one decorator; a mark opened but never closed reads back as its
 * own literal marker characters rather than swallowing the rest of the text.
 */
function parseInlineRun(cursor: Cursor, closing: '**' | '_' | null): Descendant[] {
  const nodes: Descendant[] = []
  let buffer = ''
  const flush = (): void => {
    if (buffer !== '') {
      nodes.push({ text: buffer })
      buffer = ''
    }
  }

  while (cursor.pos < cursor.text.length) {
    if (closing !== null && cursor.text.startsWith(closing, cursor.pos)) {
      cursor.pos += closing.length
      flush()
      return nodes
    }

    const ch = cursor.text[cursor.pos]

    if (ch === '\\' && cursor.pos + 1 < cursor.text.length) {
      buffer += cursor.text[cursor.pos + 1]
      cursor.pos += 2
      continue
    }

    if (ch === '`') {
      flush()
      const end = cursor.text.indexOf('`', cursor.pos + 1)
      if (end === -1) {
        buffer += ch
        cursor.pos += 1
        continue
      }
      nodes.push({ text: cursor.text.slice(cursor.pos + 1, end).replace(/\\`/g, '`'), code: true })
      cursor.pos = end + 1
      continue
    }

    if (cursor.text.startsWith('**', cursor.pos)) {
      flush()
      cursor.pos += 2
      nodes.push(...applyMark(parseInlineRun(cursor, '**'), 'strong'))
      continue
    }

    if (ch === '_') {
      flush()
      cursor.pos += 1
      nodes.push(...applyMark(parseInlineRun(cursor, '_'), 'em'))
      continue
    }

    if (ch === '[') {
      const match = matchLink(cursor.text, cursor.pos)
      if (match !== null) {
        flush()
        nodes.push(linkFromHref(match.label, match.href))
        cursor.pos = match.end
        continue
      }
    }

    buffer += ch
    cursor.pos += 1
  }

  flush()
  return nodes
}

function parseInline(text: string): Descendant[] {
  const nodes = parseInlineRun({ text, pos: 0 }, null)
  return nodes.length > 0 ? nodes : [{ text: '' }]
}

function unescapeMdText(text: string): string {
  return text.replace(/\\(.)/g, '$1')
}

const HEADING_LINE = /^(#{2,4})\s+(.*)$/
const IMAGE_LINE = /^!\[([^\]]*)\]\(cogenta-media:([^)]+)\)\s*$/
const QUOTE_LINE = /^>\s?(.*)$/
const LIST_LINE = /^(\s*)([-*+]|\d+\.)\s+(.*)$/
const BLOCK_START = /^(```|(#{2,4})\s|>\s?|(\s*)([-*+]|\d+\.)\s)/

export function markdownToSlate(markdown: string): CustomElement[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const nodes: CustomElement[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i] ?? ''
    if (line.trim() === '') {
      i += 1
      continue
    }

    if (line.startsWith('```')) {
      i += 1
      let any = false
      while (i < lines.length && !(lines[i] ?? '').startsWith('```')) {
        nodes.push({ type: 'code-block', children: [{ text: lines[i] ?? '' }] })
        any = true
        i += 1
      }
      if (!any) nodes.push({ type: 'code-block', children: [{ text: '' }] })
      if (i < lines.length) i += 1
      continue
    }

    const image = IMAGE_LINE.exec(line)
    if (image !== null) {
      const caption = unescapeMdText(image[1] ?? '')
      nodes.push({
        type: 'media',
        mediaId: image[2] ?? '',
        ...(caption === '' ? {} : { caption }),
        children: [{ text: '' }],
      })
      i += 1
      continue
    }

    const heading = HEADING_LINE.exec(line)
    if (heading !== null) {
      const level = (heading[1] ?? '').length
      const type = level === 2 ? 'h2' : level === 3 ? 'h3' : 'h4'
      nodes.push({ type, children: parseInline(heading[2] ?? '') })
      i += 1
      continue
    }

    const quote = QUOTE_LINE.exec(line)
    if (quote !== null) {
      nodes.push({ type: 'blockquote', children: parseInline(quote[1] ?? '') })
      i += 1
      continue
    }

    const item = LIST_LINE.exec(line)
    if (item !== null) {
      const level = Math.floor((item[1] ?? '').length / 2) + 1
      const listType = /^\d+\.$/.test(item[2] ?? '') ? 'number' : 'bullet'
      nodes.push({ type: 'list-item', listType, level, children: parseInline(item[3] ?? '') })
      i += 1
      continue
    }

    const paragraphLines = [line.startsWith('\\') ? line.slice(1) : line]
    i += 1
    while (i < lines.length) {
      const next = lines[i] ?? ''
      if (next.trim() === '' || BLOCK_START.test(next)) break
      paragraphLines.push(next)
      i += 1
    }
    nodes.push({ type: 'paragraph', children: parseInline(paragraphLines.join(' ')) })
  }

  return nodes.length > 0 ? nodes : EMPTY_DOCUMENT
}
