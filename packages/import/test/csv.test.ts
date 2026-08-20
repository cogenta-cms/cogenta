import { CogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { parseCsv } from '../src/csv.js'

describe('parseCsv', () => {
  it('parses a simple comma-separated file into rows keyed by header', () => {
    const { headers, rows } = parseCsv('title,slug\nHello,hello\nWorld,world\n')
    expect(headers).toEqual(['title', 'slug'])
    expect(rows).toEqual([
      { title: 'Hello', slug: 'hello' },
      { title: 'World', slug: 'world' },
    ])
  })

  it('keeps a comma inside a quoted field as data, not a separator', () => {
    const { rows } = parseCsv('title,body\n"Hello, world",text\n')
    expect(rows).toEqual([{ title: 'Hello, world', body: 'text' }])
  })

  it('keeps a newline inside a quoted field as data, not a row break', () => {
    const { rows } = parseCsv('title,body\n"Line one\nLine two",x\n')
    expect(rows).toEqual([{ title: 'Line one\nLine two', body: 'x' }])
  })

  it('unescapes a doubled quote into one literal quote', () => {
    const { rows } = parseCsv('title\n"She said ""hi"""\n')
    expect(rows).toEqual([{ title: 'She said "hi"' }])
  })

  it('strips a UTF-8 BOM from the first header', () => {
    const { headers } = parseCsv('﻿title,slug\na,b\n')
    expect(headers).toEqual(['title', 'slug'])
  })

  it('accepts CRLF line endings the same as bare LF', () => {
    const { rows } = parseCsv('title,slug\r\nHello,hello\r\nWorld,world\r\n')
    expect(rows).toEqual([
      { title: 'Hello', slug: 'hello' },
      { title: 'World', slug: 'world' },
    ])
  })

  it('pads a short row with empty strings and drops extra cells of a long row', () => {
    const { rows } = parseCsv('a,b,c\n1,2\n1,2,3,4\n')
    expect(rows).toEqual([
      { a: '1', b: '2', c: '' },
      { a: '1', b: '2', c: '3' },
    ])
  })

  it('rejects a file with no header row', () => {
    expect(() => parseCsv('')).toThrow(CogentaError)
  })

  it('rejects a duplicated column header', () => {
    expect(() => parseCsv('title,title\na,b\n')).toThrow(CogentaError)
  })

  it('rejects an empty column header', () => {
    expect(() => parseCsv('title,\na,b\n')).toThrow(CogentaError)
  })

  it('handles a file with no trailing newline', () => {
    const { rows } = parseCsv('title,slug\nHello,hello')
    expect(rows).toEqual([{ title: 'Hello', slug: 'hello' }])
  })
})
