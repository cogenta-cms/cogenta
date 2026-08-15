import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
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

describe('bounding what one upload can cost', () => {
  it('truncates past the character cap and says so, rather than silently dropping the tail', () => {
    const long = `${'Une exigence répétée. '.repeat(20_000)}CONTRAINTE FINALE`

    const result = extractDocumentText({ filename: 'long.md', bytes: Buffer.from(long, 'utf8') })

    expect(result.truncated).toBe(true)
    expect(result.characters).toBe(MAX_TEXT_CHARACTERS)
    expect(result.text).not.toContain('CONTRAINTE FINALE')
    expect(result.warnings.join(' ')).toContain('not read')
  })
})
