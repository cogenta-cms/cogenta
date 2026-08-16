import { inflateSync } from 'node:zlib'
import { CogentaError } from '@cogenta/core'
import { MAX_TEXT_CHARACTERS } from './limits.js'

/**
 * Text-layer extraction from a PDF, with no dependency (R9/R10 — `pdf-parse`
 * wraps `pdf.js`, several megabytes of browser-oriented rendering code, to
 * reach the same content streams `node:zlib` already opens; `pdfjs-dist`
 * itself is heavier still and needs a DOM shim on Node).
 *
 * What this reads: the content streams of a PDF (`FlateDecode`d or stored),
 * and the text-showing operators inside them (`Tj`, `TJ`, `'`, `"`), with
 * `Td`/`TD`/`T*`/`ET` treated as line breaks. Simple-font strings are
 * decoded as CP-1252 (what `WinAnsiEncoding` actually is, and what a French
 * brief needs for its accents); UTF-16BE strings are decoded as such.
 *
 * What this deliberately does not do, and says so rather than pretending:
 * a font with a custom `Encoding`/`ToUnicode` CMap (common in PDFs exported
 * with subset CID fonts) shows glyph indices, not characters, and no amount
 * of operator parsing recovers text from those without building the CMap
 * machinery. `extractPdfText` refuses that case outright rather than
 * returning mojibake as if it were the document — as it refuses a scan,
 * which has no text layer at all. Both are `DOCUMENT_NO_TEXT_LAYER`, never
 * an empty or plausible-looking success.
 */

const MAX_INFLATED_BYTES = 200 * 1024 * 1024

/** CP-1252's only departures from Latin-1: the 0x80–0x9F block. */
const CP1252_HIGH = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'

function decodeCp1252(bytes: Buffer): string {
  let out = ''
  for (const byte of bytes) {
    out +=
      byte >= 0x80 && byte <= 0x9f ? (CP1252_HIGH[byte - 0x80] ?? '�') : String.fromCharCode(byte)
  }
  return out
}

function decodePdfString(bytes: Buffer): string {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return bytes.subarray(2).swap16().toString('utf16le')
  }
  return decodeCp1252(bytes)
}

const DELIMITERS = new Set('()<>[]{}/%'.split('').map((c) => c.charCodeAt(0)))

function isWhitespace(byte: number): boolean {
  return byte === 0 || byte === 9 || byte === 10 || byte === 12 || byte === 13 || byte === 32
}

/** A literal `(...)` string, honouring nesting, backslash escapes and octal codes. */
function readLiteralString(data: Buffer, start: number): { bytes: Buffer; next: number } {
  const out: number[] = []
  let depth = 1
  let at = start
  while (at < data.length) {
    const byte = data[at] as number
    if (byte === 0x5c) {
      const escaped = data[at + 1]
      at += 2
      if (escaped === undefined) break
      if (escaped >= 0x30 && escaped <= 0x37) {
        let octal = String.fromCharCode(escaped)
        while (octal.length < 3) {
          const more = data[at]
          if (more === undefined || more < 0x30 || more > 0x37) break
          octal += String.fromCharCode(more)
          at++
        }
        out.push(Number.parseInt(octal, 8) & 0xff)
        continue
      }
      const simple: Record<number, number> = { 110: 10, 114: 13, 116: 9, 98: 8, 102: 12 }
      const mapped = simple[escaped]
      if (mapped !== undefined) out.push(mapped)
      else if (escaped === 10) {
        // A backslash before a newline is a line continuation: emit nothing.
      } else if (escaped === 13) {
        if (data[at] === 10) at++
      } else out.push(escaped)
      continue
    }
    if (byte === 0x28) depth++
    if (byte === 0x29) {
      depth--
      if (depth === 0) return { bytes: Buffer.from(out), next: at + 1 }
    }
    out.push(byte)
    at++
  }
  return { bytes: Buffer.from(out), next: at }
}

function readHexString(data: Buffer, start: number): { bytes: Buffer; next: number } {
  let digits = ''
  let at = start
  while (at < data.length && data[at] !== 0x3e) {
    const ch = String.fromCharCode(data[at] as number)
    if (/[0-9a-fA-F]/.test(ch)) digits += ch
    at++
  }
  if (digits.length % 2 === 1) digits += '0'
  const bytes = Buffer.from(digits, 'hex')
  return { bytes, next: at + 1 }
}

/** A real PDF number is a handful of characters; nothing legitimate is near this. */
const MAX_NUMBER_TOKEN_LENGTH = 64

/**
 * Whether a bare token is a PDF number, without a regular expression.
 *
 * The obvious pattern for this — `/^[-+]?(\d+\.?\d*|\.\d+)$/` — backtracks
 * quadratically on a long run of digits that fails at the anchor, which is a
 * denial of service an attacker-supplied content stream can reach for the
 * price of one very long token. A character scan is linear and cannot, and
 * the length cap makes the pathological input impossible before that even
 * matters.
 */
function isNumberToken(word: string): boolean {
  if (word.length === 0 || word.length > MAX_NUMBER_TOKEN_LENGTH) return false
  let at = word[0] === '-' || word[0] === '+' ? 1 : 0
  let digits = 0
  let dots = 0
  for (; at < word.length; at++) {
    const char = word[at] as string
    if (char >= '0' && char <= '9') digits++
    else if (char === '.') dots++
    else return false
    if (dots > 1) return false
  }
  return digits > 0
}

type Token =
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'operator'; readonly value: string }
  | { readonly kind: 'arrayStart' }
  | { readonly kind: 'arrayEnd' }
  | { readonly kind: 'other' }

function* tokenize(data: Buffer): Generator<Token> {
  let at = 0
  while (at < data.length) {
    const byte = data[at] as number
    if (isWhitespace(byte)) {
      at++
      continue
    }
    if (byte === 0x25) {
      // Comment to end of line.
      while (at < data.length && data[at] !== 10 && data[at] !== 13) at++
      continue
    }
    if (byte === 0x28) {
      const read = readLiteralString(data, at + 1)
      at = read.next
      yield { kind: 'string', value: decodePdfString(read.bytes) }
      continue
    }
    if (byte === 0x3c) {
      if (data[at + 1] === 0x3c) {
        at += 2
        yield { kind: 'other' }
        continue
      }
      const read = readHexString(data, at + 1)
      at = read.next
      yield { kind: 'string', value: decodePdfString(read.bytes) }
      continue
    }
    if (byte === 0x3e) {
      at += data[at + 1] === 0x3e ? 2 : 1
      yield { kind: 'other' }
      continue
    }
    if (byte === 0x5b) {
      at++
      yield { kind: 'arrayStart' }
      continue
    }
    if (byte === 0x5d) {
      at++
      yield { kind: 'arrayEnd' }
      continue
    }
    if (byte === 0x2f) {
      at++
      while (
        at < data.length &&
        !isWhitespace(data[at] as number) &&
        !DELIMITERS.has(data[at] as number)
      )
        at++
      yield { kind: 'other' }
      continue
    }
    if (byte === 0x7b || byte === 0x7d) {
      at++
      yield { kind: 'other' }
      continue
    }
    let word = ''
    while (
      at < data.length &&
      !isWhitespace(data[at] as number) &&
      !DELIMITERS.has(data[at] as number)
    ) {
      word += String.fromCharCode(data[at] as number)
      at++
    }
    if (word === '') {
      at++
      continue
    }
    if (isNumberToken(word)) {
      yield { kind: 'number', value: Number.parseFloat(word) }
      continue
    }
    yield { kind: 'operator', value: word }
  }
}

/** Below this (in thousandths of an em, negated) a `TJ` kerning gap reads as a word space. */
const TJ_SPACE_THRESHOLD = -120

function textFromContentStream(data: Buffer): string {
  const lines: string[] = []
  let current = ''
  const pendingStrings: string[] = []
  let arrayDepth = 0
  let arrayText = ''

  const flushLine = (): void => {
    const trimmed = current.replace(/[ \t]+$/, '')
    if (trimmed !== '') lines.push(trimmed)
    current = ''
  }

  for (const token of tokenize(data)) {
    if (token.kind === 'arrayStart') {
      arrayDepth++
      arrayText = ''
      continue
    }
    if (token.kind === 'arrayEnd') {
      arrayDepth = Math.max(0, arrayDepth - 1)
      pendingStrings.push(arrayText)
      arrayText = ''
      continue
    }
    if (token.kind === 'string') {
      if (arrayDepth > 0) arrayText += token.value
      else pendingStrings.push(token.value)
      continue
    }
    if (token.kind === 'number') {
      if (arrayDepth > 0 && token.value <= TJ_SPACE_THRESHOLD && !arrayText.endsWith(' ')) {
        arrayText += ' '
      }
      continue
    }
    if (token.kind !== 'operator') continue

    switch (token.value) {
      case 'Tj':
      case 'TJ':
      case "'":
      case '"': {
        if (token.value === "'" || token.value === '"') flushLine()
        current += pendingStrings.join('')
        pendingStrings.length = 0
        break
      }
      case 'Td':
      case 'TD':
      case 'T*':
      case 'ET':
      case 'BT':
        flushLine()
        pendingStrings.length = 0
        break
      default:
        pendingStrings.length = 0
        break
    }
  }
  flushLine()
  return lines.join('\n')
}

/**
 * Two independent tells that a "text layer" is really glyph indices from a
 * subset font whose encoding was never embedded.
 *
 * The character ratio catches the obvious half (replacement characters,
 * control codes, private-use glyphs). The mean word length catches the half
 * that looks innocent one character at a time: a CID stream renders as
 * plausible-looking letters separated by spaces — `o m - l o v v - 7 b7` —
 * where real prose in any Latin-script language averages four to five
 * characters per word and this averages barely over one.
 *
 * Both were calibrated against real PDFs on disk, not invented: the corpus's
 * MuPDF exports score 0.00 / 4.6, and four real LaTeX-exported briefs score
 * 0.45–0.57 / 1.2–1.4.
 */
export interface PdfReadability {
  readonly badCharacterRatio: number
  readonly meanWordLength: number
}

export function measureReadability(text: string): PdfReadability {
  if (text.length === 0) return { badCharacterRatio: 1, meanWordLength: 0 }
  let bad = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if (code === 0xfffd || (code < 32 && code !== 9 && code !== 10 && code !== 13)) bad++
    else if (code >= 0xe000 && code <= 0xf8ff) bad++
  }
  const words = text.split(/\s+/).filter((word) => word !== '')
  const meanWordLength =
    words.length === 0 ? 0 : words.reduce((sum, word) => sum + word.length, 0) / words.length
  return { badCharacterRatio: bad / text.length, meanWordLength }
}

const UNUSABLE_BAD_CHAR_RATIO = 0.3
const UNUSABLE_MEAN_WORD_LENGTH = 2.2
const SUSPECT_BAD_CHAR_RATIO = 0.1

interface RawStream {
  readonly dictionary: string
  readonly data: Buffer
}

/**
 * A real stream's `<< ... >>` dictionary sits immediately before its
 * `stream` keyword — a handful of entries, at most a few hundred bytes.
 * Bounding how far the search for it looks back keeps a single search
 * O(window) instead of O(offset-into-file) — `String.lastIndexOf` has no
 * "look back no further than N" parameter of its own, so the window is
 * enforced by scanning forward within it instead (see
 * `lastMatchWithinWindow`).
 */
const DICTIONARY_SEARCH_WINDOW = 2048

/**
 * The last occurrence of `needle` within `[windowStart, before)`, at a cost
 * bounded by the window's size regardless of how far into the file `before`
 * is.
 *
 * `haystack.lastIndexOf(needle, before)` looks like it would do this — its
 * second argument reads like a starting offset — but it still walks
 * backward from `before` over the *entire* rest of the string looking for a
 * match, unbounded. Scanning forward with `indexOf` from `windowStart`
 * instead has the same problem in the other direction when the needle never
 * occurs in the window at all: `indexOf` does not stop at `before`, it
 * keeps searching to the end of the whole haystack. `slice` is what
 * actually bounds the work — V8 (and every other engine) represents a
 * substring as a view over the original backing storage rather than a
 * fresh copy, so carving out `[windowStart, before)` is O(window), not
 * O(haystack), and every subsequent operation on it is too.
 */
function lastMatchWithinWindow(
  haystack: string,
  needle: string,
  before: number,
  windowStart: number,
): number {
  const window = haystack.slice(windowStart, before)
  const at = window.lastIndexOf(needle)
  return at === -1 ? -1 : windowStart + at
}

/**
 * A legitimate PDF has, at most, a few thousand objects. Refusing to walk
 * past this many `stream`/`endstream` pairs bounds the total work
 * `collectStreams` can be made to do by a file that is mostly repeated
 * `stream\nendstream\n` markers and nothing else — no real PDF structure,
 * no decompression, just the keyword search itself.
 */
const MAX_STREAMS = 10_000

function collectStreams(buffer: Buffer): readonly RawStream[] {
  const streams: RawStream[] = []
  const haystack = buffer.toString('latin1')
  let searchFrom = 0
  while (streams.length < MAX_STREAMS) {
    const keyword = haystack.indexOf('stream', searchFrom)
    if (keyword === -1) break
    // `endstream` also contains "stream"; skip those matches.
    if (haystack.startsWith('endstream', Math.max(0, keyword - 3))) {
      searchFrom = keyword + 6
      continue
    }
    let dataStart = keyword + 'stream'.length
    if (haystack[dataStart] === '\r') dataStart++
    if (haystack[dataStart] === '\n') dataStart++
    const end = haystack.indexOf('endstream', dataStart)
    if (end === -1) break
    const windowStart = Math.max(0, keyword - DICTIONARY_SEARCH_WINDOW)
    const dictStart = lastMatchWithinWindow(haystack, '<<', keyword, windowStart)
    streams.push({
      dictionary: dictStart === -1 ? '' : haystack.slice(dictStart, keyword),
      data: buffer.subarray(dataStart, end),
    })
    searchFrom = end + 'endstream'.length
  }
  return streams
}

function decodeStream(stream: RawStream): Buffer | undefined {
  const filters = stream.dictionary.match(/\/Filter\s*(\/\w+|\[[^\]]*\])/)
  const filter = filters?.[1] ?? ''
  if (filter === '' || filter === '/') {
    return stream.data
  }
  if (!filter.includes('FlateDecode')) return undefined
  try {
    return inflateSync(stream.data, { maxOutputLength: MAX_INFLATED_BYTES })
  } catch {
    // A stream whose bytes we mis-sliced (a binary `endstream` inside an
    // image, say) is skipped, never fatal: the other streams still carry
    // the text.
    return undefined
  }
}

export interface PdfExtraction {
  readonly text: string
  readonly warnings: readonly string[]
}

export function extractPdfText(buffer: Buffer): PdfExtraction {
  if (!buffer.subarray(0, 5).toString('latin1').startsWith('%PDF-')) {
    throw new CogentaError({
      code: 'DOCUMENT_EXTRACTION_FAILED',
      message: 'This file does not start with a %PDF- header.',
      hint: 'Upload the original PDF, or export the document as Markdown or plain text.',
    })
  }
  if (/\/Encrypt\b/.test(buffer.toString('latin1'))) {
    throw new CogentaError({
      code: 'DOCUMENT_EXTRACTION_FAILED',
      message: 'This PDF is encrypted, so its text cannot be read.',
      hint: 'Remove the password protection and upload it again, or paste the text directly.',
    })
  }

  const warnings: string[] = []
  const pages: string[] = []
  let skipped = 0
  let accumulated = 0
  // `MAX_TEXT_CHARACTERS` is `extractDocumentText`'s final cap, checked only
  // after every format reader has already built its whole result string.
  // Enforcing the same budget here, inside the loop, is what stops a PDF
  // whose individual streams each stay under the per-stream decompression
  // cap but are numerous and highly compressible from accumulating many
  // times that budget in memory before the final truncation ever runs — the
  // truncation itself still happens downstream, unchanged; this only stops
  // reading further pages once there is already more than enough text to
  // fill it.
  for (const stream of collectStreams(buffer)) {
    if (accumulated > MAX_TEXT_CHARACTERS) {
      warnings.push(
        'Stopped reading further pages after the text-length cap was reached; the document has more content than was extracted.',
      )
      break
    }
    if (/\/Type\s*\/(?:XObject|Metadata|ObjStm|XRef)\b/.test(stream.dictionary)) continue
    const decoded = decodeStream(stream)
    if (decoded === undefined) {
      skipped++
      continue
    }
    // A content stream is the only thing with text-showing operators in it.
    if (!/\b(?:Tj|TJ)\b/.test(decoded.toString('latin1'))) continue
    const text = textFromContentStream(decoded)
    if (text.trim() !== '') {
      pages.push(text)
      accumulated += text.length
    }
  }

  if (pages.length === 0) {
    throw new CogentaError({
      code: 'DOCUMENT_NO_TEXT_LAYER',
      message: 'No text layer was found in this PDF.',
      hint: 'The file is most likely a scan or an export of images. Run it through OCR first, or upload the source document (DOCX, Markdown, plain text).',
      details: { streamsSkipped: skipped },
    })
  }

  const text = pages.join('\n\n')
  const readability = measureReadability(text)
  if (
    readability.badCharacterRatio > UNUSABLE_BAD_CHAR_RATIO ||
    readability.meanWordLength < UNUSABLE_MEAN_WORD_LENGTH
  ) {
    // Refused, not warned about. Handing this on as if it were the document
    // is the single most expensive thing this reader could do: everything
    // downstream would happily analyse the mojibake and produce a confident,
    // entirely invented site plan.
    throw new CogentaError({
      code: 'DOCUMENT_NO_TEXT_LAYER',
      message:
        'This PDF has a text layer, but it is not readable: its fonts are subset with an encoding the file does not carry.',
      hint: 'Upload the source document instead (DOCX, Markdown, plain text), re-export the PDF with "embed fonts" enabled, or run the file through OCR.',
      details: {
        badCharacterRatio: Number(readability.badCharacterRatio.toFixed(2)),
        meanWordLength: Number(readability.meanWordLength.toFixed(2)),
      },
    })
  }
  if (readability.badCharacterRatio > SUSPECT_BAD_CHAR_RATIO) {
    warnings.push(
      `${Math.round(readability.badCharacterRatio * 100)}% of the extracted characters are not readable text — check the result before relying on it.`,
    )
  }
  if (skipped > 0) {
    warnings.push(
      `${skipped} stream(s) used a filter this reader does not decode and were skipped.`,
    )
  }
  return { text, warnings }
}
