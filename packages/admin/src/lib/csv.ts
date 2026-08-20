/** The characters a spreadsheet reads as "this cell is a formula" when they open a cell's value. */
const FORMULA_LEADING_CHARS = new Set(['=', '+', '-', '@'])

/**
 * A minimal CSV writer, hand-rolled rather than a dependency (R9 — this is a
 * handful of lines, not a case for a library).
 *
 * Escaping follows RFC 4180: a field containing a comma, a double quote or a
 * line break is wrapped in double quotes, and any double quote inside it is
 * doubled. Every other field is written as-is.
 *
 * A value whose first character reads as a spreadsheet formula (`=`, `+`,
 * `-`, `@`) is prefixed with a single quote first — the standard CSV/formula
 * injection mitigation (CWE-1236). Without it, an anonymous-visitor-supplied
 * field (a form submission, say) exported to CSV and opened in Excel or
 * Sheets can execute as a live formula, up to remote-content or DDE
 * execution depending on the application and its settings.
 */
export function csvField(value: string): string {
  const guarded = FORMULA_LEADING_CHARS.has(value.charAt(0)) ? `'${value}` : value
  if (/[",\n\r]/u.test(guarded)) {
    return `"${guarded.replace(/"/gu, '""')}"`
  }
  return guarded
}

/** Rows of plain strings, joined into one CSV document with CRLF line endings (RFC 4180). */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(csvField).join(',')).join('\r\n')
}

/**
 * Triggers a browser download of `content` as a named file.
 *
 * No server round trip: the caller already has the data in memory (this
 * page's already-loaded, already-filtered entries), so generating and
 * downloading the file is entirely client-side.
 *
 * A leading UTF-8 BOM is prepended so that Excel — which otherwise guesses
 * the wrong codepage — opens accented characters correctly.
 */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob(['﻿', content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
