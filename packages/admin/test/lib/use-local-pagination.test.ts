import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useLocalPagination } from '../../src/lib/use-local-pagination.js'

describe('pagination of complete local lists', () => {
  const items = Array.from({ length: 25 }, (_, index) => index)

  it('reaches every item across pages without changing its global index', () => {
    const { result } = renderHook(() => useLocalPagination(items))
    expect(result.current.items).toEqual(items.slice(0, 10))
    act(() => result.current.onPageChange(1))
    expect(result.current.start).toBe(10)
    expect(result.current.items).toEqual(items.slice(10, 20))
    act(() => result.current.onPageChange(2))
    expect(result.current.items).toEqual(items.slice(20))
  })

  it('resets a changed filter to the first page even when the new list still spans pages', () => {
    const { result, rerender } = renderHook(({ key }) => useLocalPagination(items, key), {
      initialProps: { key: '' },
    })
    act(() => result.current.onPageChange(2))
    rerender({ key: 'new filter' })
    expect(result.current.page).toBe(0)
    expect(result.current.items).toEqual(items.slice(0, 10))
  })

  it('keeps the current page on refresh and returns to the last existing page after deletion', () => {
    const { result, rerender } = renderHook(({ list }) => useLocalPagination(list), {
      initialProps: { list: items },
    })
    act(() => result.current.onPageChange(2))
    rerender({ list: [...items] })
    expect(result.current.page).toBe(2)
    rerender({ list: items.slice(0, 20) })
    expect(result.current.page).toBe(1)
    expect(result.current.items).toEqual(items.slice(10, 20))
    rerender({ list: items })
    expect(result.current.page).toBe(1)
    rerender({ list: [] })
    expect(result.current.page).toBe(0)
    expect(result.current.items).toEqual([])
  })
})
