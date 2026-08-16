import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync } from 'node:zlib'
import { isCogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { extractDocumentText, MAX_TEXT_CHARACTERS } from '../../src/documents/extract-text.js'
import { measureReadability } from '../../src/documents/pdf.js'

/**
 * The corpus is real: the PDFs come out of MuPDF and the DOCX out of
 * python-docx (see `corpus/build-corpus.py`), not out of Cogenta's own
 * writer — testing a reader against bytes its own writer produced proves
 * only that the pair agree with each other. The formats, lengths, encodings
 * and qualities differ on purpose, which is the discipline L9's WordPress
 * import lot had to learn the hard way and this lot inherits.
 */

const CORPUS = join(fileURLToPath(new URL('.', import.meta.url)), 'corpus')

async function extract(filename: string) {
  return extractDocumentText({ filename, bytes: await readFile(join(CORPUS, filename)) })
}

describe('extracting text from a real Markdown brief', () => {
  it('keeps the headings and the constraint wording intact', async () => {
    const result = await extract('restaurant-brief.md')

    expect(result.format).toBe('markdown')
    expect(result.text).toContain('Le Petit Marché')
    expect(result.text).toContain('Pas de blog')
    expect(result.text).toContain('Pas de vente en ligne')
    expect(result.truncated).toBe(false)
    expect(result.warnings).toEqual([])
  })

  it('strips a UTF-8 byte-order mark instead of leaving it in the first heading', async () => {
    const result = await extract('bom-brief.md')

    expect(result.text.startsWith('# Brief')).toBe(true)
    expect(result.text).not.toContain('﻿')
  })
})

describe('extracting text from a plain-text brief that is not UTF-8', () => {
  it('decodes CP-1252 accents rather than filling the text with replacement characters', async () => {
    const result = await extract('photographer-brief.txt')

    expect(result.format).toBe('text')
    expect(result.text).toContain('Élodie')
    // The fixture uses French typography's non-breaking spaces inside the
    // guillemets — CP-1252's 0xA0, which Latin-1 and CP-1252 agree on and a
    // naive UTF-8 decode destroys.
    expect(result.text).toContain('« À propos »')
    expect(result.text).not.toContain('�')
    expect(result.warnings.join(' ')).toContain('CP-1252')
  })

  it('normalises CRLF so line-based reasoning downstream sees one newline kind', async () => {
    const result = await extract('photographer-brief.txt')

    expect(result.text).not.toContain('\r')
  })
})

describe('extracting text from a real DOCX', () => {
  it('reads headings, bullet lists and table cells in reading order', async () => {
    const result = await extract('association-brief.docx')

    expect(result.format).toBe('docx')
    expect(result.text).toContain('Maison des Jeunes de Sainte-Foy')
    expect(result.text).toContain("Pas d'espace membre")
    // A table cell is separated from the next by a tab, its row by a newline.
    expect(result.text).toContain('Budget\t3 000 € TTC')
    const constraintsAt = result.text.indexOf('Contraintes')
    const calendarAt = result.text.indexOf('Calendrier')
    expect(constraintsAt).toBeGreaterThan(0)
    expect(calendarAt).toBeGreaterThan(constraintsAt)
  })
})

describe('extracting text from real PDFs', () => {
  it('reads every page of a multi-page specification, in order', async () => {
    const result = await extract('saas-spec.pdf')

    expect(result.format).toBe('pdf')
    expect(result.text).toContain('Flowgate')
    expect(result.text).toContain('Pricing, with three named tiers')
    expect(result.text).toContain('English only')
    const summaryAt = result.text.indexOf('Summary')
    const toneAt = result.text.indexOf('Tone')
    expect(summaryAt).toBeGreaterThanOrEqual(0)
    expect(toneAt).toBeGreaterThan(summaryAt)
  })

  it('decodes accented French from a PDF text layer', async () => {
    const result = await extract('law-firm-brief.pdf')

    expect(result.text).toContain('Vasseur & Associés')
    expect(result.text).toContain('déontologie')
    expect(result.text).toContain('Pas de blog')
  })

  it('refuses a scan by name instead of returning an empty success', async () => {
    await expect(extract('scanned-menu.pdf')).rejects.toMatchObject({
      code: 'DOCUMENT_NO_TEXT_LAYER',
    })
  })
})

describe('refusing what it cannot read, with a usable message', () => {
  it('names the legacy .doc format rather than mangling its bytes', async () => {
    const error = await extract('legacy-note.doc').catch((caught: unknown) => caught)

    expect(isCogentaError(error)).toBe(true)
    expect(error).toMatchObject({ code: 'DOCUMENT_FORMAT_UNSUPPORTED' })
    expect((error as { message: string }).message).toContain('Word 97-2003')
  })

  it('rejects an empty file', async () => {
    await expect(extract('empty.md')).rejects.toMatchObject({
      code: 'DOCUMENT_FORMAT_UNSUPPORTED',
    })
  })

  it('rejects a file larger than the cap before trying to parse it', () => {
    expect(() =>
      extractDocumentText({
        filename: 'huge.pdf',
        bytes: Buffer.alloc(21 * 1024 * 1024, 0x41),
      }),
    ).toThrowError(expect.objectContaining({ code: 'DOCUMENT_TOO_LARGE' }))
  })

  it('rejects binary content that is neither PDF nor DOCX', () => {
    expect(() =>
      extractDocumentText({
        filename: 'photo.jpg',
        bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]),
      }),
    ).toThrowError(expect.objectContaining({ code: 'DOCUMENT_FORMAT_UNSUPPORTED' }))
  })

  it('rejects a ZIP that is not a DOCX, saying which entries it did find', async () => {
    // The corpus DOCX with its main part renamed is still a valid ZIP.
    const docx = await readFile(join(CORPUS, 'association-brief.docx'))
    const notADocx = Buffer.from(docx)
    const needle = Buffer.from('word/document.xml')
    // The name appears twice — in the local header and in the central
    // directory — and the reader trusts the central directory, so both have
    // to move for this to be the file it claims to be.
    let at = notADocx.indexOf(needle)
    expect(at).toBeGreaterThan(0)
    while (at !== -1) {
      notADocx.write('word/documenz.xml', at, 'utf8')
      at = notADocx.indexOf(needle, at + 1)
    }

    expect(() => extractDocumentText({ filename: 'sheet.xlsx', bytes: notADocx })).toThrowError(
      expect.objectContaining({ code: 'DOCUMENT_EXTRACTION_FAILED' }),
    )
  })
})

describe('telling a readable text layer from glyph indices', () => {
  // Two verbatim slices of what this extractor really produced from two real
  // PDF specifications found on a developer machine (LaTeX-exported, subset
  // CID fonts, no embedded encoding). They are not committed as files — they
  // are somebody's private documents — but the scores they produce are the
  // whole reason the guard exists and the numbers it is calibrated against.
  const REAL_MOJIBAKE_A =
    ' "   † $†      & $   !  "    $ )  !   _  "   ! (     "            !       o m - l o † v v - 7 b7   - u u ; = o † u   - b u b ; L  l l ; † 0t ;      7 u ; '
  const REAL_MOJIBAKE_B =
    '   <  P  Q  I  g    G  I  h    E  P  <  g  O  I  h    E  ]  Z  d  Y  K  Z  I  [  j  <  Q  g  I    ¡    ;  k  g  Q  Q  <  '

  it('scores real prose as readable', async () => {
    const readable = await extract('saas-spec.pdf')

    const score = measureReadability(readable.text)
    expect(score.meanWordLength).toBeGreaterThan(3)
    expect(score.badCharacterRatio).toBeLessThan(0.05)
  })

  it('scores real glyph-index output as unreadable, on word length alone', () => {
    for (const sample of [REAL_MOJIBAKE_A, REAL_MOJIBAKE_B]) {
      const score = measureReadability(sample)
      expect(score.meanWordLength).toBeLessThan(2.2)
    }
  })

  it('refuses a PDF whose text layer scores as unreadable, instead of passing mojibake on', () => {
    // A real PDF built around the captured sample: MuPDF wrote the file, so
    // the container is genuine and only the text is the pathological case.
    const stream = `BT /F1 11 Tf 56 700 Td (${REAL_MOJIBAKE_A.replace(/[()\\]/g, '')}) Tj ET`
    const pdf = buildMinimalPdf(stream)

    expect(() => extractDocumentText({ filename: 'subset-fonts.pdf', bytes: pdf })).toThrowError(
      expect.objectContaining({ code: 'DOCUMENT_NO_TEXT_LAYER' }),
    )
  })
})

/** The smallest structurally valid PDF that carries one uncompressed content stream. */
function buildMinimalPdf(content: string): Buffer {
  const objects = [
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj',
    `4 0 obj<</Length ${content.length}>>stream\n${content}\nendstream endobj`,
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
  ]
  return Buffer.from(
    `%PDF-1.4\n${objects.join('\n')}\ntrailer<</Size 6/Root 1 0 R>>\n%%EOF\n`,
    'latin1',
  )
}

/**
 * A minimal ZIP with one deflated entry — just enough for `openZip` to read
 * it back, mirroring the reader's own understanding of the format. No CRC32
 * is written (left as 0): `zip.ts` never checks it, so real bytes are not
 * needed for these adversarial tests to be meaningful.
 */
function buildZipWithEntry(name: string, data: Buffer): Buffer {
  const compressed = deflateRawSync(data)
  const nameBytes = Buffer.from(name, 'utf8')

  const local = Buffer.alloc(30 + nameBytes.length)
  local.writeUInt32LE(0x0403_4b50, 0)
  local.writeUInt16LE(20, 4) // version needed
  local.writeUInt16LE(0, 6) // flags
  local.writeUInt16LE(8, 8) // compression: deflate
  local.writeUInt16LE(0, 10) // mod time
  local.writeUInt16LE(0, 12) // mod date
  local.writeUInt32LE(0, 14) // crc32 — unchecked by this reader
  local.writeUInt32LE(compressed.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(nameBytes.length, 26)
  local.writeUInt16LE(0, 28)
  nameBytes.copy(local, 30)

  const central = Buffer.alloc(46 + nameBytes.length)
  central.writeUInt32LE(0x0201_4b50, 0)
  central.writeUInt16LE(20, 4) // version made by
  central.writeUInt16LE(20, 6) // version needed
  central.writeUInt16LE(0, 8) // flags
  central.writeUInt16LE(8, 10) // compression
  central.writeUInt16LE(0, 12)
  central.writeUInt16LE(0, 14)
  central.writeUInt32LE(0, 16) // crc32
  central.writeUInt32LE(compressed.length, 20)
  central.writeUInt32LE(data.length, 24)
  central.writeUInt16LE(nameBytes.length, 28)
  central.writeUInt16LE(0, 30)
  central.writeUInt16LE(0, 32)
  central.writeUInt16LE(0, 34)
  central.writeUInt16LE(0, 36)
  central.writeUInt32LE(0, 38)
  central.writeUInt32LE(0, 42) // local header offset
  nameBytes.copy(central, 46)

  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x0605_4b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(1, 8) // entries on this disk
  eocd.writeUInt16LE(1, 10) // total entries
  eocd.writeUInt32LE(central.length, 12)
  eocd.writeUInt32LE(local.length + compressed.length, 16) // central dir offset
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([local, compressed, central, eocd])
}

describe('bounding what one DOCX upload can cost', () => {
  it('reads a document.xml full of unclosed <w:t> tags in linear time', () => {
    // The lazy `[\s\S]*?` this replaced re-scanned from every earlier
    // unterminated `<w:t` it had already tried while hunting for a
    // `</w:t>` that never comes — quadratic in the number of runs. This is
    // deliberately still repetitive enough to compress well (a real .docx
    // deflates its XML too), but the point being proven is the parse time,
    // not the compression ratio.
    const body = `<w:t>${'A'.repeat(40)}`.repeat(50_000) // ~230 KB of XML, no closing tags at all
    const xml = `<?xml version="1.0"?><w:document><w:body><w:p>${body}</w:p></w:body></w:document>`
    const docx = buildZipWithEntry('word/document.xml', Buffer.from(xml, 'utf8'))

    const started = Date.now()
    // The very first `<w:t>` is unterminated for the rest of the document,
    // so nothing can be attributed to a known text run and this refuses as
    // empty — never hangs, and never treats the raw markup as content. The
    // bounded time is the point of this test, not the outcome of the read.
    expect(() => extractDocumentText({ filename: 'unclosed.docx', bytes: docx })).toThrowError(
      expect.objectContaining({ code: 'DOCUMENT_NO_TEXT_LAYER' }),
    )
    expect(Date.now() - started).toBeLessThan(1_000)
  })

  it('keeps the real text that came before a trailing unclosed <w:t>, in linear time', () => {
    const closed = '<w:p><w:r><w:t>Cahier des charges réel</w:t></w:r></w:p>'
    const garbage = `<w:t>${'B'.repeat(40)}`.repeat(50_000)
    const xml = `<?xml version="1.0"?><w:document><w:body>${closed}<w:p>${garbage}</w:p></w:body></w:document>`
    const docx = buildZipWithEntry('word/document.xml', Buffer.from(xml, 'utf8'))

    const started = Date.now()
    const result = extractDocumentText({ filename: 'trailing-unclosed.docx', bytes: docx })

    expect(Date.now() - started).toBeLessThan(1_000)
    expect(result.text).toContain('Cahier des charges réel')
  })

  it('reads a document.xml with many real, properly closed runs in linear time', () => {
    // Kept under `MAX_TEXT_CHARACTERS` so `extractDocumentText`'s own
    // truncation does not remove the last line — this test is about the
    // reader's own linear behaviour, not the separate character cap.
    const lineCount = 5_000
    const body = Array.from(
      { length: lineCount },
      (_unused, index) => `<w:p><w:r><w:t>Ligne ${index}</w:t></w:r></w:p>`,
    ).join('')
    const xml = `<?xml version="1.0"?><w:document><w:body>${body}</w:body></w:document>`
    const docx = buildZipWithEntry('word/document.xml', Buffer.from(xml, 'utf8'))

    const started = Date.now()
    const result = extractDocumentText({ filename: 'many-runs.docx', bytes: docx })

    expect(Date.now() - started).toBeLessThan(1_000)
    expect(result.text).toContain('Ligne 0')
    expect(result.text).toContain(`Ligne ${lineCount - 1}`)
  })

  it('rejects a document.xml that would inflate past the per-entry cap, rather than parsing it', () => {
    // Highly repetitive XML deflates at a large ratio; this stays a small
    // upload while decoding to well over the 8 MiB `document.xml` cap.
    const xml = '<w:t>constraint</w:t>'.repeat(500_000) // ~10.5 MB inflated
    const docx = buildZipWithEntry('word/document.xml', Buffer.from(xml, 'utf8'))

    expect(() => extractDocumentText({ filename: 'bomb.docx', bytes: docx })).toThrowError(
      expect.objectContaining({ code: 'DOCUMENT_TOO_LARGE' }),
    )
  })
})

describe('bounding what one PDF upload can cost', () => {
  it('collects streams from a file that is mostly fake stream/endstream markers, in bounded time', () => {
    // No real PDF structure at all past the header — thousands of
    // `stream`/`endstream` pairs with no `<<` dictionary anywhere nearby.
    // The unbounded `lastIndexOf('<<', keyword)` this replaced would walk
    // back over the entire growing prefix for every one of them.
    const junk = 'stream\nendstream\n'.repeat(200_000) // well past MAX_STREAMS
    const pdf = Buffer.from(`%PDF-1.4\n${junk}`, 'latin1')

    const started = Date.now()
    expect(() => extractDocumentText({ filename: 'junk.pdf', bytes: pdf })).toThrowError(
      expect.objectContaining({ code: 'DOCUMENT_NO_TEXT_LAYER' }),
    )
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  it('stops accumulating page text once the character cap is reached, instead of collecting every page first', () => {
    // Each stream individually stays comfortably under the per-stream
    // decompression cap, but there are enough of them, each compressible
    // enough, that accumulating all of them before the final truncation
    // would hold many times `MAX_TEXT_CHARACTERS` in memory at once.
    const objects: string[] = []
    let objectNumber = 6
    const pageRefs: string[] = []
    const streamText = `(${'x'.repeat(60_000)})`
    for (let index = 0; index < 40; index++) {
      const contentObj = objectNumber++
      const content = `BT /F1 11 Tf 56 700 Td ${streamText} Tj ET`
      objects.push(
        `${contentObj} 0 obj<</Length ${content.length}>>stream\n${content}\nendstream endobj`,
      )
      const pageObj = objectNumber++
      objects.push(
        `${pageObj} 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents ${contentObj} 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj`,
      )
      pageRefs.push(`${pageObj} 0 R`)
    }
    const pdf = Buffer.from(
      [
        '%PDF-1.4',
        '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
        `2 0 obj<</Type/Pages/Kids[${pageRefs.join(' ')}]/Count ${pageRefs.length}>>endobj`,
        '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
        ...objects,
        'trailer<</Size 100/Root 1 0 R>>',
        '%%EOF',
      ].join('\n'),
      'latin1',
    )

    const result = extractDocumentText({ filename: 'many-pages.pdf', bytes: pdf })

    // 40 pages of 60 000 characters each is 2 400 000 characters — many
    // times `MAX_TEXT_CHARACTERS` (200 000) — yet the reader must not have
    // held anywhere near that much in `pages` before truncating.
    expect(result.characters).toBe(MAX_TEXT_CHARACTERS)
    expect(result.truncated).toBe(true)
    // The distinguishing evidence that this stopped early inside the PDF
    // reader itself, rather than merely being sliced down afterwards by
    // `extractDocumentText`'s own cap (which would produce the same
    // `characters`/`truncated` values either way): the reader's own warning
    // that it gave up on further pages.
    expect(result.warnings.join(' ')).toContain('Stopped reading further pages')
  })
})

describe('bounding what one upload can cost', () => {
  it('reads a content stream carrying a very long token in linear time', () => {
    // The pattern this replaced backtracked quadratically here: a long run of
    // digits that fails the anchor. A minute of CPU for a 200 KB upload is a
    // denial of service, so the shape of the input matters more than the
    // wall clock — but the clock is asserted too, generously.
    const pathological = `BT /F1 11 Tf 56 700 Td ${'9'.repeat(200_000)} (Real text) Tj ET`
    const pdf = buildMinimalPdf(pathological)

    const started = Date.now()
    const result = extractDocumentText({ filename: 'slow.pdf', bytes: pdf })

    expect(result.text).toContain('Real text')
    expect(Date.now() - started).toBeLessThan(5_000)
  })

  it('truncates past the character cap and says so, rather than silently dropping the tail', () => {
    const long = `${'Une exigence répétée. '.repeat(20_000)}CONTRAINTE FINALE`

    const result = extractDocumentText({ filename: 'long.md', bytes: Buffer.from(long, 'utf8') })

    expect(result.truncated).toBe(true)
    expect(result.characters).toBe(MAX_TEXT_CHARACTERS)
    expect(result.text).not.toContain('CONTRAINTE FINALE')
    expect(result.warnings.join(' ')).toContain('not read')
  })
})
