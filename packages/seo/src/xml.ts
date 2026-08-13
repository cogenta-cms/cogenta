import { CogentaError } from '@cogenta/core'

/**
 * XML serialisation, written by hand and on purpose (rule R9).
 *
 * The reason this file exists rather than a dependency: the whole of Cogenta's
 * XML output is four fixed document shapes — sitemap, sitemap index, RSS, Atom
 * — and the only hard part is escaping. A library would bring a parser, a DOM
 * and a stream API to solve a problem that is one substitution table wide.
 *
 * Escaping is where sitemaps and feeds actually break. A crawler does not
 * repair a malformed document: it rejects the file whole, so one article whose
 * title contains `<` silently removes every other URL in the same file from the
 * index. That failure is invisible in production — the file is served with a
 * 200 and looks fine in a browser — which is why it is tested here against a
 * real parse rather than against a snapshot.
 */

/**
 * Characters XML 1.0 forbids outright, escaped or not.
 *
 * `&#0;` is not a legal escape for a NUL: the character is simply not
 * representable, so the only correct handling is removal. Content reaches us
 * from imports and from agents, both of which produce stray control bytes, and
 * a single one of them makes the document unparsable.
 */
// Assembled from code points rather than written as a regex literal. A literal
// is what a reader would expect, and it is the one form that cannot be used: it
// puts control characters in the source, where every editor, diff and terminal
// renders them differently, and the linter rejects it for exactly that reason.
// Tab (09), newline (0A) and carriage return (0D) are absent from the ranges —
// XML allows all three, and stripping them would silently reflow content.
const ILLEGAL_XML_RANGES: readonly (readonly [number, number])[] = [
  [0x00, 0x08],
  [0x0b, 0x0c],
  [0x0e, 0x1f],
  [0xfffe, 0xffff],
]

const ILLEGAL_XML_CHARS = new RegExp(
  `[${ILLEGAL_XML_RANGES.map(
    ([from, to]) => `${String.fromCodePoint(from)}-${String.fromCodePoint(to)}`,
  ).join('')}]`,
  'gu',
)

export function stripIllegalXmlChars(value: string): string {
  return value.replace(ILLEGAL_XML_CHARS, '')
}

const TEXT_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
}

/**
 * Text content.
 *
 * `>` is escaped although it is only required inside a `]]>` run. Escaping it
 * unconditionally costs three bytes and removes the need for anyone to reason
 * about where the exception applies.
 */
export function escapeXmlText(value: string): string {
  return stripIllegalXmlChars(value).replace(/[&<>]/gu, (char) => TEXT_ESCAPES[char] ?? char)
}

const ATTRIBUTE_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
  // Attribute-value normalisation turns a literal tab, newline or carriage
  // return into a space before the application ever sees it. A title that wraps
  // would come back out of the parser silently different, so the whitespace is
  // written as a character reference, which normalisation leaves alone.
  '\t': '&#9;',
  '\n': '&#10;',
  '\r': '&#13;',
}

export function escapeXmlAttribute(value: string): string {
  return stripIllegalXmlChars(value).replace(
    /[&<>"'\t\n\r]/gu,
    (char) => ATTRIBUTE_ESCAPES[char] ?? char,
  )
}

export type XmlAttributes = Readonly<Record<string, string | number | undefined>>

export interface XmlElement {
  readonly name: string
  readonly attributes?: XmlAttributes
  /** Text content. Ignored when `children` holds anything. */
  readonly text?: string
  /** `null` entries are dropped, so a conditional child needs no array surgery. */
  readonly children?: readonly (XmlElement | null | undefined)[]
}

/**
 * A conservative subset of the XML `Name` production: ASCII letters, digits,
 * `_`, `-`, `.` and one `:` for a namespace prefix. Every tag this package
 * emits is a literal, so this only ever fires on a programming mistake — but a
 * mistake that would produce a document no crawler can read.
 */
const XML_NAME = /^[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?$/

function assertName(name: string): void {
  if (XML_NAME.test(name)) return
  throw new CogentaError({
    code: 'CONTENT_INVALID',
    message: `"${name}" is not a usable XML element or attribute name.`,
    hint: 'Element and attribute names are fixed by the feed format; they are never built from content.',
    details: { name },
  })
}

function renderAttributes(attributes: XmlAttributes | undefined): string {
  if (attributes === undefined) return ''

  let rendered = ''
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined) continue
    assertName(name)
    rendered += ` ${name}="${escapeXmlAttribute(String(value))}"`
  }
  return rendered
}

function renderElement(element: XmlElement, depth: number): string {
  assertName(element.name)

  const pad = '  '.repeat(depth)
  const open = `${pad}<${element.name}${renderAttributes(element.attributes)}`

  const children = (element.children ?? []).filter(
    (child): child is XmlElement => child !== null && child !== undefined,
  )

  if (children.length > 0) {
    const inner = children.map((child) => renderElement(child, depth + 1)).join('\n')
    return `${open}>\n${inner}\n${pad}</${element.name}>`
  }

  if (element.text !== undefined) {
    return `${open}>${escapeXmlText(element.text)}</${element.name}>`
  }

  return `${open} />`
}

/**
 * A whole document, declaration included.
 *
 * UTF-8 is stated rather than assumed: a sitemap served without a charset
 * header and without a declaration is read as US-ASCII by a conforming parser,
 * which mangles every non-Latin slug on the site.
 */
export function renderXmlDocument(root: XmlElement): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${renderElement(root, 0)}\n`
}

/** The serialised size of one element, used to keep a sitemap file under its byte budget. */
export function xmlElementByteLength(element: XmlElement, depth: number): number {
  return Buffer.byteLength(renderElement(element, depth), 'utf8')
}

/** Exposed so a caller measuring a document can measure exactly what will be written. */
export function renderXmlElement(element: XmlElement, depth = 0): string {
  return renderElement(element, depth)
}
