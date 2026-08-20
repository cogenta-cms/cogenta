import { CogentaError } from '@cogenta/core'

/**
 * A hand-rolled CSV parser (RFC 4180), fiche 25 task 5.
 *
 * R9: a correct parser — quoted fields, an embedded comma, an embedded
 * newline inside a quoted field, a doubled `""` escaping a literal quote,
 * a UTF-8 BOM, and both CRLF and bare LF line endings — is a hundred lines.
 * No dependency earns its place over that.
 */

export interface ParsedCsv {
  readonly headers: readonly string[]
  /** One object per data row, keyed by header. A short row pads with `''`; a long row's extra cells are dropped. */
  readonly rows: readonly Readonly<Record<string, string>>[]
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/** Splits CSV text into rows of raw cells, respecting quoted fields. */
function tokenize(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  let i = 0
  const length = text.length

  while (i < length) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      cell += char
      i += 1
      continue
    }

    if (char === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (char === ',') {
      row.push(cell)
      cell = ''
      i += 1
      continue
    }
    if (char === '\r') {
      // Peek past a possible \n — either way this ends the row.
      row.push(cell)
      cell = ''
      rows.push(row)
      row = []
      i += text[i + 1] === '\n' ? 2 : 1
      continue
    }
    if (char === '\n') {
      row.push(cell)
      cell = ''
      rows.push(row)
      row = []
      i += 1
      continue
    }
    cell += char
    i += 1
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  return rows
}

export function parseCsv(text: string): ParsedCsv {
  const rows = tokenize(stripBom(text)).filter((row) => !(row.length === 1 && row[0] === ''))
  const [headerRow, ...dataRows] = rows
  if (headerRow === undefined) {
    throw new CogentaError({
      code: 'IMPORT_CSV_INVALID',
      message: 'This CSV file has no header row.',
      hint: 'The first line must name each column.',
    })
  }

  const headers = headerRow.map((header) => header.trim())
  const seen = new Set<string>()
  for (const header of headers) {
    if (header.length === 0) {
      throw new CogentaError({
        code: 'IMPORT_CSV_INVALID',
        message: 'A column header is empty.',
        hint: 'Every column needs a non-empty name.',
      })
    }
    if (seen.has(header)) {
      throw new CogentaError({
        code: 'IMPORT_CSV_INVALID',
        message: `Column "${header}" appears more than once.`,
        hint: 'Rename one of the duplicate columns.',
        details: { header },
      })
    }
    seen.add(header)
  }

  const parsedRows = dataRows.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])),
  )

  return { headers, rows: parsedRows }
}
