import { describe, expect, it } from 'vitest'
import { parseInlineFilters } from '../../src/search/inline-filters.js'

describe('parseInlineFilters', () => {
  it('extracts a status filter and leaves the rest as free text', () => {
    expect(parseInlineFilters('status:draft cathedral')).toEqual({
      text: 'cathedral',
      status: 'draft',
    })
  })

  it('extracts collection and locale filters together', () => {
    expect(parseInlineFilters('collection:article locale:fr cathédrale')).toEqual({
      text: 'cathédrale',
      collection: 'article',
      locale: 'fr',
    })
  })

  it('is case-insensitive on the filter key but not on the collection value', () => {
    expect(parseInlineFilters('STATUS:Draft Collection:Article word')).toEqual({
      text: 'word',
      status: 'draft',
      collection: 'Article',
    })
  })

  it('leaves an unknown key:value pair in the free text rather than dropping it', () => {
    expect(parseInlineFilters('site:example.com cathedral')).toEqual({
      text: 'site:example.com cathedral',
    })
  })

  it('returns only the free text when there is no filter at all', () => {
    expect(parseInlineFilters('a plain query')).toEqual({ text: 'a plain query' })
  })

  it('collapses to an empty free text for a filter-only query', () => {
    expect(parseInlineFilters('status:draft')).toEqual({ text: '', status: 'draft' })
  })

  it('tolerates repeated whitespace', () => {
    expect(parseInlineFilters('  status:draft   cathedral  ')).toEqual({
      text: 'cathedral',
      status: 'draft',
    })
  })

  it('handles an empty query', () => {
    expect(parseInlineFilters('')).toEqual({ text: '' })
  })
})
