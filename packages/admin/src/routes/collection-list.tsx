import { type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router'
import { ApiError } from '../api/client.js'
import {
  deleteEntry,
  duplicateEntry,
  type Entry,
  issuePreview,
  listEntries,
  publishEntry,
  type SortDirection,
  type SortField,
  unpublishEntry,
} from '../api/content-client.js'
import { type SearchHit, searchContent } from '../api/search-client.js'
import { listTerms, type Term } from '../api/taxonomy-client.js'
import { useAuth } from '../auth/auth-context.js'
import { downloadCsv, toCsv } from '../lib/csv.js'
import { titleOf } from '../lib/entry-title.js'
import { loadTablePrefs, PAGE_SIZES, saveTablePrefs } from '../lib/table-prefs.js'
import { canPerform } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
import type { CollectionSummary, SchemaField } from '../schema/types.js'
import {
  Button,
  buttonVariants,
  Field,
  Input,
  Modal,
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

type BulkAction = 'publish' | 'unpublish' | 'duplicate' | 'trash'

interface BulkFailure {
  readonly id: string
  readonly title: string
  readonly message: string
}

interface BulkReport {
  readonly action: BulkAction
  readonly total: number
  readonly failures: readonly BulkFailure[]
}

/** A value from a declared field, rendered as plain text for an extra table column (task 6). */
function renderFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map((item) => renderFieldValue(item)).join(', ')
  return JSON.stringify(value)
}

/**
 * L2 task 6, extended by fiche 01 ("Liste de contenu"): filters, sort,
 * pagination, status tabs with real counts, row and bulk actions, a
 * configurable set of extra columns, and page size — for one collection at
 * a time.
 *
 * Row-level and bulk visibility all go through `canPerform` — the same
 * rule the server enforces, so nothing shown here can be clicked into a
 * 403. Filters that matter for sharing a link (status, locale, date range,
 * taxonomy term) live in the URL, never only in component state, so a link
 * pasted elsewhere reopens exactly the same filtered list.
 */
export function CollectionListRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const { name = '' } = useParams<{ name: string }>()
  const auth = useAuth()
  const schema = useSchema()
  const [searchParams, setSearchParams] = useSearchParams()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []

  const collection: CollectionSummary | undefined =
    schema.status === 'ready' ? schema.schema.collections.find((c) => c.name === name) : undefined

  const siteLocales = schema.status === 'ready' ? (schema.schema.site?.locales ?? []) : []

  // Filters that must be reopenable from a shared link (fiche 01 task 5):
  // read from the URL, never from component-only state.
  const status = searchParams.get('status') ?? ''
  const localeFilter = searchParams.get('locale') ?? ''
  const updatedFrom = searchParams.get('updatedFrom') ?? ''
  const updatedTo = searchParams.get('updatedTo') ?? ''
  const termId = searchParams.get('term') ?? ''

  const [sort, setSort] = useState<{ field: SortField; direction: SortDirection }>({
    field: 'updatedAt',
    direction: 'desc',
  })
  const [items, setItems] = useState<readonly Entry[]>([])
  const [counts, setCounts] = useState<Readonly<Partial<Record<string, number>>> | null>(null)
  const [cursorStack, setCursorStack] = useState<readonly (string | undefined)[]>([undefined])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [prefs, setPrefs] = useState(() => loadTablePrefs(name))
  useEffect(() => setPrefs(loadTablePrefs(name)), [name])

  const [terms, setTerms] = useState<readonly Term[]>([])

  // The full-text search (L10 task 3). Two pieces of state, not one: `query`
  // is what the field holds while somebody types, `submitted` is what the
  // server was actually asked. Searching on every keystroke would send a
  // ranked query per character.
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [hits, setHits] = useState<readonly SearchHit[] | null>(null)
  const [searching, setSearching] = useState(false)

  // Row actions (fiche 01 task 2).
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  // Bulk actions (fiche 01 task 3).
  const [bulkRunning, setBulkRunning] = useState<BulkAction | null>(null)
  const [bulkReport, setBulkReport] = useState<BulkReport | null>(null)
  const [confirmTrash, setConfirmTrash] = useState(false)

  const cursor = cursorStack[cursorStack.length - 1]

  const taxonomyField = collection?.fields.find((field) => field.kind === 'taxonomy')
  const taxonomyName =
    typeof taxonomyField?.options['of'] === 'string'
      ? (taxonomyField.options['of'] as string)
      : undefined
  const taxonomyMany = taxonomyField?.options['many'] !== false

  useEffect(() => {
    if (token === null || taxonomyName === undefined) {
      setTerms([])
      return
    }
    let cancelled = false
    listTerms(token, taxonomyName)
      .then((result) => {
        if (!cancelled) setTerms(result)
      })
      .catch(() => {
        if (!cancelled) setTerms([])
      })
    return () => {
      cancelled = true
    }
  }, [token, taxonomyName])

  /** Updates one or more URL filters at once, and resets pagination — every filter change starts back at the first page (a stale cursor from a different filter is not a position in the new ordering). */
  function updateFilters(patch: Readonly<Record<string, string | null>>): void {
    setCursorStack([undefined])
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === '') next.delete(key)
        else next.set(key, value)
      }
      return next
    })
  }

  const load = useCallback(async () => {
    if (token === null || collection === undefined) return
    setLoading(true)
    setError(null)
    try {
      const page = await listEntries(token, collection.name, {
        sort,
        limit: prefs.pageSize,
        counts: true,
        ...(status === '' ? {} : { status }),
        ...(cursor === undefined ? {} : { after: cursor }),
        ...(localeFilter === '' ? {} : { locale: localeFilter }),
        ...(updatedFrom === '' ? {} : { updatedFrom: `${updatedFrom}T00:00:00.000Z` }),
        ...(updatedTo === '' ? {} : { updatedTo: `${updatedTo}T23:59:59.999Z` }),
        ...(termId === '' || taxonomyField === undefined
          ? {}
          : { termFilter: { field: taxonomyField.name, termId, many: taxonomyMany } }),
      })
      setItems(page.items)
      setHasMore(page.hasMore)
      setNextCursor(page.nextCursor)
      setCounts(page.counts ?? null)
      setSelected(new Set())
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('collectionList.loadError'))
    } finally {
      setLoading(false)
    }
  }, [
    token,
    collection,
    sort,
    status,
    cursor,
    localeFilter,
    updatedFrom,
    updatedTo,
    termId,
    taxonomyField,
    taxonomyMany,
    prefs.pageSize,
    t,
  ])

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

  const canDelete = useMemo(
    () => collection !== undefined && canPerform('delete', collection, roles),
    [collection, roles],
  )
  const canCreate = useMemo(
    () => collection !== undefined && canPerform('create', collection, roles),
    [collection, roles],
  )
  const canUpdate = useMemo(
    () => collection !== undefined && canPerform('update', collection, roles),
    [collection, roles],
  )
  const canPublish = useMemo(
    () => collection !== undefined && canPerform('publish', collection, roles),
    [collection, roles],
  )
  const canReadRow = useMemo(
    () => collection !== undefined && canPerform('read', collection, roles),
    [collection, roles],
  )

  function messageOf(caught: unknown, fallback: string): string {
    return caught instanceof ApiError ? caught.message : fallback
  }

  // -------------------------------------------------------------- row actions (task 2)

  async function viewEntry(entry: Entry): Promise<void> {
    if (token === null || collection === undefined) return
    setRowBusy(entry.id)
    setRowError(null)
    try {
      const preview = await issuePreview(token, collection.name, entry.id)
      if (preview.url === null) {
        setRowError(t('collectionList.previewNoSiteUrl'))
        return
      }
      window.open(preview.url, '_blank', 'noopener,noreferrer')
    } catch (caught) {
      setRowError(messageOf(caught, t('collectionList.previewError')))
    } finally {
      setRowBusy(null)
    }
  }

  async function runRowAction(
    entry: Entry,
    action: 'duplicate' | 'publish' | 'unpublish' | 'trash',
  ): Promise<void> {
    if (token === null || collection === undefined) return
    setRowBusy(entry.id)
    setRowError(null)
    try {
      if (action === 'duplicate') await duplicateEntry(token, collection.name, entry.id)
      else if (action === 'publish') await publishEntry(token, collection.name, entry.id)
      else if (action === 'unpublish') await unpublishEntry(token, collection.name, entry.id)
      else await deleteEntry(token, collection.name, entry.id)
      // Never guess the new state locally — the server holds the transition
      // table, so the only honest thing after an action is to ask it again.
      await load()
    } catch (caught) {
      setRowError(messageOf(caught, t('collectionList.rowActionError')))
    } finally {
      setRowBusy(null)
    }
  }

  // -------------------------------------------------------------- bulk actions (task 3)

  async function callBulk(action: BulkAction, id: string): Promise<void> {
    if (token === null || collection === undefined) return
    if (action === 'publish') await publishEntry(token, collection.name, id)
    else if (action === 'unpublish') await unpublishEntry(token, collection.name, id)
    else if (action === 'duplicate') await duplicateEntry(token, collection.name, id)
    else await deleteEntry(token, collection.name, id)
  }

  async function runBulk(action: BulkAction): Promise<void> {
    if (token === null || collection === undefined) return
    const ids = [...selected]
    if (ids.length === 0) return

    setBulkRunning(action)
    setBulkReport(null)

    // `allSettled`, never `all`: a refusal on one row must not lose the
    // outcome of the others (fiche 01 task 3's own named pitfall).
    const results = await Promise.allSettled(ids.map((id) => callBulk(action, id)))

    const failures: BulkFailure[] = []
    results.forEach((result, index) => {
      if (result.status !== 'rejected') return
      const id = ids[index] as string
      const entry = items.find((candidate) => candidate.id === id)
      failures.push({
        id,
        title: entry !== undefined ? titleOf(entry, collection) : id,
        message: messageOf(result.reason, t('collectionList.rowActionError')),
      })
    })

    setBulkReport({ action, total: ids.length, failures })
    setBulkRunning(null)
    await load()
  }

  function requestBulk(action: BulkAction): void {
    if (action === 'trash') {
      setConfirmTrash(true)
      return
    }
    void runBulk(action)
  }

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
            titleOf(entry, collection),
            entry.status,
            entry.createdAt,
            entry.updatedAt,
          ])
    downloadCsv(`${collection.name}.csv`, toCsv([header, ...rows]))
  }

  function formatDateTime(iso: string): string {
    const parsed = new Date(iso)
    if (Number.isNaN(parsed.getTime())) return iso
    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(parsed)
  }

  function toggleColumn(fieldName: string, checked: boolean): void {
    const current = new Set(prefs.columns ?? [])
    if (checked) current.add(fieldName)
    else current.delete(fieldName)
    const next = { ...prefs, columns: [...current] }
    setPrefs(next)
    saveTablePrefs(name, next)
  }

  function changePageSize(pageSize: (typeof PAGE_SIZES)[number]): void {
    const next = { ...prefs, pageSize }
    setPrefs(next)
    saveTablePrefs(name, next)
    setCursorStack([undefined])
  }

  // `blocks` is excluded: its data lives in `entry.blocks`, not `entry.values`
  // — offering it as a column would always render an empty cell.
  const extraColumnFields: readonly SchemaField[] = (collection?.fields ?? []).filter(
    (field) => field.kind !== 'blocks',
  )
  const activeExtraColumns: readonly SchemaField[] = extraColumnFields.filter((field) =>
    (prefs.columns ?? []).includes(field.name),
  )

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

  const totalCount =
    counts === null
      ? undefined
      : Object.values(counts).reduce<number>((sum, n) => sum + (n ?? 0), 0)

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

      {/* Status tabs with real, server-computed counts (task 4) — replaces
          the old status `<select>`: this is the same one filter, just named
          in onglets rather than in a dropdown. */}
      <nav aria-label={t('collectionList.statusTabsLabel')}>
        <ul className="m-0 flex list-none flex-wrap gap-1 p-0">
          {(
            [
              { value: '', labelKey: 'collectionList.statusTabAll' },
              { value: 'draft', labelKey: 'collectionList.statusTabDraft' },
              { value: 'scheduled', labelKey: 'collectionList.statusTabScheduled' },
              { value: 'published', labelKey: 'collectionList.statusTabPublished' },
              { value: 'archived', labelKey: 'collectionList.statusTabArchived' },
            ] as const
          ).map((tab) => {
            const active = status === tab.value
            const count = tab.value === '' ? totalCount : counts?.[tab.value]
            return (
              <li key={tab.value}>
                <button
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => updateFilters({ status: tab.value === '' ? null : tab.value })}
                  className={`cursor-pointer appearance-none rounded-md border px-3 py-1.5 font-sans text-sm ${
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-card-foreground hover:bg-accent'
                  }`}
                >
                  {t(tab.labelKey)}
                  {count !== undefined ? ` (${count})` : ''}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

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

        {/* Date range on `updatedAt` (task 5). Plain `<input type="date">`:
            the query only ever needs day granularity from a human, and the
            component widens it to the full day when it builds the request. */}
        <div className="max-w-[10rem]">
          <Field label={t('collectionList.dateFrom')}>
            {(control) => (
              <Input
                {...control}
                type="date"
                value={updatedFrom}
                onChange={(event) => updateFilters({ updatedFrom: event.target.value })}
              />
            )}
          </Field>
        </div>
        <div className="max-w-[10rem]">
          <Field label={t('collectionList.dateTo')}>
            {(control) => (
              <Input
                {...control}
                type="date"
                value={updatedTo}
                onChange={(event) => updateFilters({ updatedTo: event.target.value })}
              />
            )}
          </Field>
        </div>

        {siteLocales.length > 1 && (
          <div className="max-w-xs">
            <Field label={t('collectionList.localeFilter')}>
              {(control) => (
                <Select
                  {...control}
                  value={localeFilter}
                  onChange={(event) => updateFilters({ locale: event.target.value })}
                >
                  <option value="">{t('collectionList.allLocales')}</option>
                  {siteLocales.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        )}

        {taxonomyName !== undefined && (
          <div className="max-w-xs">
            <Field label={t('collectionList.termFilterLabel')}>
              {(control) => (
                <Select
                  {...control}
                  value={termId}
                  onChange={(event) => updateFilters({ term: event.target.value })}
                >
                  <option value="">{t('collectionList.allTerms')}</option>
                  {terms.map((term) => (
                    <option key={term.id} value={term.id}>
                      {'—'.repeat(term.depth)}{' '}
                      {term.labels[i18n.language] ?? Object.values(term.labels)[0] ?? term.slug}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        )}

        <div className="max-w-[7rem]">
          <Field label={t('collectionList.pageSizeLabel')}>
            {(control) => (
              <Select
                {...control}
                value={String(prefs.pageSize)}
                onChange={(event) =>
                  changePageSize(Number(event.target.value) as (typeof PAGE_SIZES)[number])
                }
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        {/* Column picker (task 6). A native `<details>` disclosure: keyboard-
            and screen-reader-correct with no ARIA to get wrong, and the
            project's own design system has no popover component to reuse
            instead (R9: no new one for a single use). */}
        {extraColumnFields.length > 0 && (
          <details className="rounded-md border border-border bg-card px-3 py-2">
            <summary className="cursor-pointer font-sans text-sm font-medium">
              {t('collectionList.columnsToggle')}
            </summary>
            <fieldset className="m-0 mt-2 flex flex-col gap-1 border-none p-0">
              <legend className="sr-only">{t('collectionList.columnsLegend')}</legend>
              {extraColumnFields.map((field) => (
                <label key={field.name} className="flex items-center gap-2 font-sans text-sm">
                  <input
                    type="checkbox"
                    checked={(prefs.columns ?? []).includes(field.name)}
                    onChange={(event) => toggleColumn(field.name, event.target.checked)}
                  />
                  {field.admin?.label ?? field.name}
                </label>
              ))}
            </fieldset>
          </details>
        )}

        <button type="button" onClick={exportCsv}>
          {t('collectionList.exportCsv')}
        </button>
      </div>

      {/* Bulk actions (task 3): shown once a row is selected, each gated by
          the same permission the server enforces. */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {canPublish && (
            <Button
              variant="secondary"
              disabled={bulkRunning !== null}
              onClick={() => requestBulk('publish')}
            >
              {t('collectionList.bulkPublish', { count: selected.size })}
            </Button>
          )}
          {canPublish && (
            <Button
              variant="secondary"
              disabled={bulkRunning !== null}
              onClick={() => requestBulk('unpublish')}
            >
              {t('collectionList.bulkUnpublish', { count: selected.size })}
            </Button>
          )}
          {canCreate && (
            <Button
              variant="secondary"
              disabled={bulkRunning !== null}
              onClick={() => requestBulk('duplicate')}
            >
              {t('collectionList.bulkDuplicate', { count: selected.size })}
            </Button>
          )}
          {canDelete && (
            <Button
              variant="destructive"
              disabled={bulkRunning !== null}
              onClick={() => requestBulk('trash')}
            >
              {t('collectionList.deleteSelected', { count: selected.size })}
            </Button>
          )}
        </div>
      )}

      {bulkReport !== null && (
        <Notice
          tone={bulkReport.failures.length === 0 ? 'success' : 'warning'}
          live="polite"
          onDismiss={() => setBulkReport(null)}
          dismissLabel={t('collectionList.close')}
        >
          <p>
            {t('collectionList.bulkReportSummary', {
              succeeded: bulkReport.total - bulkReport.failures.length,
              total: bulkReport.total,
            })}
          </p>
          {bulkReport.failures.length > 0 && (
            <ul>
              {bulkReport.failures.map((failure) => (
                <li key={failure.id}>
                  {t('collectionList.bulkReportFailureItem', {
                    title: failure.title,
                    message: failure.message,
                  })}
                </li>
              ))}
            </ul>
          )}
        </Notice>
      )}

      <Modal
        open={confirmTrash}
        onOpenChange={setConfirmTrash}
        title={t('collectionList.bulkTrashConfirmTitle', { count: selected.size })}
        closeLabel={t('collectionList.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmTrash(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmTrash(false)
                void runBulk('trash')
              }}
            >
              {t('collectionList.bulkTrashConfirmAction')}
            </Button>
          </>
        }
      >
        <p>{t('collectionList.bulkTrashConfirmBody')}</p>
      </Modal>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}
      {rowError !== null && (
        <Notice
          tone="danger"
          live="assertive"
          onDismiss={() => setRowError(null)}
          dismissLabel={t('collectionList.close')}
        >
          <p>{rowError}</p>
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
                  {activeExtraColumns.map((field) => (
                    <TableHeader key={field.name}>{field.admin?.label ?? field.name}</TableHeader>
                  ))}
                  <TableHeader>{t('collectionList.actionsColumn')}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((entry) => {
                  const busy = rowBusy === entry.id
                  return (
                    <TableRow key={entry.id}>
                      {canDelete && (
                        <TableCell>
                          <input
                            type="checkbox"
                            aria-label={t('collectionList.selectRow', {
                              title: titleOf(entry, collection),
                            })}
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
                          {titleOf(entry, collection)}
                        </Link>
                      </TableCell>
                      <TableCell>{entry.id}</TableCell>
                      <TableCell>{entry.status}</TableCell>
                      <TableCell title={entry.updatedAt}>
                        {formatDateTime(entry.updatedAt)}
                      </TableCell>
                      {activeExtraColumns.map((field) => (
                        <TableCell key={field.name}>
                          {renderFieldValue(entry.values[field.name])}
                        </TableCell>
                      ))}
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {canUpdate && (
                            <Link
                              className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                              to={`/collections/${encodeURIComponent(name)}/${encodeURIComponent(entry.id)}`}
                            >
                              {t('collectionList.editAction')}
                            </Link>
                          )}
                          {canReadRow && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() => void viewEntry(entry)}
                            >
                              {t('collectionList.viewAction')}
                            </Button>
                          )}
                          {canCreate && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() => void runRowAction(entry, 'duplicate')}
                            >
                              {t('collectionList.duplicateAction')}
                            </Button>
                          )}
                          {canPublish && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                void runRowAction(
                                  entry,
                                  entry.status === 'published' ? 'unpublish' : 'publish',
                                )
                              }
                            >
                              {entry.status === 'published'
                                ? t('collectionList.unpublishAction')
                                : t('collectionList.publishAction')}
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() => void runRowAction(entry, 'trash')}
                            >
                              {t('collectionList.trashAction')}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {items.length === 0 && (
                  <TableEmpty colSpan={(canDelete ? 1 : 0) + 4 + activeExtraColumns.length + 1}>
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
