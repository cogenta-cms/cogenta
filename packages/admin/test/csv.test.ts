import { describe, expect, it } from 'vitest'
import { csvField, toCsv } from '../src/lib/csv.js'

describe('csvField', () => {
  it('leaves a plain field untouched', () => {
    expect(csvField('First article')).toBe('First article')
  })

  it('quotes a field containing a comma', () => {
    expect(csvField('Title, with a comma')).toBe('"Title, with a comma"')
  })

  it('quotes a field containing a double quote, and doubles the quote', () => {
    expect(csvField('She said "hello"')).toBe('"She said ""hello"""')
  })

  it('quotes a field containing a newline', () => {
    expect(csvField('line one\nline two')).toBe('"line one\nline two"')
  })

  it('quotes a field with both a comma and a quote', () => {
    expect(csvField('Title, "quoted"')).toBe('"Title, ""quoted"""')
  })
})

describe('toCsv', () => {
  it('produces a valid CSV document with CRLF line endings', () => {
    const csv = toCsv([
      ['id', 'title', 'status'],
      ['entry-1', 'First article', 'published'],
      ['entry-2', 'Second, "tricky" title', 'draft'],
    ])

    const lines = csv.split('\r\n')
    expect(lines).toEqual([
      'id,title,status',
      'entry-1,First article,published',
      'entry-2,"Second, ""tricky"" title",draft',
    ])
  })

  it('round-trips through a naive CSV parser for the escaped row', () => {
    // A minimal RFC 4180 parser, just enough to prove the escaping above is
    // actually readable back out, not merely "looks plausible".
    function parseLine(line: string): string[] {
      const fields: string[] = []
      let current = ''
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (inQuotes) {
          if (char === '"' && line[i + 1] === '"') {
            current += '"'
            i++
          } else if (char === '"') {
            inQuotes = false
          } else {
            current += char
          }
        } else if (char === '"') {
          inQuotes = true
        } else if (char === ',') {
          fields.push(current)
          current = ''
        } else {
          current += char
        }
      }
      fields.push(current)
      return fields
    }

    const csv = toCsv([['entry-2', 'Second, "tricky" title', 'draft']])
    expect(parseLine(csv)).toEqual(['entry-2', 'Second, "tricky" title', 'draft'])
  })
})
