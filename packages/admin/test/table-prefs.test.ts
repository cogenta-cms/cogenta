import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_PAGE_SIZE,
  loadTablePrefs,
  saveTablePrefs,
  type TablePrefs,
} from '../src/lib/table-prefs.js'

describe('table-prefs', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to no chosen columns and the default page size when nothing was saved', () => {
    expect(loadTablePrefs('article')).toEqual({ columns: null, pageSize: DEFAULT_PAGE_SIZE })
  })

  it('remembers what was saved for that collection', () => {
    const prefs: TablePrefs = { columns: ['summary', 'author'], pageSize: 50 }
    saveTablePrefs('article', prefs)

    expect(loadTablePrefs('article')).toEqual(prefs)
  })

  it('keeps two collections independent', () => {
    saveTablePrefs('article', { columns: ['summary'], pageSize: 100 })
    saveTablePrefs('product', { columns: ['sku'], pageSize: 20 })

    expect(loadTablePrefs('article')).toEqual({ columns: ['summary'], pageSize: 100 })
    expect(loadTablePrefs('product')).toEqual({ columns: ['sku'], pageSize: 20 })
  })

  it('falls back to the default page size for a value outside the fixed set', () => {
    localStorage.setItem('cogenta.tablePrefs.article', JSON.stringify({ pageSize: 37 }))

    expect(loadTablePrefs('article').pageSize).toBe(DEFAULT_PAGE_SIZE)
  })

  it('never throws on corrupted storage, and falls back to the defaults', () => {
    localStorage.setItem('cogenta.tablePrefs.article', 'not valid json{{{')

    expect(loadTablePrefs('article')).toEqual({ columns: null, pageSize: DEFAULT_PAGE_SIZE })
  })
})
