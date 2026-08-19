/**
 * Per-collection list-screen preferences (fiche 01 "Liste de contenu", task 6):
 * which columns to show, and how many rows per page.
 *
 * `localStorage`, never the server: this is a preference of *this browser*,
 * not data of the site — the same reasoning the CSV download already
 * relies on, in its own comment. Keyed by collection name, so two
 * collections never fight over one saved layout.
 */

export const PAGE_SIZES = [20, 50, 100] as const
export type PageSize = (typeof PAGE_SIZES)[number]

export const DEFAULT_PAGE_SIZE: PageSize = 20

export interface TablePrefs {
  /** Extra field columns to show, beyond the fixed title/id/status/updated ones. `null` means none chosen yet. */
  readonly columns: readonly string[] | null
  readonly pageSize: PageSize
}

const DEFAULT_PREFS: TablePrefs = { columns: null, pageSize: DEFAULT_PAGE_SIZE }

function storageKey(collection: string): string {
  return `cogenta.tablePrefs.${collection}`
}

function isPageSize(value: unknown): value is PageSize {
  return (PAGE_SIZES as readonly number[]).includes(value as number)
}

/** Never throws: a browser in private mode, or one that has disabled storage entirely, still gets a working screen with the defaults. */
export function loadTablePrefs(collection: string): TablePrefs {
  try {
    const raw = window.localStorage.getItem(storageKey(collection))
    if (raw === null) return DEFAULT_PREFS

    const parsed = JSON.parse(raw) as { columns?: unknown; pageSize?: unknown }
    const columns =
      Array.isArray(parsed.columns) && parsed.columns.every((value) => typeof value === 'string')
        ? (parsed.columns as readonly string[])
        : null
    const pageSize = isPageSize(parsed.pageSize) ? parsed.pageSize : DEFAULT_PAGE_SIZE

    return { columns, pageSize }
  } catch {
    return DEFAULT_PREFS
  }
}

export function saveTablePrefs(collection: string, prefs: TablePrefs): void {
  try {
    window.localStorage.setItem(storageKey(collection), JSON.stringify(prefs))
  } catch {
    // A preference that failed to save is a nicety lost, not a broken screen.
  }
}
