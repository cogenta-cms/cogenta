import type { MarkDefinition, RichTextDocument, RichTextNode, Span } from '@cogenta/blocks'
import type { RenderContext } from './contract.js'
import { type HtmlNode, h, text } from './html.js'
import { image } from './media.js'

/**
 * Rich text is a structured document, never HTML (contract A, ADR-0013). This
 * is the whole of a theme's mapping from that document to markup — shared so
 * portable-text parsing (mark resolution, nested lists, internal links) is
 * written once and reviewed once, not reimplemented per theme.
 *
 * `h1` cannot occur — the vocabulary starts at `h2` — so the page keeps exactly
 * one `h1` without this module having to defend against anything.
 */

type TextBlock = Extract<RichTextNode, { _type: 'block' }>

const KNOWN_MARKS: ReadonlyMap<string, string> = new Map([
  ['strong', 'strong'],
  ['em', 'em'],
  ['code', 'code'],
  // Fiche 42 task 2 — `<s>` (HTML5's own tag for "no longer accurate", the
  // closest semantic fit for a strikethrough) rather than `<del>`, which
  // means an edit-tracking deletion this is not.
  ['strikethrough', 's'],
])

function applyMark(
  ctx: RenderContext,
  mark: string,
  markDefs: readonly MarkDefinition[],
  child: HtmlNode,
): HtmlNode {
  const tag = KNOWN_MARKS.get(mark)
  if (tag !== undefined) return h(tag, {}, child)

  const definition = markDefs.find((candidate) => candidate._key === mark)
  if (definition === undefined) {
    // An annotation this theme does not know stays text. Guessing markup for it
    // is how a mark becomes an injection vector.
    return child
  }
  if (definition._type === 'link') {
    return h('a', { href: ctx.link(definition.href), rel: definition.rel }, child)
  }

  const linkHref = ctx.link({ collection: definition.collection, id: definition.id })
  // `'#'` is `RenderContext.link`'s own signal that the target could not be
  // resolved — trashed, still a draft, renamed away, or simply gone.
  // Rendering it as a live `<a>` would ship a dead link or, worse, an anchor
  // to nothing; falling back to plain text is the documented recommendation
  // ("texte simple, jamais un lien mort").
  if (linkHref === '#') return child
  return h('a', { href: linkHref }, child)
}

function renderSpan(ctx: RenderContext, span: Span, markDefs: readonly MarkDefinition[]): HtmlNode {
  let node: HtmlNode = text(span.text)
  // Applied in reverse so the first mark ends up outermost, which keeps
  // `['link', 'strong']` rendering as a link containing bold text.
  for (const mark of [...span.marks].reverse()) {
    node = applyMark(ctx, mark, markDefs, node)
  }
  return node
}

function renderChildren(ctx: RenderContext, block: TextBlock): readonly HtmlNode[] {
  return block.children.map((span) => renderSpan(ctx, span, block.markDefs))
}

function isListItem(node: RichTextNode | undefined): node is TextBlock {
  return node !== undefined && node._type === 'block' && node.listItem !== undefined
}

function levelOf(node: TextBlock): number {
  return node.level ?? 1
}

/**
 * Builds one list, and every list nested inside it, from a run of consecutive
 * list items. A nested list lives *inside* the preceding `<li>` — putting it
 * beside one produces a list whose items do not match what is announced.
 */
/** Nothing but whitespace across every span — see `buildList` for why that is not drawn. */
function isEmptyItem(node: RichTextNode): boolean {
  if (node._type !== 'block') return false
  return node.children.every((span) => span.text.trim() === '')
}

function buildList(
  ctx: RenderContext,
  nodes: RichTextDocument,
  start: number,
  level: number,
): { readonly node: HtmlNode; readonly next: number } {
  const first = nodes[start]
  if (!isListItem(first)) return { node: text(''), next: start + 1 }
  const kind = first.listItem
  const items: HtmlNode[] = []
  let index = start

  while (index < nodes.length) {
    const node = nodes[index]
    if (!isListItem(node)) break
    const nodeLevel = levelOf(node)
    if (nodeLevel < level || node.listItem !== kind) break

    if (nodeLevel > level) {
      const nested = buildList(ctx, nodes, index, nodeLevel)
      const last = items.pop()
      items.push(
        last === undefined || last.kind !== 'element'
          ? h('li', {}, nested.node)
          : h('li', last.attrs, ...last.children, nested.node),
      )
      index = nested.next
      continue
    }

    // An item with nothing in it is not rendered. Pressing Enter twice at
    // the end of a list used to leave one behind, and it reached the page as
    // an empty `<li>` — which a screen reader announces as a list item with
    // no content, and which shifts every visible bullet down by one. The
    // stored document keeps it: this decides what is worth drawing, it does
    // not delete what somebody wrote.
    const children = renderChildren(ctx, node)
    if (!isEmptyItem(node)) items.push(h('li', {}, ...children))
    index += 1
  }

  return { node: h(kind === 'number' ? 'ol' : 'ul', {}, items), next: index }
}

/**
 * The anchor a heading of running text gets (L30): its text, lower-cased,
 * accents dropped, every other run of characters a dash. Shared with the host
 * so a table of contents widget points at exactly the ids rendered here.
 */
export function headingAnchor(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
  return slug === '' ? 'section' : slug.slice(0, 80)
}

const ANCHORED_HEADINGS: ReadonlySet<string> = new Set(['h2', 'h3', 'h4'])

function renderTextBlock(
  ctx: RenderContext,
  block: TextBlock,
  anchors: Map<string, number>,
): HtmlNode {
  const children = renderChildren(ctx, block)
  if (block.style === 'blockquote') return h('blockquote', {}, h('p', {}, ...children))
  if (block.style === 'normal') return h('p', {}, ...children)
  if (ANCHORED_HEADINGS.has(block.style)) {
    const base = headingAnchor(block.children.map((child) => child.text).join(''))
    const seen = anchors.get(base) ?? 0
    anchors.set(base, seen + 1)
    return h(block.style, { id: seen === 0 ? base : `${base}-${seen + 1}` }, ...children)
  }
  return h(block.style, {}, ...children)
}

export function renderRichText(
  ctx: RenderContext,
  document: RichTextDocument,
): readonly HtmlNode[] {
  const out: HtmlNode[] = []
  const anchors = new Map<string, number>()
  let index = 0

  while (index < document.length) {
    const node = document[index]
    if (node === undefined) break

    if (isListItem(node)) {
      const list = buildList(ctx, document, index, levelOf(node))
      out.push(list.node)
      index = list.next
      continue
    }

    if (node._type === 'media') {
      out.push(
        h(
          'figure',
          { class: 'cg-prose__figure' },
          image(ctx, node.id, { sizes: '(min-width: 45rem) 40rem, 100vw' }),
          node.caption === undefined ? null : h('figcaption', {}, node.caption),
        ),
      )
      index += 1
      continue
    }

    if (node._type === 'hr') {
      // Fiche 42 task 2: no data to carry, so no branch of `applyMark`/
      // `renderSpan` is ever reachable for it — a thematic break is a bare
      // void element, the same way `media`'s `<figure>` needs no marks.
      out.push(h('hr', { class: 'cg-prose__rule' }))
      index += 1
      continue
    }

    out.push(renderTextBlock(ctx, node, anchors))
    index += 1
  }

  return out
}
