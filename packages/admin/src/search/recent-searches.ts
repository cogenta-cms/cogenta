/**
 * Recent searches — `localStorage` only, never sent to the server (fiche 36
 * task 5): a query someone typed is that person's own, and the server has no
 * legitimate use for a history of what an editor searched for.
 */

const STORAGE_KEY = 'cogenta.admin.recentSearches'
const MAX_ENTRIES = 8

function readAll(): readonly string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is string => typeof value === 'string')
  } catch {
    return []
  }
}

export function recentSearches(): readonly string[] {
  return readAll()
}

export function rememberSearch(query: string): void {
  const trimmed = query.trim()
  if (trimmed.length === 0) return
  try {
    const deduplicated = [trimmed, ...readAll().filter((entry) => entry !== trimmed)]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deduplicated.slice(0, MAX_ENTRIES)))
  } catch {
    // A full or disabled localStorage (private browsing) loses the
    // convenience, not the search itself.
  }
}

export function clearRecentSearches(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do if storage is unavailable.
  }
}
