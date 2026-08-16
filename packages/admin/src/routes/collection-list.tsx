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
import {
  Button,
  buttonVariants,
  Field,
  Input,
  Notice,
  Select,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '../ui/index.js'

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
      <section aria-labelledby="collection-heading" className="flex flex-col gap-4">
        <h1 id="collection-heading" className="m-0 text-xl leading-7 font-semibold">
          {t('collectionList.notFoundHeading')}
        </h1>
        <p>
          {t('collectionList.notFoundBody')}{' '}
          <Link className="text-primary hover:underline" to="/collections">
            {t('collectionList.back')}
          </Link>
        </p>
      </section>
    )
  }

  return (
    <section aria-labelledby="collection-heading" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="collection-heading" className="m-0 text-xl leading-7 font-semibold">
          {collection.labels.plural}
        </h1>
        {canCreate && (
          <Link
            to={`/collections/${encodeURIComponent(name)}/new`}
            className={buttonVariants({ variant: 'primary' })}
          >
            {t('collectionList.newButton')}
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-4">
        {/* `<search>` rather than `role="search"`: the element carries the
            role implicitly, and one landmark is easier to keep right than a
            role attribute somebody can drop in a refactor. */}
        <search>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              setSubmitted(query)
            }}
            className="flex flex-wrap items-end gap-2"
          >
            <Field label={t('collectionList.searchLabel')}>
              {(control) => (
                <Input
                  {...control}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              )}
            </Field>
            <Button type="submit" variant="secondary">
              {t('collectionList.searchButton')}
            </Button>
            {submitted !== '' && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setQuery('')
                  setSubmitted('')
                }}
              >
                {t('collectionList.clearSearch')}
              </Button>
            )}
          </form>
        </search>

        <div className="max-w-xs">
          <Field label={t('collectionList.statusFilter')}>
            {(control) => (
              <Select
                {...control}
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
              </Select>
            )}
          </Field>
        </div>

        <button type="button" onClick={exportCsv}>
          {t('collectionList.exportCsv')}
        </button>

        {canDelete && selected.size > 0 && (
          <Button variant="destructive" onClick={() => void deleteSelected()}>
            {t('collectionList.deleteSelected', { count: selected.size })}
          </Button>
        )}
      </div>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}
      {searching && <p>{t('common.loading')}</p>}
      {loading && hits === null && <p>{t('common.loading')}</p>}

      {hits !== null && !searching && (
        <section aria-labelledby="search-results-heading" className="flex flex-col gap-3">
          <h2 id="search-results-heading" className="m-0 text-base leading-6 font-semibold">
            {t('collectionList.searchResults', { count: hits.length })}
          </h2>
          {hits.length === 0 ? (
            <p>{t('collectionList.noMatches')}</p>
          ) : (
            <TableRoot label={t('collectionList.searchResultsTableLabel')}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>{t('collectionList.titleColumn')}</TableHeader>
                    <TableHeader>{t('collectionList.statusColumn')}</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {hits.map((hit) => (
                    <TableRow key={hit.id}>
                      <TableCell>
                        <Link
                          className="font-medium text-primary hover:underline"
                          to={`/collections/${encodeURIComponent(name)}/${encodeURIComponent(hit.id)}`}
                        >
                          {hit.title === '' ? hit.id : hit.title}
                        </Link>
                      </TableCell>
                      <TableCell>{hit.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableRoot>
          )}
        </section>
      )}

      {hits === null && !loading && error === null && (
        <>
          <TableRoot label={t('collectionList.tableLabel')}>
            <Table>
              <TableHead>
                <TableRow>
                  {canDelete && <TableHeader aria-label={t('collectionList.selectionColumn')} />}
                  <TableHeader>{t('collectionList.titleColumn')}</TableHeader>
                  <SortableHeader
                    field="id"
                    label={t('collectionList.idColumn')}
                    sort={sort}
                    onSort={toggleSort}
                  />
                  <TableHeader>{t('collectionList.statusColumn')}</TableHeader>
                  <SortableHeader
                    field="updatedAt"
                    label={t('collectionList.updatedColumn')}
                    sort={sort}
                    onSort={toggleSort}
                  />
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((entry) => (
                  <TableRow key={entry.id}>
                    {canDelete && (
                      <TableCell>
                        <input
                          type="checkbox"
                          aria-label={t('collectionList.selectRow', { title: titleOf(entry) })}
                          checked={selected.has(entry.id)}
                          onChange={() => toggleSelected(entry.id)}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <Link
                        className="font-medium text-primary hover:underline"
                        to={`/collections/${encodeURIComponent(name)}/${encodeURIComponent(entry.id)}`}
                      >
                        {titleOf(entry)}
                      </Link>
                    </TableCell>
                    <TableCell>{entry.id}</TableCell>
                    <TableCell>{entry.status}</TableCell>
                    <TableCell>{entry.updatedAt}</TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableEmpty colSpan={canDelete ? 5 : 4}>
                    {t('collectionList.noContent')}
                  </TableEmpty>
                )}
              </TableBody>
            </Table>
          </TableRoot>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={cursorStack.length <= 1}
              onClick={() => setCursorStack((s) => s.slice(0, -1))}
            >
              {t('collectionList.previous')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!hasMore || nextCursor === null}
              onClick={() => setCursorStack((s) => [...s, nextCursor ?? undefined])}
            >
              {t('collectionList.next')}
            </Button>
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
    <TableHeader
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className="inline-flex cursor-pointer appearance-none items-center gap-1 border-none bg-transparent p-0 font-inherit font-semibold text-inherit"
      >
        {label}
        {active && (sort.direction === 'asc' ? ' ▲' : ' ▼')}
      </button>
    </TableHeader>
  )
}
