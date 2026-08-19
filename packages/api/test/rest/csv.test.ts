import { describe, expect, it } from 'vitest'
import { parseCsv, stringifyCsv } from '../../src/rest/csv.js'

/**
 * The hand-written CSV reader/writer redirect import/export is built on
 * (fiche 12 task 4, rule R9 — no dependency for something this small).
 */

describe('parseCsv', () => {
  it('splits a simple file into rows of fields', () => {
    expect(parseCsv('from,to,status\n/a,/b,301\n')).toEqual([
      ['from', 'to', 'status'],
      ['/a', '/b', '301'],
    ])
  })

  it('accepts CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('does not produce a phantom row for a trailing newline', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('reads a quoted field containing a comma', () => {
    expect(parseCsv('from,to\n"/a,b",/c\n')).toEqual([
      ['from', 'to'],
      ['/a,b', '/c'],
    ])
  })

  it('reads a quoted field containing an embedded newline', () => {
    expect(parseCsv('from,to\n"line one\nline two",/c\n')).toEqual([
      ['from', 'to'],
      ['line one\nline two', '/c'],
    ])
  })

  it('unescapes a doubled quote inside a quoted field', () => {
    expect(parseCsv('from,to\n"she said ""hi""",/c\n')).toEqual([
      ['from', 'to'],
      ['she said "hi"', '/c'],
    ])
  })

  it('handles a file with no trailing newline at all', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('parses an empty string as no rows', () => {
    expect(parseCsv('')).toEqual([])
  })
})

describe('stringifyCsv', () => {
  it('quotes a field only when it needs it', () => {
    expect(stringifyCsv([['plain', 'has,comma', 'has"quote']])).toBe(
      'plain,"has,comma","has""quote"\r\n',
    )
  })

  it('round-trips a field with an embedded newline', () => {
    const csv = stringifyCsv([
      ['from', 'to'],
      ['a\nb', 'c'],
    ])
    expect(parseCsv(csv)).toEqual([
      ['from', 'to'],
      ['a\nb', 'c'],
    ])
  })

  it('round-trips 300 rows, the scale the fiche names as its test target', () => {
    const rows: string[][] = [['from', 'to', 'status']]
    for (let i = 0; i < 300; i += 1) rows.push([`/old-${i}`, `/new-${i}`, '301'])

    const csv = stringifyCsv(rows)
    const parsed = parseCsv(csv)
    expect(parsed).toHaveLength(301)
    expect(parsed[1]).toEqual(['/old-0', '/new-0', '301'])
    expect(parsed[300]).toEqual(['/old-299', '/new-299', '301'])
  })
})
