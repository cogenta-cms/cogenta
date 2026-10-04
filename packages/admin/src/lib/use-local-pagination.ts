import { useCallback, useEffect, useState } from 'react'

/** Pagination of an already complete list: never a substitute for an API cursor. */
export function useLocalPagination<T>(
  items: readonly T[],
  resetKey = '',
  pageSize = 10,
): {
  readonly items: readonly T[]
  readonly page: number
  readonly pageCount: number
  readonly start: number
  readonly total: number
  onPageChange(page: number): void
} {
  const [position, setPosition] = useState({ key: resetKey, page: 0 })
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const page = position.key === resetKey ? Math.min(position.page, pageCount - 1) : 0
  useEffect(() => {
    setPosition((current) =>
      current.key !== resetKey
        ? { key: resetKey, page: 0 }
        : current.page >= pageCount
          ? { ...current, page: pageCount - 1 }
          : current,
    )
  }, [resetKey, pageCount])
  const onPageChange = useCallback(
    (next: number) =>
      setPosition({ key: resetKey, page: Math.max(0, Math.min(next, pageCount - 1)) }),
    [resetKey, pageCount],
  )
  const start = page * pageSize
  return {
    items: items.slice(start, start + pageSize),
    page,
    pageCount,
    start,
    total: items.length,
    onPageChange,
  }
}
