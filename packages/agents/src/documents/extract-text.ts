import { CogentaError } from '@cogenta/core'
import { extractDocxText } from './docx.js'
import { MAX_DOCUMENT_BYTES, MAX_TEXT_CHARACTERS } from './limits.js'
import { extractPdfText } from './pdf.js'

/**
 * L19 task 1 — "un nouvel outil d'agent qui extrait le texte" from PDF,
 * DOCX, Markdown or plain text.
 *
 * Format detection reads the bytes, not the extension: a brief emailed as
 * `cahier-des-charges.pdf` that is really a `.docx` is common enough, and
 * trusting the name would fail it with a confusing error. The extension is
 * only consulted to tell Markdown from plain text, which no magic number
 * distinguishes.
 *
 * Everything this returns is **data**, never instruction (R8). This module
 * does not interpret the text, and the analysis step that does
 * (`analyseBrief`) passes it through `assembleContext`'s tagged `data`
 * channel rather than into any system prompt.
 */

export const DOCUMENT_FORMATS = ['pdf', 'docx', 'markdown', 'text'] as const
export type DocumentFormat = (typeof DOCUMENT_FORMATS)[number]

// Re-exported for existing callers/tests — the values now live in
// `limits.ts` so `pdf.ts` can share them without an import cycle back to
// this module.
export { MAX_DOCUMENT_BYTES, MAX_TEXT_CHARACTERS }

export interface ExtractDocumentInput {
  readonly filename: string
  readonly bytes: Buffer
}

export interface ExtractedDocument {
  readonly filename: string
  readonly format: DocumentFormat
  readonly text: string
  readonly characters: number
  /** `true` when the document was longer than `MAX_TEXT_CHARACTERS` and the tail was cut. */
  readonly truncated: boolean
  /** Everything the reader could not do, in the operator's words — never silent. */
  readonly warnings: readonly string[]
}

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdown', '.mkd'])
const TEXT_EXTENSIONS = new Set(['.txt', '.text', '.rst', '.adoc', '.log', ''])

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  const slash = Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\'))
  return dot > slash ? filename.slice(dot).toLowerCase() : ''
}

function unsupported(filename: string, why: string): CogentaError {
  return new CogentaError({
    code: 'DOCUMENT_FORMAT_UNSUPPORTED',
    message: `"${filename}" cannot be read: ${why}.`,
    hint: `Supported formats are PDF, DOCX, Markdown and plain text. Re-save the document as one of those, or paste its text directly.`,
    details: { filename },
  })
}

/**
 * Decodes text bytes, honouring a byte-order mark and falling back to
 * CP-1252 when the bytes are not valid UTF-8 — which is what a brief typed
 * in Notepad on a French Windows actually is, and decoding it as UTF-8
 * would turn every accent into a replacement character.
 */
function decodeTextBytes(bytes: Buffer): { text: string; warnings: readonly string[] } {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: bytes.subarray(3).toString('utf8'), warnings: [] }
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: bytes.subarray(2).toString('utf16le'), warnings: [] }
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: bytes.subarray(2).swap16().toString('utf16le'), warnings: [] }
  }
  const asUtf8 = bytes.toString('utf8')
  if (!asUtf8.includes('�')) return { text: asUtf8, warnings: [] }
  return {
    text: bytes.toString('latin1'),
    warnings: [
      'This file is not valid UTF-8; it was decoded as CP-1252. Check that accented characters read correctly.',
    ],
  }
}

function looksBinary(bytes: Buffer): boolean {
  const sample = bytes.subarray(0, 8192)
  return sample.includes(0)
}

function normaliseLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

export function extractDocumentText(input: ExtractDocumentInput): ExtractedDocument {
  const { filename, bytes } = input
  if (bytes.length === 0) {
    throw unsupported(filename, 'the file is empty')
  }
  if (bytes.length > MAX_DOCUMENT_BYTES) {
    throw new CogentaError({
      code: 'DOCUMENT_TOO_LARGE',
      message: `"${filename}" is ${bytes.length} bytes, over the ${MAX_DOCUMENT_BYTES}-byte limit.`,
      hint: 'Split the document, or upload only the sections that describe the site.',
      details: { filename, bytes: bytes.length },
    })
  }

  const header = bytes.subarray(0, 4)
  const warnings: string[] = []
  let format: DocumentFormat
  let text: string

  if (header.subarray(0, 4).toString('latin1') === '%PDF') {
    format = 'pdf'
    const extracted = extractPdfText(bytes)
    text = extracted.text
    warnings.push(...extracted.warnings)
  } else if (header[0] === 0x50 && header[1] === 0x4b) {
    format = 'docx'
    const extracted = extractDocxText(bytes)
    text = extracted.text
    warnings.push(...extracted.warnings)
  } else if (header.subarray(0, 4).toString('latin1') === '\xd0\xcf\x11\xe0') {
    throw unsupported(
      filename,
      'it is a legacy Word 97-2003 .doc, a binary format this reader does not open',
    )
  } else {
    const extension = extensionOf(filename)
    if (looksBinary(bytes)) {
      throw unsupported(filename, 'it contains binary data and is neither a PDF nor a DOCX')
    }
    if (!MARKDOWN_EXTENSIONS.has(extension) && !TEXT_EXTENSIONS.has(extension)) {
      warnings.push(
        `"${extension}" is not a text extension this reader knows; the file was read as plain text anyway.`,
      )
    }
    format = MARKDOWN_EXTENSIONS.has(extension) ? 'markdown' : 'text'
    const decoded = decodeTextBytes(bytes)
    text = decoded.text
    warnings.push(...decoded.warnings)
  }

  text = normaliseLineEndings(text).trim()
  if (text === '') {
    throw new CogentaError({
      code: 'DOCUMENT_NO_TEXT_LAYER',
      message: `"${filename}" produced no text.`,
      hint: 'Check that the document is not a scan, and that it is not password-protected.',
      details: { filename, format },
    })
  }

  const truncated = text.length > MAX_TEXT_CHARACTERS
  if (truncated) {
    text = text.slice(0, MAX_TEXT_CHARACTERS)
    warnings.push(
      `The document is longer than ${MAX_TEXT_CHARACTERS} characters; only the beginning was kept. Anything written after that point was not read.`,
    )
  }

  return { filename, format, text, characters: text.length, truncated, warnings }
}
