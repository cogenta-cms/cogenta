import type { RichTextDocument, RichTextNode, Span, VocabularyBlock } from '@cogenta/blocks'
import {
  type HtmlElement,
  type HtmlNode,
  h,
  type RenderContext,
  renderRichText,
  text,
} from '@cogenta/theme-kit'

/**
 * Running text, as a documentation site needs it.
 *
 * Contract A's rich text (ADR-0013, frozen) is a closed vocabulary: blocks in
 * `normal`/`h2`/`h3`/`h4`/`blockquote` style, list items, media, a rule; the
 * marks `strong`, `em`, `code`, `strikethrough` and links. It has no code
 * block, no note, no table and no key. A documentation theme that could show
 * none of them would not be one, so this module reads four shapes an editor
 * can already write with that vocabulary, and renders them as what they
 * plainly are. Nothing is invented: every word on the page is a word the
 * editor stored, and every other theme renders the same data as ordinary
 * paragraphs and lists. Everything else goes through `@cogenta/theme-kit`'s
 * `renderRichText`, unchanged, so links and nested lists are resolved once
 * for every theme.
 *
 * 1. **Code block.** A paragraph whose spans all carry `code`. When its first
 *    span also carries `strong` and more spans follow, that span is the
 *    block's label: a file name (`relay.yaml`) or a language (`Terminal`).
 *    Lines that start with `#` or `//` are set as comments; in a block that
 *    shows shell prompts (`$ `), the prompt is not selectable and the lines
 *    without one are set as the program's output.
 * 2. **Note.** A blockquote that opens on a bold `Note`, `Tip`, `Important`,
 *    `Warning` or `Caution`. Notes and tips take the teal rule; the rest take
 *    an ink rule, since this theme keeps a single accent colour.
 * 3. **Reference table.** A bulleted list, one level deep, where every item
 *    opens on a span marked only `code` and goes on: the code is the term
 *    (a command, a key, a flag), a run of italic text right after it is the
 *    type or default, and the rest is the description. Rendered as a
 *    definition list laid out in columns between hairlines.
 * 4. **Key.** An inline `code` span whose whole text is a key or a key chord
 *    (`Ctrl+C`, `Enter`) is set as `<kbd>`.
 *
 * Headings (`h2`, `h3`) get an `id` and link to themselves, so a reader can
 * copy the address of a section, and a documentation page can list them in
 * its table of contents.
 */

type TextBlock = Extract<RichTextNode, { _type: 'block' }>

// ---------------------------------------------------------------------------
// Heading anchors
// ---------------------------------------------------------------------------

export interface HeadingAnchor {
  readonly id: string
  readonly text: string
  readonly level: 2 | 3
}

/** Anchors by `${blockKey}:${nodeKey}`, in reading order. */
export type HeadingAnchors = ReadonlyMap<string, HeadingAnchor>

/** Ids the host or the chrome already uses on every page. */
const RESERVED_IDS: ReadonlySet<string> = new Set([
  'cg-main',
  'cd-search-header',
  'cd-search-menu',
  'cd-search-hero',
  'cd-toc-label',
])

export function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug === '' ? 'section' : slug
}

function isTextBlock(node: RichTextNode | undefined): node is TextBlock {
  return node !== undefined && node._type === 'block'
}

function plainText(node: TextBlock): string {
  return node.children.map((span) => span.text).join('')
}

/**
 * One id per `h2`/`h3` of every `prose` block on a page, unique across the
 * page: a second "Examples" becomes `examples-2`. Computed once for the whole
 * page, so the table of contents and the headings always agree.
 */
export function headingAnchors(blocks: readonly VocabularyBlock[]): HeadingAnchors {
  const used = new Set<string>(RESERVED_IDS)
  const anchors = new Map<string, HeadingAnchor>()
  for (const block of blocks) {
    if (block._type !== 'prose') continue
    for (const node of block.body) {
      if (!isTextBlock(node) || node.listItem !== undefined) continue
      if (node.style !== 'h2' && node.style !== 'h3') continue
      const label = plainText(node).trim()
      if (label === '') continue
      const base = slugify(label)
      let id = base
      for (let suffix = 2; used.has(id); suffix += 1) id = `${base}-${suffix}`
      used.add(id)
      anchors.set(`${block._key}:${node._key}`, {
        id,
        text: label,
        level: node.style === 'h2' ? 2 : 3,
      })
    }
  }
  return anchors
}

// ---------------------------------------------------------------------------
// Shape detection
// ---------------------------------------------------------------------------

function hasOnlyMarks(span: Span, allowed: readonly string[]): boolean {
  return span.marks.every((mark) => allowed.includes(mark))
}

function isCodeBlock(node: RichTextNode): boolean {
  return (
    isTextBlock(node) &&
    node.style === 'normal' &&
    node.listItem === undefined &&
    node.children.length > 0 &&
    node.children.every(
      (span) => span.marks.includes('code') && hasOnlyMarks(span, ['code', 'strong']),
    )
  )
}

const NOTE_LABEL = /^(note|tip|important|warning|caution)\s*[:.]?\s*$/i

function calloutLabel(node: RichTextNode): string | null {
  if (!isTextBlock(node) || node.style !== 'blockquote' || node.children.length < 2) return null
  const first = node.children[0]
  if (first === undefined || !first.marks.includes('strong')) return null
  const match = NOTE_LABEL.exec(first.text.trim())
  return match === null ? null : (match[1] as string)
}

function isReferenceItem(node: RichTextNode): boolean {
  if (!isTextBlock(node) || node.listItem !== 'bullet' || (node.level ?? 1) !== 1) return false
  const [first, ...rest] = node.children
  if (first === undefined || rest.length === 0) return false
  if (first.marks.length !== 1 || first.marks[0] !== 'code' || first.text.includes('\n'))
    return false
  return rest.some((span) => span.text.trim() !== '')
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

/** The inline content of one text block, through theme-kit (marks and links resolved once). */
function inline(ctx: RenderContext, node: TextBlock, spans: readonly Span[]): readonly HtmlNode[] {
  const { listItem: _listItem, level: _level, ...paragraph } = node
  const [rendered] = renderRichText(ctx, [{ ...paragraph, style: 'normal', children: [...spans] }])
  return rendered !== undefined && rendered.kind === 'element' ? rendered.children : []
}

/** Drops the separator an editor types after a label or a term. */
function trimLead(spans: readonly Span[]): readonly Span[] {
  const [first, ...rest] = spans
  if (first === undefined) return spans
  return [{ ...first, text: first.text.replace(/^[\s:.\u2013\u2014-]+/u, '') }, ...rest]
}

function codeLines(source: string): readonly HtmlNode[] {
  const lines = source.replace(/^\n+|\n+$/g, '').split('\n')
  const shell = lines.some((line) => line.startsWith('$ '))
  const nodes: HtmlNode[] = []
  // A command that ends in a backslash goes on to the next line.
  let continued = false
  lines.forEach((line, index) => {
    if (index > 0) nodes.push(text('\n'))
    const trimmed = line.trimStart()
    const wasContinued = continued
    continued = shell && (wasContinued || line.startsWith('$ ')) && line.trimEnd().endsWith('\\')
    if ((trimmed.startsWith('#') && !trimmed.startsWith('#!')) || trimmed.startsWith('//')) {
      nodes.push(h('span', { class: 'cd-code__comment' }, line))
      return
    }
    if (shell && line.startsWith('$ ')) {
      nodes.push(
        h('span', { class: 'cd-code__prompt', 'aria-hidden': 'true' }, '$ '),
        text(line.slice(2)),
      )
      return
    }
    if (wasContinued) {
      nodes.push(text(line))
      return
    }
    if (shell && line.trim() !== '') {
      nodes.push(h('span', { class: 'cd-code__output' }, line))
      return
    }
    nodes.push(text(line))
  })
  return nodes
}

function renderCodeBlock(node: TextBlock): HtmlElement {
  const [first, ...rest] = node.children
  const labelled =
    first?.marks.includes('strong') === true && rest.length > 0 && !first.text.includes('\n')
  const label = labelled ? (first as Span).text.trim() : ''
  const source = (labelled ? rest : node.children).map((span) => span.text).join('')
  const pre = h('pre', { class: 'cd-code__pre', tabindex: '0' }, h('code', {}, codeLines(source)))
  if (label === '') return h('div', { class: 'cd-code' }, pre)
  return h(
    'figure',
    { class: 'cd-code', 'data-labelled': 'true' },
    h('figcaption', { class: 'cd-code__label' }, label),
    pre,
  )
}

function renderCallout(ctx: RenderContext, node: TextBlock, label: string): HtmlElement {
  const kind = /^(note|tip)$/i.test(label) ? 'note' : 'warning'
  const normalised = label.charAt(0).toUpperCase() + label.slice(1).toLowerCase()
  return h(
    'div',
    { class: 'cd-callout', 'data-kind': kind, role: 'note' },
    h('p', { class: 'cd-callout__label' }, normalised),
    h('p', { class: 'cd-callout__text' }, inline(ctx, node, trimLead(node.children.slice(1)))),
  )
}

function renderReferenceTable(ctx: RenderContext, items: readonly TextBlock[]): HtmlElement {
  const rows = items.map((node) => {
    const [term, ...rest] = node.children as [Span, ...Span[]]
    const meta: Span[] = []
    let index = 0
    // A run of italic spans (whitespace between them allowed) right after the term.
    while (index < rest.length) {
      const span = rest[index] as Span
      if (span.marks.includes('em'))
        meta.push({ ...span, marks: span.marks.filter((m) => m !== 'em') })
      else if (span.text.trim() !== '' || meta.length === 0) break
      index += 1
    }
    const description = trimLead(rest.slice(index))
    const lastMeta = meta[meta.length - 1]
    if (lastMeta !== undefined) {
      meta[meta.length - 1] = { ...lastMeta, text: lastMeta.text.replace(/[.,;\s]+$/u, '') }
    }
    return { node, term, meta: trimLead(meta), description }
  })
  const hasMeta = rows.some((row) => row.meta.length > 0)
  return h(
    'dl',
    { class: 'cd-ref', 'data-columns': hasMeta ? '3' : '2' },
    rows.map((row) =>
      h(
        'div',
        { class: 'cd-ref__row' },
        h('dt', { class: 'cd-ref__term' }, inline(ctx, row.node, [row.term])),
        hasMeta ? h('dd', { class: 'cd-ref__meta' }, inline(ctx, row.node, row.meta)) : null,
        h('dd', { class: 'cd-ref__desc' }, inline(ctx, row.node, row.description)),
      ),
    ),
  )
}

function usesLinks(node: TextBlock): boolean {
  return node.children.some((span) =>
    span.marks.some((mark) => node.markDefs.some((d) => d._key === mark)),
  )
}

function renderHeading(ctx: RenderContext, node: TextBlock, anchor: HeadingAnchor): HtmlElement {
  const content = inline(ctx, node, node.children)
  // A heading that already holds a link cannot also be a link to itself.
  if (usesLinks(node)) return h(node.style, { id: anchor.id, class: 'cd-rich__heading' }, content)
  return h(
    node.style,
    { id: anchor.id, class: 'cd-rich__heading' },
    h('a', { class: 'cd-anchor', href: `#${anchor.id}` }, content),
  )
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

const NAMED_KEYS: ReadonlySet<string> = new Set([
  'ctrl',
  'control',
  'cmd',
  'command',
  'alt',
  'option',
  'opt',
  'shift',
  'enter',
  'return',
  'esc',
  'escape',
  'tab',
  'space',
  'backspace',
  'delete',
  'up',
  'down',
  'left',
  'right',
  'pageup',
  'pagedown',
  '⌘',
  '⌥',
  '⇧',
  '⌃',
])
const LONE_KEYS: ReadonlySet<string> = new Set([
  'enter',
  'return',
  'esc',
  'escape',
  'tab',
  'backspace',
])
const FUNCTION_KEY = /^f([1-9]|1[0-2])$/i
const CHARACTER_KEY = /^[A-Za-z0-9/.,;=\-[\]]$/

export function keyChord(value: string): readonly string[] | null {
  const parts = value.split('+')
  if (parts.some((part) => part.trim() === '')) return null
  const keys = parts.map((part) => part.trim())
  const named = (key: string): boolean =>
    NAMED_KEYS.has(key.toLowerCase()) || FUNCTION_KEY.test(key)
  if (!keys.every((key) => named(key) || CHARACTER_KEY.test(key))) return null
  if (keys.length === 1) {
    const [only] = keys as [string]
    return LONE_KEYS.has(only.toLowerCase()) || FUNCTION_KEY.test(only) ? keys : null
  }
  return keys.some(named) ? keys : null
}

function withKeys(nodes: readonly HtmlNode[]): HtmlNode[] {
  return nodes.map((node) => {
    if (node.kind !== 'element' || node.tag === 'pre') return node
    const only = node.children.length === 1 ? node.children[0] : undefined
    if (node.tag === 'code' && only !== undefined && only.kind === 'text') {
      const chord = keyChord(only.value)
      if (chord !== null) {
        const parts: HtmlNode[] = []
        chord.forEach((key, index) => {
          if (index > 0) parts.push(text('+'))
          parts.push(h('kbd', {}, key))
        })
        return h('kbd', { class: 'cd-kbd' }, parts)
      }
    }
    return { ...node, children: withKeys(node.children) }
  })
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

export interface DocsRichTextOptions {
  /** The block the document belongs to, and the page's anchors. Absent: headings get no id (a FAQ answer, say). */
  readonly anchors?: { readonly blockKey: string; readonly map: HeadingAnchors }
}

export function renderDocsRichText(
  ctx: RenderContext,
  document: RichTextDocument,
  options: DocsRichTextOptions = {},
): readonly HtmlNode[] {
  const out: HtmlNode[] = []
  let run: RichTextNode[] = []
  const flush = (): void => {
    if (run.length > 0) out.push(...renderRichText(ctx, run))
    run = []
  }

  let index = 0
  while (index < document.length) {
    const node = document[index] as RichTextNode

    if (isTextBlock(node) && isCodeBlock(node)) {
      flush()
      out.push(renderCodeBlock(node))
      index += 1
      continue
    }

    const label = calloutLabel(node)
    if (label !== null && isTextBlock(node)) {
      flush()
      out.push(renderCallout(ctx, node, label))
      index += 1
      continue
    }

    if (
      isTextBlock(node) &&
      node.listItem === undefined &&
      (node.style === 'h2' || node.style === 'h3')
    ) {
      const anchor = options.anchors?.map.get(`${options.anchors.blockKey}:${node._key}`)
      if (anchor !== undefined) {
        flush()
        out.push(renderHeading(ctx, node, anchor))
        index += 1
        continue
      }
    }

    if (isTextBlock(node) && node.listItem === 'bullet') {
      // The whole run of consecutive bullet items decides together: a list is
      // a reference table only if every one of its items has the shape.
      let end = index
      while (end < document.length) {
        const candidate = document[end]
        if (!isTextBlock(candidate) || candidate.listItem !== 'bullet') break
        end += 1
      }
      const items = document.slice(index, end)
      if (items.every(isReferenceItem)) {
        flush()
        out.push(renderReferenceTable(ctx, items as TextBlock[]))
      } else {
        run.push(...items)
      }
      index = end
      continue
    }

    run.push(node)
    index += 1
  }
  flush()
  return withKeys(out)
}
