import { type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { ApiError } from '../api/client.js'
import {
  deleteEntry,
  type Entry,
  listEntries,
  type SortDirection,
  type SortField,
} from '../api/content-client.js'
import { type SearchHit, searchContent } from '../api/search-client.js'
import { useAuth } from '../auth/auth-context.js'
import { downloadCsv, toCsv } from '../lib/csv.js'
import { canPerform } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
import type { CollectionSummary } from '../schema/types.js'
import '../styles/collection-list.css'

const STATUSES = ['draft', 'scheduled', 'published', 'archived'] as const

function titleOf(entry: Entry): string {
  const candidate = Object.values(entry.values).find((value) => typeof value === 'string')
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : entry.id
}

/**
 * L2 task 6: filters, sort, pagination and a bulk action, for one collection
 * at a time. Row-level and bulk-delete visibility both go through
 * `canPerform` — the same rule the server enforces, so nothing shown here
 * can be clicked into a 403.
 */
export function CollectionListRoute(): JSX.Element {
  const { t } = useTranslation()
  const { name = '' } = useParams<{ name: string }>()
  const auth = useAuth()
  const schema = useSchema()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []

  const collection: CollectionSummary | undefined =
    schema.status === 'ready' ? schema.schema.collections.find((c) => c.name === name) : undefined

  const [sort, setSort] = useState<{ field: SortField; direction: SortDirection }>({
    field: 'updatedAt',
    direction: 'desc',
  })
  const [status, setStatus] = useState('')
  const [items, setItems] = useState<readonly Entry[]>([])
  const [cursorStack, setCursorStack] = useState<readonly (string | undefined)[]>([undefined])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // The full-text search (L10 task 3). Two pieces of state, not one: `query`
  // is what the field holds while somebody types, `submitted` is what the
  // server was actually asked. Searching on every keystroke would send a
  // ranked query per character.
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [hits, setHits] = useState<readonly SearchHit[] | null>(null)
  const [searching, setSearching] = useState(false)

  const cursor = cursorStack[cursorStack.length - 1]

  const load = useCallback(async () => {
    if (token === null || collection === undefined) return
    setLoading(true)
    setError(null)
    try {
      const page = await listEntries(token, collection.name, {
        sort,
        ...(status === '' ? {} : { status }),
        ...(cursor === undefined ? {} : { after: cursor }),
      })
      setItems(page.items)
      setHasMore(page.hasMore)
      setNextCursor(page.nextCursor)
      setSelected(new Set())
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('collectionList.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, collection, sort, status, cursor, t])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * Runs the search, or clears it when the field is empty.
   *
   * `status` is passed through so that "search my drafts" is the same
   * decision as "filter by draft" — and the server refuses it for a role
   * that may not read drafts, rather than this component guessing.
   */
  const runSearch = useCallback(async () => {
    if (token === null || collection === undefined) return
    const text = submitted.trim()
    if (text === '') {
      setHits(null)
      return
    }
    setSearching(true)
    setError(null)
    try {
      const results = await searchContent(token, text, {
        collections: [collection.name],
        ...(status === '' ? {} : { status }),
      })
      setHits(results.hits)
    } catch (caught) {
      setHits([])
      setError(caught instanceof ApiError ? caught.message : t('collectionList.searchError'))
    } finally {
      setSearching(false)
    }
  }, [token, collection, submitted, status, t])

  useEffect(() => {
    void runSearch()
  }, [runSearch])

  function toggleSort(field: SortField): void {
    setCursorStack([undefined])
    setSort((current) =>
      current.field === field
        ? { field, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { field, direction: 'asc' },
    )
  }

  function toggleSelected(id: string): void {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function deleteSelected(): Promise<void> {
    if (token === null || collection === undefined) return
    await Promise.all([...selected].map((id) => deleteEntry(token, collection.name, id)))
    await load()
  }

  const canDelete = useMemo(
    () => collection !== undefined && canPerform('delete', collection, roles),
    [collection, roles],
  )
  const canCreate = useMemo(
    () => collection !== undefined && canPerform('create', collection, roles),
    [collection, roles],
  )

  /**
   * Exports whatever is currently on screen — the search results when a
   * search is active, the filtered/sorted list otherwise — never a fresh,
   * unfiltered fetch. Generated entirely client-side (R9: a CSV this small
   * needs no dependency) from data the page already loaded.
   *
   * A search hit carries no `createdAt`/`updatedAt` (`SearchHit` is a
   * narrower shape than `Entry`), so those two columns are left blank rather
   * than invented.
   */
  function exportCsv(): void {
    if (collection === undefined) return
    const header = [
      t('collectionList.idColumn'),
      t('collectionList.titleColumn'),
      t('collectionList.statusColumn'),
      t('collectionList.createdColumn'),
      t('collectionList.updatedColumn'),
    ]
    const rows =
      hits !== null
        ? hits.map((hit) => [hit.id, hit.title === '' ? hit.id : hit.title, hit.status, '', ''])
        : items.map((entry) => [
            entry.id,
            titleOf(entry),
            entry.status,
            entry.createdAt,
            entry.updatedAt,
          ])
    downloadCsv(`${collection.name}.csv`, toCsv([header, ...rows]))
  }

  if (schema.status === 'loading') return <p>{t('common.loading')}</p>
  if (schema.status === 'error') {
    return <p role="alert">{t('common.schemaError', { message: schema.message })}</p>
  }
  if (collection === undefined || !canPerform('read', collection, roles)) {
    return (
      <section aria-labelledby="collection-heading">
        <h1 id="collection-heading">{t('collectionList.notFoundHeading')}</h1>
        <p>
          {t('collectionList.notFoundBody')}{' '}
          <Link to="/collections">{t('collectionList.back')}</Link>
        </p>
      </section>
    )
  }

  return (
    <section aria-labelledby="collection-heading">
      <h1 id="collection-heading">{collection.labels.plural}</h1>

      {canCreate && (
        <Link to={`/collections/${encodeURIComponent(name)}/new`}>
          {t('collectionList.newButton')}
        </Link>
      )}

      <div className="collection-list__toolbar">
        {/* `<search>` rather than `role="search"`: the element carries the
            role implicitly, and one landmark is easier to keep right than a
            role attribute somebody can drop in a refactor. */}
        <search>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              setSubmitted(query)
            }}
          >
            <label htmlFor="content-search">{t('collectionList.searchLabel')}</label>
            <input
              id="content-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="submit">{t('collectionList.searchButton')}</button>
            {submitted !== '' && (
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  setSubmitted('')
                }}
              >
                {t('collectionList.clearSearch')}
              </button>
            )}
          </form>
        </search>

        <label htmlFor="status-filter">{t('collectionList.statusFilter')}</label>
        <select
          id="status-filter"
          value={status}
          onChange={(event) => {
            setCursorStack([undefined])
            setStatus(event.target.value)
          }}
        >
          <option value="">{t('collectionList.allStatuses')}</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        <button type="button" onClick={exportCsv}>
          {t('collectionList.exportCsv')}
        </button>

        {canDelete && selected.size > 0 && (
          <button type="button" onClick={() => void deleteSelected()}>
            {t('collectionList.deleteSelected', { count: selected.size })}
          </button>
        )}
      </div>

      {error !== null && <p role="alert">{error}</p>}
      {searching && <p>{t('common.loading')}</p>}
      {loading && hits === null && <p>{t('common.loading')}</p>}

      {hits !== null && !searching && (
        <section aria-labelledby="search-results-heading">
          <h2 id="search-results-heading">
            {t('collectionList.searchResults', { count: hits.length })}
          </h2>
          {hits.length === 0 ? (
            <p>{t('collectionList.noMatches')}</p>
          ) : (
            <ul>
              {hits.map((hit) => (
                <li key={hit.id}>
                  <Link
                    to={`/collections/${encodeURIComponent(name)}/${encodeURIComponent(hit.id)}`}
                  >
                    {hit.title === '' ? hit.id : hit.title}
                  </Link>{' '}
                  <span>{hit.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {hits === null && !loading && error === null && (
        <>
          <table>
            <thead>
              <tr>
                {canDelete && <th scope="col" aria-label={t('collectionList.selectionColumn')} />}
                <th scope="col">{t('collectionList.titleColumn')}</th>
                <SortableHeader
                  field="id"
                  label={t('collectionList.idColumn')}
                  sort={sort}
                  onSort={toggleSort}
                />
                <th scope="col">{t('collectionList.statusColumn')}</th>
                <SortableHeader
                  field="updatedAt"
                  label={t('collectionList.updatedColumn')}
                  sort={sort}
                  onSort={toggleSort}
                />
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <tr key={entry.id}>
                  {canDelete && (
                    <td>
                      <input
                        type="checkbox"
                        aria-label={t('collectionList.selectRow', { title: titleOf(entry) })}
                        checked={selected.has(entry.id)}
                        onChange={() => toggleSelected(entry.id)}
                      />
                    </td>
                  )}
                  <td>
                    <Link
                      to={`/collections/${encodeURIComponent(name)}/${encodeURIComponent(entry.id)}`}
                    >
                      {titleOf(entry)}
                    </Link>
                  </td>
                  <td>{entry.id}</td>
                  <td>{entry.status}</td>
                  <td>{entry.updatedAt}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={canDelete ? 5 : 4}>{t('collectionList.noContent')}</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="collection-list__pagination">
            <button
              type="button"
              disabled={cursorStack.length <= 1}
              onClick={() => setCursorStack((s) => s.slice(0, -1))}
            >
              {t('collectionList.previous')}
            </button>
            <button
              type="button"
              disabled={!hasMore || nextCursor === null}
              onClick={() => setCursorStack((s) => [...s, nextCursor ?? undefined])}
            >
              {t('collectionList.next')}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

function SortableHeader({
  field,
  label,
  sort,
  onSort,
}: {
  readonly field: SortField
  readonly label: string
  readonly sort: { readonly field: SortField; readonly direction: SortDirection }
  onSort(field: SortField): void
}): JSX.Element {
  const active = sort.field === field
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" onClick={() => onSort(field)}>
        {label}
        {active && (sort.direction === 'asc' ? ' ▲' : ' ▼')}
      </button>
    </th>
  )
}
