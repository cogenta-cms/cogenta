/**
 * A strict, deliberately unforgiving XML parser — for the tests only.
 *
 * It exists because the escaping bugs this package must not have are invisible
 * to a snapshot test: `<title>a & b</title>` looks perfectly fine in a diff and
 * is rejected outright by every crawler. The only assertion worth making is
 * "a conforming parser accepts this and hands back the text we put in", so the
 * suite parses what the code generates.
 *
 * Written by hand rather than pulled in: rule R9 forbids a dependency where a
 * hundred lines do the job, and being strict is what matters here, not being
 * complete. It rejects — loudly — everything a lenient parser would repair:
 *
 * - a raw `&` that is not the start of a reference
 * - a raw `<` in text or in an attribute value
 * - an unquoted attribute value
 * - mismatched or unclosed tags, or more than one root element
 *
 * It knowingly does not implement: DTDs, custom entities, namespace resolution
 * (prefixes are kept verbatim in the name) and CDATA — none of which this
 * package emits, and any of which appearing in the output would be a bug worth
 * failing on.
 */

export interface ParsedElement {
  readonly name: string
  readonly attributes: Readonly<Record<string, string>>
  readonly children: readonly ParsedElement[]
  /** Concatenated text of the direct text children, entities resolved. */
  readonly text: string
}

export class XmlParseError extends Error {
  constructor(message: string, position: number) {
    super(`${message} (at offset ${position})`)
    this.name = 'XmlParseError'
  }
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

const NAME_START = /[A-Za-z_:]/
const NAME_CHAR = /[\w.:-]/

/**
 * Resolves references and rejects anything that is not one.
 *
 * This is the single most important function in the file: an unescaped `&` in a
 * URL query string is the classic invalid-sitemap bug, and a lenient parser
 * hides it by treating the stray `&` as literal text.
 */
function decodeEntities(raw: string, offset: number): string {
  let out = ''
  let index = 0

  while (index < raw.length) {
    const char = raw[index] as string
    if (char !== '&') {
      out += char
      index += 1
      continue
    }

    const end = raw.indexOf(';', index)
    if (end === -1 || end === index + 1) {
      throw new XmlParseError('bare "&" that does not begin a character reference', offset + index)
    }

    const reference = raw.slice(index + 1, end)

    if (reference.startsWith('#x') || reference.startsWith('#X')) {
      const code = Number.parseInt(reference.slice(2), 16)
      if (Number.isNaN(code)) {
        throw new XmlParseError(`malformed hex reference "&${reference};"`, offset + index)
      }
      out += String.fromCodePoint(code)
    } else if (reference.startsWith('#')) {
      const code = Number.parseInt(reference.slice(1), 10)
      if (Number.isNaN(code)) {
        throw new XmlParseError(`malformed reference "&${reference};"`, offset + index)
      }
      out += String.fromCodePoint(code)
    } else {
      const named = NAMED_ENTITIES[reference]
      if (named === undefined) {
        throw new XmlParseError(`unknown entity "&${reference};"`, offset + index)
      }
      out += named
    }

    index = end + 1
  }

  return out
}

interface Cursor {
  readonly source: string
  position: number
}

function peek(cursor: Cursor, ahead = 0): string {
  return cursor.source[cursor.position + ahead] ?? ''
}

function skipWhitespace(cursor: Cursor): void {
  while (/\s/.test(peek(cursor))) cursor.position += 1
}

function readName(cursor: Cursor): string {
  const start = cursor.position
  if (!NAME_START.test(peek(cursor))) {
    throw new XmlParseError('expected an element or attribute name', cursor.position)
  }
  cursor.position += 1
  while (NAME_CHAR.test(peek(cursor))) cursor.position += 1
  return cursor.source.slice(start, cursor.position)
}

function readAttributes(cursor: Cursor): Record<string, string> {
  const attributes: Record<string, string> = {}

  for (;;) {
    skipWhitespace(cursor)
    const char = peek(cursor)
    if (char === '>' || char === '/' || char === '') return attributes

    const name = readName(cursor)
    skipWhitespace(cursor)
    if (peek(cursor) !== '=') {
      throw new XmlParseError(`attribute "${name}" has no value`, cursor.position)
    }
    cursor.position += 1
    skipWhitespace(cursor)

    const quote = peek(cursor)
    if (quote !== '"' && quote !== "'") {
      throw new XmlParseError(`attribute "${name}" is not quoted`, cursor.position)
    }
    cursor.position += 1

    const start = cursor.position
    const end = cursor.source.indexOf(quote, start)
    if (end === -1) throw new XmlParseError(`attribute "${name}" is never closed`, start)

    const raw = cursor.source.slice(start, end)
    if (raw.includes('<')) {
      throw new XmlParseError(`attribute "${name}" contains a raw "<"`, start)
    }
    if (name in attributes) {
      throw new XmlParseError(`attribute "${name}" appears twice`, start)
    }

    attributes[name] = decodeEntities(raw, start)
    cursor.position = end + 1
  }
}

function skipProlog(cursor: Cursor): void {
  for (;;) {
    skipWhitespace(cursor)
    if (peek(cursor) !== '<') return

    const next = peek(cursor, 1)
    if (next === '?') {
      const end = cursor.source.indexOf('?>', cursor.position)
      if (end === -1)
        throw new XmlParseError('unterminated processing instruction', cursor.position)
      cursor.position = end + 2
      continue
    }
    if (next === '!' && cursor.source.startsWith('<!--', cursor.position)) {
      const end = cursor.source.indexOf('-->', cursor.position)
      if (end === -1) throw new XmlParseError('unterminated comment', cursor.position)
      cursor.position = end + 3
      continue
    }
    return
  }
}

function parseElement(cursor: Cursor): ParsedElement {
  if (peek(cursor) !== '<') throw new XmlParseError('expected an element', cursor.position)
  cursor.position += 1

  const name = readName(cursor)
  const attributes = readAttributes(cursor)

  if (peek(cursor) === '/') {
    cursor.position += 1
    if (peek(cursor) !== '>') throw new XmlParseError('malformed empty element', cursor.position)
    cursor.position += 1
    return { name, attributes, children: [], text: '' }
  }

  if (peek(cursor) !== '>') throw new XmlParseError(`unclosed start tag "${name}"`, cursor.position)
  cursor.position += 1

  const children: ParsedElement[] = []
  let text = ''

  for (;;) {
    const nextTag = cursor.source.indexOf('<', cursor.position)
    if (nextTag === -1)
      throw new XmlParseError(`element "${name}" is never closed`, cursor.position)

    text += decodeEntities(cursor.source.slice(cursor.position, nextTag), cursor.position)
    cursor.position = nextTag

    if (peek(cursor, 1) === '/') {
      cursor.position += 2
      const closing = readName(cursor)
      skipWhitespace(cursor)
      if (peek(cursor) !== '>') throw new XmlParseError('malformed end tag', cursor.position)
      cursor.position += 1
      if (closing !== name) {
        throw new XmlParseError(`"${name}" is closed by "${closing}"`, cursor.position)
      }
      // Whitespace between child elements is formatting, not content.
      return { name, attributes, children, text: children.length > 0 ? text.trim() : text }
    }

    if (cursor.source.startsWith('<!--', cursor.position)) {
      const end = cursor.source.indexOf('-->', cursor.position)
      if (end === -1) throw new XmlParseError('unterminated comment', cursor.position)
      cursor.position = end + 3
      continue
    }

    children.push(parseElement(cursor))
  }
}

/** Parses a whole document, throwing `XmlParseError` on anything malformed. */
export function parseXml(source: string): ParsedElement {
  const cursor: Cursor = { source, position: 0 }
  skipProlog(cursor)
  const root = parseElement(cursor)

  skipWhitespace(cursor)
  if (cursor.position !== source.length) {
    throw new XmlParseError('content after the root element', cursor.position)
  }
  return root
}

/** Every descendant with the given name, document order. */
export function findAll(element: ParsedElement, name: string): readonly ParsedElement[] {
  const found: ParsedElement[] = []
  const walk = (node: ParsedElement): void => {
    if (node.name === name) found.push(node)
    for (const child of node.children) walk(child)
  }
  walk(element)
  return found
}

export function findFirst(element: ParsedElement, name: string): ParsedElement | undefined {
  return findAll(element, name)[0]
}

/** The text of the first descendant with that name. Throws when absent. */
export function textOf(element: ParsedElement, name: string): string {
  const found = findFirst(element, name)
  if (found === undefined) throw new Error(`no <${name}> in <${element.name}>`)
  return found.text
}
