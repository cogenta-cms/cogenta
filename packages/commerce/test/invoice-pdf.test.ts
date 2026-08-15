import { describe, expect, it } from 'vitest'
import type { PdfInvoiceDocument } from '../src/invoice/pdf.js'
import { renderInvoicePdf } from '../src/invoice/pdf.js'

/**
 * There is no PDF reader in this test environment, so "does it open?" is
 * answered structurally: the file is taken apart the way a reader takes it
 * apart — follow `startxref`, read the cross-reference table, seek to each
 * recorded offset, and check that an object really begins there. A reader that
 * fails on this file fails on the first of those steps, so a suite that passes
 * all of them is close to the real question.
 */

/**
 * The bytes back as a string in which one character is one byte. `TextDecoder`
 * with UTF-8 is the wrong tool here: it would collapse the WinAnsi high bytes
 * this renderer emits into replacement characters and every offset computed
 * from the result would be wrong.
 */
function decodeBytes(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) out += String.fromCharCode(byte)
  return out
}

interface XrefTable {
  /** `/Size` as declared: object count plus the free entry. */
  readonly size: number
  /** Byte offset per object number, index 0 being object 1. */
  readonly offsets: readonly number[]
  readonly startxref: number
}

/** Reads the cross-reference table out of a rendered file, as a reader would. */
function readXref(file: string): XrefTable {
  const startxrefMatch = /startxref\n(\d+)\n%%EOF/u.exec(file)
  expect(startxrefMatch, 'the trailer must end with startxref and %%EOF').not.toBeNull()
  const startxref = Number(startxrefMatch?.[1])

  const section = file.slice(startxref)
  const headerMatch = /^xref\n0 (\d+)\n/u.exec(section)
  expect(headerMatch, 'startxref must point at the xref keyword itself').not.toBeNull()
  const size = Number(headerMatch?.[1])
  const entriesAt = startxref + (headerMatch?.[0].length ?? 0)

  // Every entry is exactly twenty bytes, which is what lets a reader index into
  // the table instead of parsing it.
  const freeEntry = file.slice(entriesAt, entriesAt + 20)
  expect(freeEntry).toBe('0000000000 65535 f \n')

  const offsets: number[] = []
  for (let object = 1; object < size; object += 1) {
    const entry = file.slice(entriesAt + object * 20, entriesAt + object * 20 + 20)
    expect(entry, `entry ${object} must be a twenty-byte in-use record`).toMatch(
      /^\d{10} \d{5} n \n$/u,
    )
    offsets.push(Number(entry.slice(0, 10)))
  }
  return { size, offsets, startxref }
}

/** The assertion the whole file exists for: the offsets are not estimates. */
function expectValidStructure(bytes: Uint8Array): string {
  const file = decodeBytes(bytes)
  expect(file.startsWith('%PDF-')).toBe(true)
  expect(file.trimEnd().endsWith('%%EOF')).toBe(true)

  const xref = readXref(file)
  xref.offsets.forEach((offset, index) => {
    const expected = `${index + 1} 0 obj`
    expect(
      file.slice(offset, offset + expected.length),
      `xref says object ${index + 1} starts at byte ${offset}`,
    ).toBe(expected)
  })

  // The trailer must agree with the table, and the catalogue must exist.
  const trailerMatch = /trailer\n<< \/Size (\d+) \/Root (\d+) 0 R/u.exec(file)
  expect(trailerMatch).not.toBeNull()
  expect(Number(trailerMatch?.[1])).toBe(xref.size)
  expect(Number(trailerMatch?.[2])).toBe(1)
  expect(file).toContain('/Type /Catalog')

  // Every object the table announces is present, and no more.
  const declared = [...file.matchAll(/(\d+) 0 obj\n/gu)].map((match) => Number(match[1]))
  expect(declared).toEqual(xref.offsets.map((_, index) => index + 1))

  return file
}

/** `/Length` must be the real byte count, or a reader stops mid-stream. */
function expectStreamLengths(file: string): number {
  const pattern = /<< \/Length (\d+) >>\nstream\n/gu
  let count = 0
  for (const match of file.matchAll(pattern)) {
    const declared = Number(match[1])
    const start = (match.index ?? 0) + match[0].length
    expect(file.slice(start + declared, start + declared + 11)).toBe('\nendstream\n')
    count += 1
  }
  return count
}

function countPageObjects(file: string): number {
  // `/Type /Pages` starts with `/Type /Page`, hence the lookahead.
  return [...file.matchAll(/\/Type \/Page(?!s)/gu)].length
}

function declaredPageCount(file: string): number {
  const match = /\/Type \/Pages \/Kids \[(.*?)\] \/Count (\d+)/u.exec(file)
  expect(match, 'the page tree must declare its kids and its count').not.toBeNull()
  return Number(match?.[2])
}

const BASE: PdfInvoiceDocument = {
  title: 'Invoice',
  number: '2026-000042',
  issuedAt: '2026-03-12',
  seller: ['Cogenta SAS', '4 rue des Lilas', '75011 Paris', 'VAT FR12345678901'],
  buyer: ['Northwind Ltd', '12 High Street', 'Bristol BS1 4ST'],
  columns: ['Description', 'Qty', 'Unit', 'Amount'],
  lines: [
    { cells: ['Annual licence', '1', '480.00', '480.00'] },
    { cells: ['Support hours', '12', '90.00', '1080.00'] },
  ],
  totals: [
    ['Subtotal', '1560.00'],
    ['VAT 20%', '312.00'],
    ['Total', '1872.00'],
  ],
  footer: 'Payment due within 30 days.',
}

function withDocument(overrides: Partial<PdfInvoiceDocument>): PdfInvoiceDocument {
  return { ...BASE, ...overrides }
}

describe('a rendered invoice is a structurally valid PDF', () => {
  it('opens with the PDF header and closes with the end-of-file marker', () => {
    const file = decodeBytes(renderInvoicePdf(BASE))
    expect(file.startsWith('%PDF-1.4\n')).toBe(true)
    expect(file.trimEnd().endsWith('%%EOF')).toBe(true)
  })

  it('records a cross-reference offset that really is where each object starts', () => {
    expectValidStructure(renderInvoicePdf(BASE))
  })

  it('declares a stream length that matches the bytes actually written', () => {
    const file = expectValidStructure(renderInvoicePdf(BASE))
    expect(expectStreamLengths(file)).toBe(1)
  })

  it('counts in the page tree exactly the pages it lists', () => {
    const file = expectValidStructure(renderInvoicePdf(BASE))
    expect(declaredPageCount(file)).toBe(countPageObjects(file))
    expect(declaredPageCount(file)).toBe(1)
  })

  it('embeds no font file, only the two base-14 faces every reader carries', () => {
    const file = decodeBytes(renderInvoicePdf(BASE))
    expect(file).toContain('/BaseFont /Helvetica /Encoding /WinAnsiEncoding')
    expect(file).toContain('/BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding')
    expect(file).not.toContain('/FontFile')
  })

  it('draws its text with the text operators a reader expects', () => {
    const file = decodeBytes(renderInvoicePdf(BASE))
    expect(file).toMatch(/BT \/F2 20 Tf 50 \d+(\.\d+)? Td \(Invoice\) Tj ET/u)
    expect(file).toContain('(2026-000042) Tj')
  })

  it('uses the A4 media box the layout is measured against', () => {
    const file = decodeBytes(renderInvoicePdf(BASE))
    expect(file).toContain('/MediaBox [0 0 595 842]')
  })
})

describe('an invoice longer than a page', () => {
  const lines = Array.from({ length: 200 }, (_, index) => ({
    cells: [
      `Item ${String(index + 1).padStart(3, '0')}`,
      String((index % 7) + 1),
      '12.50',
      `${String((index % 7) + 1)}2.50`,
    ],
  }))
  const bytes = renderInvoicePdf(withDocument({ lines }))

  it('spills onto further pages instead of overprinting one', () => {
    const file = expectValidStructure(bytes)
    expect(countPageObjects(file)).toBeGreaterThan(1)
    expect(declaredPageCount(file)).toBe(countPageObjects(file))
  })

  it('keeps one content stream per page, each with an honest length', () => {
    const file = expectValidStructure(bytes)
    expect(expectStreamLengths(file)).toBe(countPageObjects(file))
  })

  it('loses none of the two hundred lines it was given', () => {
    const file = decodeBytes(bytes)
    for (const line of lines) {
      const description = line.cells[0] ?? ''
      expect(file, `${description} must survive pagination`).toContain(`(${description}) Tj`)
    }
  })

  it('repeats the column header on every page, not only the first', () => {
    const file = decodeBytes(bytes)
    const headers = [...file.matchAll(/\(Description\) Tj/gu)].length
    expect(headers).toBe(countPageObjects(file))
  })

  it('numbers every page against the real total', () => {
    const file = decodeBytes(bytes)
    const total = countPageObjects(file)
    for (let page = 1; page <= total; page += 1) {
      expect(file).toContain(`(${page} / ${total}) Tj`)
    }
  })
})

describe('text that would otherwise corrupt the file', () => {
  it('escapes the parentheses and backslashes in a company name', () => {
    const buyer = ['Smith (Ltd) \\ Sons', 'Unit 3 (rear)']
    const file = expectValidStructure(renderInvoicePdf(withDocument({ buyer })))
    expect(file).toContain('(Smith \\(Ltd\\) \\\\ Sons) Tj')
    expect(file).toContain('(Unit 3 \\(rear\\)) Tj')
    // The literal must not close early: no bare parenthesis inside it.
    expect(file).not.toContain('(Smith (Ltd)')
  })

  it('survives a name that is nothing but delimiters', () => {
    const file = expectValidStructure(renderInvoicePdf(withDocument({ buyer: ['((((\\))))'] })))
    expect(file).toContain('(\\(\\(\\(\\(\\\\\\)\\)\\)\\)) Tj')
  })

  it('writes the euro sign and an accented letter as WinAnsi bytes', () => {
    const bytes = renderInvoicePdf(
      withDocument({
        buyer: ['Éditions Café', 'Rue de l’Église'],
        totals: [['Total à payer', '1 872,00 €']],
      }),
    )
    expectValidStructure(bytes)
    const file = decodeBytes(bytes)
    // € is 0x80 in WinAnsi, not the three UTF-8 bytes; É is 0xC9, é 0xE9, ’ 0x92.
    expect(file).toContain('\u0080')
    expect(file).toContain('\u00c9')
    expect(file).toContain('\u00e9')
    expect(file).toContain('\u0092')
    expect(file).not.toContain('\u20ac')
    for (const byte of bytes) expect(byte).toBeLessThanOrEqual(0xff)
  })

  it('substitutes a character WinAnsi cannot carry rather than breaking', () => {
    const bytes = renderInvoicePdf(withDocument({ buyer: ['株式会社 🎉 Ltd'] }))
    expectValidStructure(bytes)
    // Four ideographs become four marks and the emoji — a surrogate pair —
    // becomes one, not two: substitution counts code points, not code units.
    expect(decodeBytes(bytes)).toContain('(???? ? Ltd) Tj')
  })

  it('keeps a cell too wide for its column instead of cutting it', () => {
    const long =
      'Consultancy on the migration of the legacy catalogue including data cleansing and reconciliation'
    const bytes = renderInvoicePdf(
      withDocument({ lines: [{ cells: [long, '1', '900.00', '900.00'] }] }),
    )
    const file = expectValidStructure(bytes)
    for (const word of long.split(' ')) {
      expect(file, `${word} must not be truncated away`).toContain(word)
    }
  })
})

describe('a rendered invoice is reproducible', () => {
  it('produces byte-identical output for the same document', () => {
    expect(renderInvoicePdf(BASE)).toEqual(renderInvoicePdf(BASE))
  })

  it('carries no clock and no random identifier', () => {
    const file = decodeBytes(renderInvoicePdf(BASE))
    // The only date in the file is the one the document itself declares.
    expect(file).toContain('/CreationDate (D:20260312000000Z)')
    expect(file).not.toContain('/ID')
    expect([...file.matchAll(/D:\d{14}/gu)]).toHaveLength(1)
  })

  it('omits the creation date entirely when the issue date is not machine-readable', () => {
    const file = expectValidStructure(renderInvoicePdf(withDocument({ issuedAt: '12 March 2026' })))
    expect(file).not.toContain('/CreationDate')
    expect(file).toContain('(12 March 2026) Tj')
  })
})

describe('a document at its edges', () => {
  it('renders an invoice with no lines at all', () => {
    const file = expectValidStructure(renderInvoicePdf(withDocument({ lines: [] })))
    expect(declaredPageCount(file)).toBe(1)
    expect(file).toContain('(Description) Tj')
  })

  it('renders an invoice with neither columns nor totals nor footer', () => {
    const bytes = renderInvoicePdf({
      title: 'Invoice',
      number: '1',
      issuedAt: '2026-01-01',
      seller: [],
      buyer: [],
      columns: [],
      lines: [],
      totals: [],
    })
    const file = expectValidStructure(bytes)
    expect(declaredPageCount(file)).toBe(1)
    expect(expectStreamLengths(file)).toBe(1)
  })

  it('widens the table rather than dropping a cell the header did not announce', () => {
    const file = expectValidStructure(
      renderInvoicePdf(
        withDocument({
          columns: ['Description', 'Amount'],
          lines: [{ cells: ['Extra', '1', '5.00', 'SURPLUS'] }],
        }),
      ),
    )
    expect(file).toContain('(SURPLUS) Tj')
  })

  it('pads a row shorter than the header instead of shifting its amount left', () => {
    const file = expectValidStructure(
      renderInvoicePdf(withDocument({ lines: [{ cells: ['Rounding'] }] })),
    )
    expect(file).toContain('(Rounding) Tj')
  })
})
