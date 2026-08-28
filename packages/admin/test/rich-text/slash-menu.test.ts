import { describe, expect, it } from 'vitest'
import { filterSlashItems, SLASH_ITEMS } from '../../src/rich-text/slash-menu.js'

const LABELS: Readonly<Record<string, string>> = {
  'richText.blockH2': 'Heading 2',
  'richText.blockH3': 'Heading 3',
  'richText.blockH4': 'Heading 4',
  'richText.blockQuote': 'Quote',
  'richText.blockBullet': 'Bulleted list',
  'richText.blockNumber': 'Numbered list',
  'richText.insertImageButton': 'Insert image',
  'richText.blockHr': 'Horizontal rule',
}

function translate(key: string): string {
  return LABELS[key] ?? key
}

describe('filterSlashItems', () => {
  it('returns every item for an empty query', () => {
    expect(filterSlashItems('', translate)).toEqual(SLASH_ITEMS)
  })

  it('filters by the translated label, case- and accent-insensitively', () => {
    const results = filterSlashItems('QUOTE', translate)
    expect(results.map((item) => item.id)).toEqual(['quote'])
  })

  it('matches "list" against both list items, and nothing else', () => {
    const results = filterSlashItems('list', translate)
    expect(results.map((item) => item.id).sort()).toEqual(['bullet', 'number'])
  })

  it('returns nothing for a query matching no item', () => {
    expect(filterSlashItems('zzz-nope', translate)).toEqual([])
  })

  it('never offers a table or a code block — table still has no ADR, code block stays toolbar-only', () => {
    const ids = SLASH_ITEMS.map((item) => item.id)
    expect(ids).not.toContain('table')
    expect(ids).not.toContain('code')
  })

  it('offers a horizontal rule (fiche 42 task 2), a real vocabulary node now', () => {
    const results = filterSlashItems('horizontal', translate)
    expect(results.map((item) => item.id)).toEqual(['hr'])
    expect(SLASH_ITEMS.find((item) => item.id === 'hr')).toMatchObject({ kind: 'hr' })
  })
})
