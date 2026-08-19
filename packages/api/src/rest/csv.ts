/**
 * A hand-written CSV reader/writer, for redirect import/export (fiche 12
 * task 4).
 *
 * No dependency, by rule R9: quoted fields, embedded commas, embedded
 * newlines and doubled-quote escaping are the entire feature a CSV parser
 * needs for this — a package is not warranted for that, and R9 asks that the
 * smaller option be preferred whenever it is real. Loosely RFC 4180: `,` field
 * separator, `"…"` quoting with `""` as an escaped quote, `\r\n` or `\n` line
 * endings accepted on the way in, `\r\n` written on the way out.
 */

/** Parses CSV text into rows of fields. A trailing newline produces no phantom empty row. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const length = text.length

  while (i < length) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += ch
      i += 1
      continue
    }

    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i += 1
      continue
    }
    if (ch === '\r') {
      i += 1
      continue
    }
    if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i += 1
      continue
    }
    field += ch
    i += 1
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

/** The reverse of `parseCsv`: quotes a field only when it needs it. */
function escapeField(value: string): string {
  return /[",\r\n]/u.test(value) ? `"${value.replace(/"/gu, '""')}"` : value
}

export function stringifyCsv(rows: readonly (readonly string[])[]): string {
  return (
    rows.map((row) => row.map(escapeField).join(',')).join('\r\n') + (rows.length > 0 ? '\r\n' : '')
  )
}
