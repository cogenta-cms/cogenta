import { describe, expect, it } from 'vitest'
import { csvField, csvHeaderRow, csvSubmissionRow, csvValueColumns, toCsvRow } from '../src/csv.js'
import type { FormSubmission } from '../src/types.js'

/**
 * Fiche 47 task 9's own non-regression requirement: the CWE-1236
 * formula-injection guard `packages/admin/src/lib/csv.ts` already has must
 * still hold once the export moves from "built client-side from an
 * already-loaded page" to "streamed from the server". `csvField` here is a
 * deliberate mirror of that file — this test is what proves the mirror
 * did not drift.
 */

describe('csvField — CWE-1236 formula-injection guard, server-streamed export', () => {
  it('prefixes a leading "=" with a single quote', () => {
    expect(csvField('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)")
  })

  it('prefixes a leading "+", "-" or "@" the same way', () => {
    expect(csvField('+1+1')).toBe("'+1+1")
    expect(csvField('-2+3')).toBe("'-2+3")
    expect(csvField('@import')).toBe("'@import")
  })

  it('leaves an ordinary value untouched', () => {
    expect(csvField('visitor@example.com')).toBe('visitor@example.com')
  })

  it('still quotes a formula-guarded value that also needs comma/quote escaping', () => {
    expect(csvField('=A1,"gotcha"')).toBe(`"'=A1,""gotcha"""`)
  })

  it('quotes a value containing a comma, quote or line break', () => {
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('a"b')).toBe('"a""b"')
    expect(csvField('a\nb')).toBe('"a\nb"')
  })
})

describe('toCsvRow / csvHeaderRow / csvSubmissionRow', () => {
  const submission: FormSubmission = {
    id: 'sub-1',
    formId: 'form-1',
    formName: 'contact',
    values: { name: '=cmd|/c calc', message: 'hello, "world"' },
    consents: [],
    status: 'new',
    ipHash: null,
    referrer: 'https://example.com/contact',
    userAgent: null,
    submittedAt: '2026-01-01T00:00:00.000Z',
  }

  it('every row a real submission produces is guarded against formula injection', () => {
    const columns = csvValueColumns([submission])
    const row = csvSubmissionRow(submission, columns)
    // An anonymous visitor's field value beginning with "=" must never
    // reach the CSV as a live formula.
    expect(row).not.toContain(',=cmd|/c calc')
    expect(row).toContain("'=cmd|/c calc")
  })

  it('rows end with CRLF, per RFC 4180', () => {
    expect(toCsvRow(['a', 'b'])).toBe('a,b\r\n')
  })

  it('the header lists a fixed set of columns before the value columns', () => {
    const header = csvHeaderRow(['name', 'message'])
    expect(header).toBe('id,form,status,submittedAt,referrer,name,message\r\n')
  })
})
