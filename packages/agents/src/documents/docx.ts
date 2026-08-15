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

const TOKEN =
  /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?>|<w:br\b[^>]*\/?>|<\/w:p>|<\/w:tc>|<\/w:tr>/g

function textFromDocumentXml(xml: string): string {
  let out = ''
  for (const match of xml.matchAll(TOKEN)) {
    const [whole, captured] = match
    if (captured !== undefined) {
      out += decodeXmlEntities(captured)
      continue
    }
    if (whole.startsWith('<w:tab')) out += '\t'
    else if (whole.startsWith('<w:br')) out += '\n'
    else if (whole === '</w:tc>') {
      // A cell always ends with its own `</w:p>`, which has already emitted a
      // newline; the cell separator replaces it, so a row stays one line.
      out = `${out.replace(/\n$/, '')}\t`
    } else if (whole === '</w:tr>') out = `${out.replace(/\t$/, '')}\n`
    else out += '\n'
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

export function extractDocxText(buffer: Buffer): DocxExtraction {
  const archive = openZip(buffer)
  const main = archive.read('word/document.xml')
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
    const entry = archive.read(part)
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
