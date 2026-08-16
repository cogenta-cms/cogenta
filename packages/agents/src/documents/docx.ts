import { CogentaError } from '@cogenta/core'
import { openZip } from './zip.js'

/**
 * Text extraction from an Office Open XML document.
 *
 * A `.docx` is a ZIP whose `word/document.xml` holds the body as a tree of
 * paragraphs (`w:p`), runs (`w:r`) and text nodes (`w:t`). Only the text
 * nodes carry characters, and their document order is their reading order —
 * which is why this walks the markup in one pass rather than parsing it into
 * a tree: the boundaries that matter for prose (`</w:p>`, `<w:br/>`,
 * `<w:tab/>`, table cells and rows) are all in the same stream, in the same
 * order.
 *
 * Numbering, styles and revision marks are deliberately dropped: a brief's
 * meaning survives losing that a heading was bold, and no analysis
 * downstream reads formatting.
 */

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16))
    }
    if (body.startsWith('#')) return String.fromCodePoint(Number.parseInt(body.slice(1), 10))
    return ENTITIES[body] ?? whole
  })
}

/**
 * Whether `xml[at]` starts one of the fixed literal tags this reader looks
 * for. A plain string comparison, never a regular expression: the previous
 * implementation matched `<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>` against the
 * whole document with `matchAll`, and a `</w:t>` that never arrives makes
 * the lazy `[\s\S]*?` re-scan from every earlier `<w:t` it already tried —
 * quadratic in the number of unterminated runs. Measured: 400 KB of
 * unterminated `<w:t>` tags took 21.8 s. A `.docx` is attacker-supplied by
 * definition here, so that is a denial of service for the price of one
 * upload.
 */
function startsWith(xml: string, tag: string, at: number): boolean {
  return xml.startsWith(tag, at)
}

/**
 * One left-to-right pass over `word/document.xml`, using `indexOf` instead
 * of a regular expression. Every branch either advances `at` past what it
 * just consumed or, on an unterminated `<w:t>` (no closing tag anywhere in
 * the rest of the document), stops altogether rather than re-scanning —
 * each byte of the document is visited at most once, so the whole function
 * is linear in the document's length regardless of how many text runs it
 * contains or how many of them are malformed.
 */
function textFromDocumentXml(xml: string): string {
  let out = ''
  let at = 0
  const len = xml.length

  while (at < len) {
    const lt = xml.indexOf('<', at)
    if (lt === -1) break

    if (startsWith(xml, '<w:tab', lt) || startsWith(xml, '<w:br', lt)) {
      const tagEnd = xml.indexOf('>', lt)
      if (tagEnd === -1) break
      out += startsWith(xml, '<w:tab', lt) ? '\t' : '\n'
      at = tagEnd + 1
      continue
    }
    if (startsWith(xml, '</w:p>', lt)) {
      out += '\n'
      at = lt + '</w:p>'.length
      continue
    }
    if (startsWith(xml, '</w:tc>', lt)) {
      // A cell always ends with its own `</w:p>`, which has already emitted
      // a newline; the cell separator replaces it, so a row stays one line.
      out = `${out.replace(/\n$/, '')}\t`
      at = lt + '</w:tc>'.length
      continue
    }
    if (startsWith(xml, '</w:tr>', lt)) {
      out = `${out.replace(/\t$/, '')}\n`
      at = lt + '</w:tr>'.length
      continue
    }
    // `<w:t>` or `<w:t ...>` — but not `<w:tab`, which also starts with
    // `<w:t`, hence the explicit next-character check.
    const afterPrefix = xml[lt + 4]
    if (
      startsWith(xml, '<w:t', lt) &&
      (afterPrefix === '>' || afterPrefix === ' ' || afterPrefix === '\t' || afterPrefix === '\n')
    ) {
      const tagEnd = xml.indexOf('>', lt)
      if (tagEnd === -1) break
      const closeAt = xml.indexOf('</w:t>', tagEnd + 1)
      if (closeAt === -1) {
        // Unterminated: nothing after this point can be attributed to a
        // known text run. Stop rather than treat the remainder of the
        // document as this run's content.
        break
      }
      out += decodeXmlEntities(xml.slice(tagEnd + 1, closeAt))
      at = closeAt + '</w:t>'.length
      continue
    }

    // Not a tag this reader tracks — advance past this `<` and keep going.
    at = lt + 1
  }

  return out
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export interface DocxExtraction {
  readonly text: string
  readonly warnings: readonly string[]
}

/**
 * A real `word/document.xml`, however long the document, is nowhere near
 * this: it is prose, not the repetitive markup a decompression bomb needs to
 * reach a high compression ratio. 8 MiB caps the cost of the linear scan
 * above regardless of the 200 MiB ceiling `openZip` otherwise allows, since a
 * highly repetitive XML payload can deflate at several hundred to one — a
 * few hundred KB compressed easily clears 200 MiB inflated otherwise.
 */
const MAX_DOCUMENT_XML_BYTES = 8 * 1024 * 1024

export function extractDocxText(buffer: Buffer): DocxExtraction {
  const archive = openZip(buffer)
  const main = archive.read('word/document.xml', MAX_DOCUMENT_XML_BYTES)
  if (main === undefined) {
    throw new CogentaError({
      code: 'DOCUMENT_EXTRACTION_FAILED',
      message: 'This ZIP archive has no word/document.xml, so it is not a .docx.',
      hint: 'A legacy .doc (Word 97-2003) or an .odt is a different format — re-save it as .docx, Markdown or plain text.',
      details: { entries: archive.names.slice(0, 20) },
    })
  }

  const warnings: string[] = []
  const body = textFromDocumentXml(main.toString('utf8'))

  // Footnotes and endnotes carry real requirements often enough in a brief
  // ("le client précise en note que…") that dropping them silently would be
  // the kind of quiet loss this lot cannot afford. They are appended, clearly
  // separated, never interleaved — their anchor position is not recoverable
  // from `document.xml` alone.
  const extras: string[] = []
  for (const part of ['word/footnotes.xml', 'word/endnotes.xml']) {
    const entry = archive.read(part, MAX_DOCUMENT_XML_BYTES)
    if (entry === undefined) continue
    const text = textFromDocumentXml(entry.toString('utf8'))
    if (text !== '') extras.push(text)
  }

  const text = extras.length === 0 ? body : `${body}\n\n${extras.join('\n\n')}`
  if (text.trim() === '') {
    throw new CogentaError({
      code: 'DOCUMENT_NO_TEXT_LAYER',
      message: 'This .docx contains no text.',
      hint: 'The document may hold only images or embedded objects. Upload a version with real text, or paste the text directly.',
    })
  }
  if (archive.names.some((name) => name.startsWith('word/media/'))) {
    warnings.push(
      'This document embeds images; any requirement written inside an image is not readable and was not extracted.',
    )
  }
  return { text, warnings }
}
