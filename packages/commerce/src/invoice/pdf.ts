/**
 * An invoice rendered as a PDF, written byte by byte, with no dependency.
 *
 * Rule R9 asks for zero dependencies before a small one and rule R10 forbids
 * native code, which rules out `pdfkit` (a large tree) and `puppeteer` (a
 * browser download plus a native binary). A PDF that only has to place text on
 * A4 in a base-14 font is a few hundred lines of byte assembly, so that is what
 * this is.
 *
 * Three decisions shape the file it produces:
 *
 * - **Base-14 fonts only.** `/Helvetica` and `/Helvetica-Bold` are guaranteed
 *   present in every conforming reader, so nothing is embedded and an invoice
 *   stays a few kilobytes. The price is `WinAnsiEncoding`: one byte per glyph,
 *   and a character outside that repertoire becomes `?` rather than a broken
 *   file.
 * - **No compression.** A `/FlateDecode` stream would need zlib and would make
 *   the output unreadable to anything but a PDF parser. Uncompressed streams
 *   keep an invoice greppable and the whole file auditable by eye.
 * - **Deterministic to the byte.** Nothing here reads the clock or a random
 *   source. The same document renders to the same bytes forever, so a hash
 *   stored next to an invoice still means something a year later. `/CreationDate`
 *   is derived from the document's own `issuedAt` or omitted entirely.
 */

/** One row of the line-item table. One string per column. */
export interface PdfLine {
  readonly cells: readonly string[]
}

/**
 * Everything the renderer needs, already formatted for a human.
 *
 * There is no `Money`, no locale and no date here on purpose: formatting money
 * and dates is the caller's job (it knows the locale and the currency), and
 * keeping this structure made of plain strings is what makes the output
 * reproducible from stored data alone.
 */
export interface PdfInvoiceDocument {
  /** Heading, e.g. `Invoice`. Whatever language the shop sells in. */
  readonly title: string
  /** The invoice number, printed verbatim. */
  readonly number: string
  /** Already formatted for a human, e.g. `2026-03-12` or `12 March 2026`. */
  readonly issuedAt: string
  /** Address block, one string per line. The first line is printed bold. */
  readonly seller: readonly string[]
  /** Address block, one string per line. The first line is printed bold. */
  readonly buyer: readonly string[]
  /** Table header. Repeated at the top of every continuation page. */
  readonly columns: readonly string[]
  readonly lines: readonly PdfLine[]
  /** Label / amount pairs. The last pair is printed bold. */
  readonly totals: readonly (readonly [string, string])[]
  /** Legal mentions, payment terms — printed at the foot of every page. */
  readonly footer?: string
}

// --- Page geometry -------------------------------------------------------
// A4 in points, the unit PDF measures everything in (72 to the inch).

const PAGE_WIDTH = 595
const PAGE_HEIGHT = 842
const MARGIN = 50
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const RIGHT_EDGE = MARGIN + CONTENT_WIDTH
/** Baseline of the first line on a page. PDF's origin is the bottom left. */
const TOP_Y = PAGE_HEIGHT - MARGIN
/** Nothing is drawn below this; the footer lives underneath it. */
const BOTTOM_Y = MARGIN + 24
const COLUMN_GUTTER = 6

/**
 * Helvetica is proportional, so this is a deliberate approximation: a fixed
 * measure of half an em per character. It over-estimates `l` and `i` and
 * under-estimates `W`, which for an invoice — digits, short labels, addresses —
 * lands close enough to wrap sensibly. The alternative is embedding the
 * Helvetica width table, 315 numbers of accidental complexity for a table of
 * amounts.
 */
const CHAR_WIDTH_RATIO = 0.5

const SIZE_TITLE = 20
const SIZE_META = 10
const SIZE_ROW = 9
const SIZE_FOOTER = 8
const LEAD_META = 13
/** Extra space between two wrapped lines inside one table cell. */
const ROW_LEADING = 3

// --- Object numbering ----------------------------------------------------
// Fixed for the first five; pages then take two objects each (the page
// dictionary and its content stream), which is what makes the page object
// number computable without a second pass.

const OBJ_CATALOG = 1
const OBJ_PAGE_TREE = 2
const OBJ_FONT_REGULAR = 3
const OBJ_FONT_BOLD = 4
const OBJ_INFO = 5
const FIRST_PAGE_OBJECT = 6

interface TextOp {
  readonly x: number
  readonly y: number
  readonly size: number
  readonly bold: boolean
  readonly text: string
}

interface RuleOp {
  readonly y: number
  readonly from: number
  readonly to: number
}

interface PageOps {
  readonly texts: TextOp[]
  readonly rules: RuleOp[]
}

/**
 * The one entry point: a document in, a complete PDF file out.
 *
 * Total by design — it never throws. Every input that could be called invalid
 * has a defined, lossless rendering instead: a row shorter than the header is
 * padded, a row longer than the header widens the table, an unrepresentable
 * character becomes `?`, and text too wide for its column wraps rather than
 * being cut. An invoice is a legal document; losing a line to a validation
 * decision taken inside a renderer would be worse than printing it oddly.
 */
export function renderInvoicePdf(document: PdfInvoiceDocument): Uint8Array {
  return serialise(layoutDocument(document), document)
}

// --- Layout --------------------------------------------------------------

function layoutDocument(document: PdfInvoiceDocument): readonly PageOps[] {
  const pages: PageOps[] = []
  const startPage = (): PageOps => {
    const page: PageOps = { texts: [], rules: [] }
    pages.push(page)
    return page
  }

  let page = startPage()
  let y = TOP_Y

  const write = (x: number, size: number, bold: boolean, text: string): void => {
    if (text !== '') page.texts.push({ x, y, size, bold, text })
  }
  const writeRight = (right: number, size: number, bold: boolean, text: string): void => {
    if (text !== '') page.texts.push({ x: right - measure(text, size), y, size, bold, text })
  }
  const rule = (): void => {
    page.rules.push({ y, from: MARGIN, to: RIGHT_EDGE })
  }
  const breakPage = (): void => {
    page = startPage()
    y = TOP_Y
  }

  // Heading. The number and the date are printed verbatim, without invented
  // labels: the caller knows which language its customers read, this file does
  // not, and a hard-coded "No." on a French invoice is worse than no label.
  y -= SIZE_TITLE
  write(MARGIN, SIZE_TITLE, true, document.title)
  y -= 20
  write(MARGIN, SIZE_META, false, document.number)
  writeRight(RIGHT_EDGE, SIZE_META, false, document.issuedAt)
  y -= 8
  rule()
  y -= 22

  // Seller on the left, buyer on the right, both starting on the same line.
  const addressTop = y
  const halfWidth = Math.floor(CONTENT_WIDTH / 2)
  const writeAddress = (block: readonly string[], x: number): void => {
    y = addressTop
    block.forEach((line, index) => {
      write(x, SIZE_META, index === 0, line)
      y -= LEAD_META
    })
  }
  writeAddress(document.seller, MARGIN)
  writeAddress(document.buyer, MARGIN + halfWidth)
  const addressLines = Math.max(document.seller.length, document.buyer.length)
  y = addressTop - addressLines * LEAD_META - 16

  // Line-item table.
  const columnCount = Math.max(
    document.columns.length,
    ...document.lines.map((line) => line.cells.length),
    0,
  )
  const widths = columnWidths(columnCount)
  const offsets = columnOffsets(widths)

  const rowHeight = (cells: readonly string[], size: number): number =>
    Math.max(1, ...cells.map((cell, index) => wrapCell(cell, widths, index, size).length)) *
    (size + ROW_LEADING)

  const paintRow = (cells: readonly string[], size: number, bold: boolean): void => {
    const top = y
    let height = size + ROW_LEADING
    cells.forEach((cell, index) => {
      const width = widths[index] ?? 0
      const x = offsets[index] ?? MARGIN
      const lines = wrapCell(cell, widths, index, size)
      // The last column carries amounts, and a column of amounts is only
      // readable right-aligned.
      const isLast = index === cells.length - 1 && cells.length === widths.length
      y = top
      for (const line of lines) {
        if (isLast) writeRight(x + width - COLUMN_GUTTER, size, bold, line)
        else write(x, size, bold, line)
        y -= size + ROW_LEADING
      }
      height = Math.max(height, lines.length * (size + ROW_LEADING))
    })
    y = top - height
  }

  const paintHeader = (): void => {
    if (columnCount === 0) return
    paintRow(padCells(document.columns, columnCount), SIZE_ROW, true)
    y += 2
    rule()
    y -= 10
  }

  if (columnCount > 0) {
    if (y - rowHeight(padCells(document.columns, columnCount), SIZE_ROW) - 12 < BOTTOM_Y) {
      breakPage()
    }
    paintHeader()
  }

  for (const line of document.lines) {
    const cells = padCells(line.cells, columnCount)
    if (y - rowHeight(cells, SIZE_ROW) < BOTTOM_Y) {
      breakPage()
      paintHeader()
    }
    paintRow(cells, SIZE_ROW, false)
  }

  // Totals, right-aligned in two columns of their own.
  if (document.totals.length > 0) {
    y -= 6
    if (y < BOTTOM_Y) breakPage()
    rule()
    y -= 16
    document.totals.forEach(([label, amount], index) => {
      if (y < BOTTOM_Y) breakPage()
      const bold = index === document.totals.length - 1
      writeRight(RIGHT_EDGE - 130, SIZE_META, bold, label)
      writeRight(RIGHT_EDGE, SIZE_META, bold, amount)
      y -= LEAD_META + 3
    })
  }

  // Footers last: the page count is only known once every page exists.
  const footer = document.footer
  pages.forEach((target, index) => {
    const baseline = MARGIN - 12
    if (footer !== undefined && footer !== '') {
      target.texts.push({ x: MARGIN, y: baseline, size: SIZE_FOOTER, bold: false, text: footer })
    }
    const counter = `${index + 1} / ${pages.length}`
    target.texts.push({
      x: RIGHT_EDGE - measure(counter, SIZE_FOOTER),
      y: baseline,
      size: SIZE_FOOTER,
      bold: false,
      text: counter,
    })
  })

  return pages
}

/**
 * The first column gets 40 % of the width and the rest share what is left.
 *
 * An invoice's first column is a description and the others are quantities,
 * unit prices and amounts — short. This is not a layout engine, and a fixed
 * split is honest about that.
 */
function columnWidths(count: number): readonly number[] {
  if (count <= 0) return []
  if (count === 1) return [CONTENT_WIDTH]
  const first = Math.round(CONTENT_WIDTH * 0.4)
  const other = Math.floor((CONTENT_WIDTH - first) / (count - 1))
  return [first, ...Array.from({ length: count - 1 }, () => other)]
}

function columnOffsets(widths: readonly number[]): readonly number[] {
  const offsets: number[] = []
  let x = MARGIN
  for (const width of widths) {
    offsets.push(x)
    x += width
  }
  return offsets
}

function padCells(cells: readonly string[], count: number): readonly string[] {
  if (cells.length >= count) return cells
  return [...cells, ...Array.from({ length: count - cells.length }, () => '')]
}

function wrapCell(
  cell: string,
  widths: readonly number[],
  index: number,
  size: number,
): readonly string[] {
  const width = widths[index] ?? CONTENT_WIDTH
  return wrapText(cell, width - COLUMN_GUTTER, size)
}

/**
 * Wraps rather than truncates. A cut description on an invoice is a missing
 * piece of a legal document; an ugly wrap is only ugly.
 */
function wrapText(text: string, maxWidth: number, size: number): readonly string[] {
  const maxChars = Math.max(1, Math.floor(maxWidth / (size * CHAR_WIDTH_RATIO)))
  const out: string[] = []
  for (const paragraph of text.split(/\r?\n/u)) {
    let current = ''
    for (const word of paragraph.split(' ')) {
      for (const piece of hardSplit(word, maxChars)) {
        if (current === '') current = piece
        else if (countCharacters(current) + 1 + countCharacters(piece) <= maxChars) {
          current = `${current} ${piece}`
        } else {
          out.push(current)
          current = piece
        }
      }
    }
    out.push(current)
  }
  return out
}

/** A word wider than its column (a URL, a long SKU) is broken, never dropped. */
function hardSplit(word: string, maxChars: number): readonly string[] {
  const characters = [...word]
  if (characters.length <= maxChars) return [word]
  const pieces: string[] = []
  for (let index = 0; index < characters.length; index += maxChars) {
    pieces.push(characters.slice(index, index + maxChars).join(''))
  }
  return pieces
}

function countCharacters(text: string): number {
  return [...text].length
}

function measure(text: string, size: number): number {
  return countCharacters(text) * size * CHAR_WIDTH_RATIO
}

// --- Text encoding -------------------------------------------------------

/**
 * The twenty-seven WinAnsi code points that are not Latin-1.
 *
 * WinAnsi (Windows-1252) agrees with Latin-1 everywhere except 0x80–0x9F,
 * where Latin-1 has unused control codes and WinAnsi has typography — the euro
 * sign, curly quotes, the dashes a real invoice actually contains. Without this
 * table a euro sign silently becomes a control byte.
 */
const WIN_ANSI_EXTRAS: ReadonlyMap<number, number> = new Map([
  [0x20ac, 0x80], // €
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85], // …
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c], // Œ
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92], // ’
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96], // –
  [0x2014, 0x97], // —
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c], // œ
  [0x017e, 0x9e],
  [0x0178, 0x9f],
])

const QUESTION_MARK = 0x3f

/** One Unicode code point to the one WinAnsi byte that can carry it, or `?`. */
function winAnsiByte(codePoint: number): number {
  if (codePoint === 0x09) return 0x20 // A tab has no width in a PDF string.
  if (codePoint < 0x20) return QUESTION_MARK
  if (codePoint <= 0x7e) return codePoint
  const extra = WIN_ANSI_EXTRAS.get(codePoint)
  if (extra !== undefined) return extra
  // 0x7F and 0x80–0x9F are undefined in WinAnsi; 0xA0–0xFF is Latin-1 as is.
  if (codePoint >= 0xa0 && codePoint <= 0xff) return codePoint
  return QUESTION_MARK
}

/**
 * A PDF string literal: WinAnsi bytes between parentheses, with the three
 * characters that would end or nest the literal escaped.
 *
 * This is the single most load-bearing function in the file. A customer named
 * `Smith (Ltd)` whose parentheses are not escaped closes the literal early and
 * every byte after it becomes an operator — the whole document, not just that
 * one name, stops being a PDF.
 */
function pdfString(text: string): string {
  let out = '('
  for (const character of text) {
    const byte = winAnsiByte(character.codePointAt(0) ?? QUESTION_MARK)
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) out += '\\'
    out += String.fromCharCode(byte)
  }
  return `${out})`
}

// --- Serialisation -------------------------------------------------------

/**
 * The file is assembled as a string in which **every character is one byte**
 * (`pdfString` guarantees it, and every other fragment is ASCII). That single
 * invariant is what makes the cross-reference table correct for free: a byte
 * offset is a string index, so no offset is ever estimated.
 */
function serialise(pages: readonly PageOps[], document: PdfInvoiceDocument): Uint8Array {
  const kids = pages.map((_, index) => `${FIRST_PAGE_OBJECT + index * 2} 0 R`).join(' ')
  const objects: string[] = [
    `<< /Type /Catalog /Pages ${OBJ_PAGE_TREE} 0 R >>`,
    `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    infoDictionary(document),
  ]

  pages.forEach((page, index) => {
    const contents = FIRST_PAGE_OBJECT + index * 2 + 1
    objects.push(
      `<< /Type /Page /Parent ${OBJ_PAGE_TREE} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}]` +
        ` /Resources << /Font << /F1 ${OBJ_FONT_REGULAR} 0 R /F2 ${OBJ_FONT_BOLD} 0 R >> >>` +
        ` /Contents ${contents} 0 R >>`,
    )
    objects.push(contentStreamObject(page))
  })

  // The binary comment on the second line tells every tool that has ever
  // shipped a heuristic that this file is binary and must not be newline
  // translated on transfer.
  let out = '%PDF-1.4\n%âãÏÓ\n'
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(out.length)
    out += `${index + 1} 0 obj\n${body}\nendobj\n`
  })

  const xrefOffset = out.length
  // Entry zero is the head of the free list, and every entry is exactly twenty
  // bytes: ten digits, a space, five digits, a space, the type, then a two-byte
  // end of line. Readers that seek into this table by multiplication break on a
  // nineteen-byte entry.
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${OBJ_CATALOG} 0 R`
  out += ` /Info ${OBJ_INFO} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

  return toBytes(out)
}

function contentStreamObject(page: PageOps): string {
  let stream = '0.6 w\n'
  for (const line of page.rules) {
    stream += `${number(line.from)} ${number(line.y)} m ${number(line.to)} ${number(line.y)} l S\n`
  }
  for (const op of page.texts) {
    const font = op.bold ? 'F2' : 'F1'
    stream += `BT /${font} ${number(op.size)} Tf ${number(op.x)} ${number(op.y)} Td `
    stream += `${pdfString(op.text)} Tj ET\n`
  }
  // `/Length` counts the bytes between `stream\n` and `\nendstream`. Because
  // one character is one byte here, that is exactly the string length.
  return `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
}

/**
 * `/CreationDate` is only written when `issuedAt` starts with an ISO date.
 *
 * Guessing at a human-formatted date with `Date.parse` would make the bytes
 * depend on the engine's parser, and the clock is out of the question: the
 * whole point is that regenerating an invoice yields the same file. No date at
 * all is better than a date that moves.
 */
function infoDictionary(document: PdfInvoiceDocument): string {
  let info = `<< /Title ${pdfString(`${document.title} ${document.number}`)} /Producer (Cogenta)`
  const iso = /^(\d{4})-(\d{2})-(\d{2})/u.exec(document.issuedAt)
  if (iso !== null) info += ` /CreationDate (D:${iso[1]}${iso[2]}${iso[3]}000000Z)`
  return `${info} >>`
}

/** Two decimals at most, and never an exponent, so the bytes never drift. */
function number(value: number): string {
  return String(Math.round(value * 100) / 100)
}

function toBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length)
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    // Defence in depth for the one-character-one-byte invariant: substituting
    // keeps the length — and therefore every recorded offset — correct, where
    // encoding to UTF-8 would silently shift every offset after it.
    bytes[index] = code > 0xff ? QUESTION_MARK : code
  }
  return bytes
}
