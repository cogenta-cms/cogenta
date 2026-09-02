import { describe, expect, it } from 'vitest'
import { humanizeFieldName } from '../../src/lib/humanize-field-name.js'

describe('humanizeFieldName', () => {
  it('splits camelCase into capitalised words', () => {
    expect(humanizeFieldName('internalCode')).toBe('Internal Code')
  })

  it('splits snake_case into capitalised words', () => {
    expect(humanizeFieldName('internal_code')).toBe('Internal Code')
  })

  it('accepts an acronym lower-cased like any other word (no acronym dictionary)', () => {
    expect(humanizeFieldName('seoTitle')).toBe('Seo Title')
  })

  it('capitalises a single lower-case word', () => {
    expect(humanizeFieldName('title')).toBe('Title')
  })

  it('leaves an already-capitalised single word alone', () => {
    expect(humanizeFieldName('Title')).toBe('Title')
  })

  it('handles a run of digits without inserting a spurious space', () => {
    expect(humanizeFieldName('field2Name')).toBe('Field2 Name')
  })
})
