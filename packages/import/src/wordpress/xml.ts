import { CogentaError } from '@cogenta/core'

/**
 * A minimal XML reader, scoped to what a WordPress WXR export actually uses:
 * elements, attributes, `CDATA`, comments, the five standard entities and
 * numeric character references. Not a general XML parser — no DTD resolution,
 * no external entities, no arbitrary namespace handling beyond keeping a
 * prefixed tag name (`wp:post_id`, `content:encoded`) as one opaque string.
 *
 * `deps-auditor` rejected `fast-xml-parser` for this (single-maintainer
 * seven-package split, ~1.28 MB, published the same day) as disproportionate
 * for a narrow, well-known dialect, and flagged that a general parser's DTD
 * support is an XXE/entity-expansion surface this import — which reads a file
 * of unknown provenance (rule R8) — has no reason to carry. A document
 * declaring `<!DOCTYPE ... ENTITY` is rejected outright rather than parsed.
 */

export interface XmlElement {
  readonly type: 'element'
  readonly name: string
  readonly attrs: Readonly<Record<string, string>>
  readonly children: readonly XmlNode[]
}

export interface XmlTextNode {
  readonly type: 'text'
  readonly value: string
}

export type XmlNode = XmlElement | XmlTextNode

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
}

function parseFailure(message: string, position: number): CogentaError {
  return new CogentaError({
    code: 'IMPORT_WXR_PARSE_FAILED',
    message: `${message} (at character ${position}).`,
    hint: 'Check that the file is a WordPress "Export All Content" WXR file, not truncated or edited by hand.',
    details: { position },
  })
}

/** Standard entities and `&#NNN;` / `&#xHEX;` references. No DTD-declared entity is ever resolved. */
function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return NAMED_ENTITIES[body] ?? match
  })
}

function isNameChar(char: string | undefined): boolean {
  return char !== undefined && !/[\s/>=]/.test(char)
}

class Reader {
  private i = 0
  private readonly source: string

  constructor(source: string) {
    this.source = source
  }

  get position(): number {
    return this.i
  }

  eof(): boolean {
    return this.i >= this.source.length
  }

  peek(offset = 0): string | undefined {
    return this.source[this.i + offset]
  }

  startsWith(text: string): boolean {
    return this.source.startsWith(text, this.i)
  }

  advance(count = 1): void {
    this.i += count
  }

  skipWhitespace(): void {
    while (!this.eof() && /\s/.test(this.source[this.i] as string)) this.i++
  }

  indexOf(text: string, from = this.i): number {
    return this.source.indexOf(text, from)
  }

  slice(start: number, end: number): string {
    return this.source.slice(start, end)
  }

  charAt(index: number): string | undefined {
    return this.source[index]
  }
}

/** Scans a `<!DOCTYPE ...>` declaration, honouring a bracketed internal subset, and returns the index after its closing `>`. */
function skipDoctype(reader: Reader): { readonly end: number; readonly text: string } {
  const start = reader.position
  let depth = 0
  let i = start
  while (reader.charAt(i) !== undefined) {
    const char = reader.charAt(i)
    if (char === '[') depth++
    else if (char === ']') depth--
    else if (char === '>' && depth <= 0) return { end: i + 1, text: reader.slice(start, i) }
    i++
  }
  throw parseFailure('Unterminated <!DOCTYPE declaration', start)
}

function readTagName(reader: Reader): string {
  const start = reader.position
  while (!reader.eof() && isNameChar(reader.peek())) reader.advance()
  const name = reader.slice(start, reader.position)
  if (name.length === 0) throw parseFailure('Expected an element name', start)
  return name
}

function readAttributes(reader: Reader): Record<string, string> {
  const attrs: Record<string, string> = {}
  while (true) {
    reader.skipWhitespace()
    if (reader.eof()) throw parseFailure('Unterminated start tag', reader.position)
    if (reader.peek() === '/' || reader.peek() === '>') return attrs

    const nameStart = reader.position
    while (!reader.eof() && reader.peek() !== '=' && !/\s/.test(reader.peek() as string)) {
      if (reader.peek() === '/' || reader.peek() === '>') break
      reader.advance()
    }
    const name = reader.slice(nameStart, reader.position)
    if (name.length === 0) throw parseFailure('Expected an attribute name', nameStart)

    reader.skipWhitespace()
    if (reader.peek() !== '=') {
      attrs[name] = ''
      continue
    }
    reader.advance() // '='
    reader.skipWhitespace()
    const quote = reader.peek()
    if (quote !== '"' && quote !== "'") {
      throw parseFailure(`Attribute "${name}" value must be quoted`, reader.position)
    }
    reader.advance()
    const valueStart = reader.position
    const closeQuote = reader.indexOf(quote)
    if (closeQuote < 0) throw parseFailure(`Unterminated value for attribute "${name}"`, valueStart)
    attrs[name] = decodeEntities(reader.slice(valueStart, closeQuote))
    reader.advance(closeQuote - reader.position + 1)
  }
}

function skipMisc(reader: Reader): boolean {
  if (reader.startsWith('<!--')) {
    const end = reader.indexOf('-->')
    if (end < 0) throw parseFailure('Unterminated comment', reader.position)
    reader.advance(end - reader.position + 3)
    return true
  }
  if (reader.startsWith('<?')) {
    const end = reader.indexOf('?>')
    if (end < 0) throw parseFailure('Unterminated processing instruction', reader.position)
    reader.advance(end - reader.position + 2)
    return true
  }
  if (reader.startsWith('<!DOCTYPE')) {
    const { end, text } = skipDoctype(reader)
    if (/\bENTITY\b/.test(text)) {
      throw new CogentaError({
        code: 'IMPORT_WXR_UNSAFE_DOCUMENT',
        message: 'The document declares a DOCTYPE with an ENTITY, which is never resolved.',
        hint: 'A genuine WordPress export has no custom entities. Re-export the file rather than editing its DOCTYPE.',
      })
    }
    reader.advance(end - reader.position)
    return true
  }
  return false
}

function parseElement(reader: Reader): XmlElement {
  if (reader.peek() !== '<') throw parseFailure('Expected "<"', reader.position)
  reader.advance()
  const name = readTagName(reader)
  const attrs = readAttributes(reader)

  if (reader.peek() === '/') {
    reader.advance()
    if (reader.peek() !== '>')
      throw parseFailure(`Malformed self-closing tag <${name}>`, reader.position)
    reader.advance()
    return { type: 'element', name, attrs, children: [] }
  }
  if (reader.peek() !== '>') throw parseFailure(`Malformed start tag <${name}>`, reader.position)
  reader.advance()

  const children: XmlNode[] = []
  let text = ''

  const flushText = (): void => {
    if (text.length === 0) return
    children.push({ type: 'text', value: text })
    text = ''
  }

  while (true) {
    if (reader.eof()) throw parseFailure(`Unterminated element <${name}>`, reader.position)

    if (reader.startsWith('<![CDATA[')) {
      const end = reader.indexOf(']]>')
      if (end < 0) throw parseFailure('Unterminated CDATA section', reader.position)
      text += reader.slice(reader.position + 9, end)
      reader.advance(end - reader.position + 3)
      continue
    }

    if (reader.startsWith('</')) {
      flushText()
      const closeStart = reader.position + 2
      const closeEnd = reader.indexOf('>', closeStart)
      if (closeEnd < 0) throw parseFailure(`Unterminated closing tag for <${name}>`, closeStart)
      const closeName = reader.slice(closeStart, closeEnd).trim()
      reader.advance(closeEnd - reader.position + 1)
      if (closeName !== name) {
        throw parseFailure(
          `Mismatched closing tag: expected </${name}>, found </${closeName}>`,
          closeStart,
        )
      }
      return { type: 'element', name, attrs, children }
    }

    if (skipMisc(reader)) continue

    if (reader.peek() === '<') {
      flushText()
      children.push(parseElement(reader))
      continue
    }

    // A run of plain character data, up to the next markup — decoded as one
    // chunk so a multi-character reference like `&amp;` or `&#233;` is
    // recognised, rather than fed to the decoder one character at a time.
    const runStart = reader.position
    while (!reader.eof() && reader.peek() !== '<') reader.advance()
    text += decodeEntities(reader.slice(runStart, reader.position))
  }
}

/** Parses a whole WXR document and returns its root element (`<rss>`). */
export function parseXmlDocument(source: string): XmlElement {
  const reader = new Reader(source)
  while (!reader.eof()) {
    reader.skipWhitespace()
    if (reader.eof()) break
    if (skipMisc(reader)) continue
    if (reader.peek() === '<') return parseElement(reader)
    throw parseFailure('Expected the document root element', reader.position)
  }
  throw parseFailure('Empty document', 0)
}

export function firstChild(element: XmlElement, name: string): XmlElement | null {
  for (const child of element.children) {
    if (child.type === 'element' && child.name === name) return child
  }
  return null
}

export function children(element: XmlElement, name: string): readonly XmlElement[] {
  return element.children.filter(
    (child): child is XmlElement => child.type === 'element' && child.name === name,
  )
}

/** Direct text content only — WXR's leaf elements never mix text and child elements. */
export function textOf(element: XmlElement | null): string {
  if (element === null) return ''
  return element.children
    .filter((child): child is XmlTextNode => child.type === 'text')
    .map((child) => child.value)
    .join('')
}

export function textOfChild(element: XmlElement, name: string): string {
  return textOf(firstChild(element, name))
}
