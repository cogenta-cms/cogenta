import type { RichTextDocument, RichTextStyle } from '@cogenta/schema'

/**
 * A narrow HTML-fragment reader, scoped to the handful of tags WordPress
 * content actually uses and contract A's rich-text vocabulary can actually
 * represent: paragraphs, `h2`–`h4` (contract A has no `h1` in body text — see
 * `packages/schema/src/rich-text.ts`), blockquotes, lists, and the `strong`,
 * `em`, `code` and `link` marks. Anything else is dropped from the returned
 * document and named in `unknownTags`, never smuggled through as stored HTML
 * (rule R3).
 */

export interface HtmlToRichTextResult {
  readonly document: RichTextDocument
  /** Tag names this converter has no mapping for — reported, not guessed at. */
  readonly unknownTags: readonly string[]
}

let keyCounter = 0
function nextKey(prefix: string): string {
  keyCounter += 1
  return `${prefix}-${keyCounter}`
}

const HEADING_STYLE: Readonly<Record<string, RichTextStyle>> = {
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  // Contract A has no h1 in body text (the page title is the only h1) and no
  // h5/h6 at all — both fold to the closest style the vocabulary has.
  h1: 'h2',
  h5: 'h4',
  h6: 'h4',
}

const TRANSPARENT_TAGS = new Set(['p', 'div', 'span', 'figure', 'figcaption'])

interface InlineSpan {
  readonly text: string
  readonly marks: readonly string[]
  readonly href: string | null
}

/** Strips tags from an inline HTML fragment into spans carrying marks — no tag ever survives into `text`. */
function inlineToSpans(html: string, unknownTags: Set<string>): InlineSpan[] {
  const spans: InlineSpan[] = []
  const markStack: string[] = []
  let hrefStack: (string | null)[] = [null]
  let buffer = ''

  const flush = (): void => {
    if (buffer.length === 0) return
    spans.push({ text: buffer, marks: [...markStack], href: hrefStack.at(-1) ?? null })
    buffer = ''
  }

  const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g
  let last = 0
  let match: RegExpExecArray | null = tagPattern.exec(html)
  while (match !== null) {
    buffer += decodeHtmlEntities(html.slice(last, match.index))
    const isClose = match[0].startsWith('</')
    const tag = (match[1] ?? '').toLowerCase()
    const attrs = match[2] ?? ''

    if (tag === 'strong' || tag === 'b') {
      if (isClose) markStack.splice(markStack.indexOf('strong'), 1)
      else {
        flush()
        markStack.push('strong')
      }
    } else if (tag === 'em' || tag === 'i') {
      if (isClose) markStack.splice(markStack.indexOf('em'), 1)
      else {
        flush()
        markStack.push('em')
      }
    } else if (tag === 'code') {
      if (isClose) markStack.splice(markStack.indexOf('code'), 1)
      else {
        flush()
        markStack.push('code')
      }
    } else if (tag === 'a') {
      if (isClose) {
        flush()
        hrefStack.pop()
      } else {
        flush()
        const hrefMatch = /href=["']([^"']*)["']/.exec(attrs)
        hrefStack.push(hrefMatch?.[1] ?? null)
      }
    } else if (tag === 'br') {
      buffer += '\n'
    } else if (TRANSPARENT_TAGS.has(tag)) {
      // A grouping wrapper (`<p>` inside a `<blockquote>`, `<figure>`/`<figcaption>`
      // around an image caption, …) carries no rich-text-relevant meaning once
      // its content is already being flattened into spans — dropped silently,
      // not reported as unmapped.
    } else if (tag.length > 0) {
      unknownTags.add(tag)
    }

    last = tagPattern.lastIndex
    match = tagPattern.exec(html)
  }
  buffer += decodeHtmlEntities(html.slice(last))
  flush()

  hrefStack = []
  return spans.filter((span) => span.text.length > 0)
}

const HTML_NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  mdash: '—',
  ndash: '–',
  hellip: '…',
}

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return HTML_NAMED_ENTITIES[body] ?? match
  })
}

function spansToBlock(
  spans: readonly InlineSpan[],
  style: RichTextStyle,
  listItem?: 'bullet' | 'number',
): RichTextDocument[number] {
  const markDefs: { _key: string; _type: 'link'; href: string }[] = []
  const hrefKey = new Map<string, string>()

  const children = spans.map((span) => {
    const marks = [...span.marks]
    if (span.href !== null) {
      let key = hrefKey.get(span.href)
      if (key === undefined) {
        key = nextKey('link')
        hrefKey.set(span.href, key)
        markDefs.push({ _key: key, _type: 'link', href: span.href })
      }
      marks.push(key)
    }
    return { _key: nextKey('span'), _type: 'span' as const, text: span.text, marks }
  })

  const block: RichTextDocument[number] = {
    _key: nextKey('block'),
    _type: 'block',
    style,
    children,
    markDefs,
    ...(listItem === undefined ? {} : { listItem, level: 1 }),
  }
  return block
}

/**
 * Converts one HTML fragment (a Gutenberg block's inner HTML, or a classic
 * post body) into a rich-text document. Best-effort: content this converter
 * cannot map is dropped from the output and named in `unknownTags`, never
 * emitted as raw markup.
 */
export function htmlToRichText(html: string): HtmlToRichTextResult {
  const unknownTags = new Set<string>()
  const document: RichTextDocument = []

  const blockPattern = /<(p|h1|h2|h3|h4|h5|h6|blockquote|ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi
  let last = 0
  let match: RegExpExecArray | null = blockPattern.exec(html)
  let matchedAny = false

  while (match !== null) {
    matchedAny = true
    const between = html.slice(last, match.index).trim()
    if (between.length > 0) {
      const spans = inlineToSpans(between, unknownTags)
      if (spans.length > 0) document.push(spansToBlock(spans, 'normal'))
    }

    const tag = (match[1] ?? '').toLowerCase()
    const inner = match[2] ?? ''

    if (tag === 'ul' || tag === 'ol') {
      const itemPattern = /<li\b[^>]*>([\s\S]*?)<\/li>/gi
      let itemMatch: RegExpExecArray | null = itemPattern.exec(inner)
      while (itemMatch !== null) {
        const spans = inlineToSpans(itemMatch[1] ?? '', unknownTags)
        if (spans.length > 0) {
          document.push(spansToBlock(spans, 'normal', tag === 'ol' ? 'number' : 'bullet'))
        }
        itemMatch = itemPattern.exec(inner)
      }
    } else if (tag === 'blockquote') {
      const spans = inlineToSpans(inner, unknownTags)
      if (spans.length > 0) document.push(spansToBlock(spans, 'blockquote'))
    } else {
      const style = HEADING_STYLE[tag] ?? 'normal'
      const spans = inlineToSpans(inner, unknownTags)
      if (spans.length > 0) document.push(spansToBlock(spans, style))
    }

    last = blockPattern.lastIndex
    match = blockPattern.exec(html)
  }

  const rest = html.slice(last).trim()
  if (!matchedAny && rest.length > 0) {
    // Plain inline content with no block-level wrapper at all (rare, but
    // classic-editor content sometimes omits the outer <p>).
    const spans = inlineToSpans(rest, unknownTags)
    if (spans.length > 0) document.push(spansToBlock(spans, 'normal'))
  } else if (rest.length > 0) {
    const spans = inlineToSpans(rest, unknownTags)
    if (spans.length > 0) document.push(spansToBlock(spans, 'normal'))
  }

  return { document, unknownTags: [...unknownTags] }
}
