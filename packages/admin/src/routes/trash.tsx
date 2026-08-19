import { type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listAuditEntries } from '../api/audit-client.js'
import { ApiError } from '../api/client.js'
import { type Entry, listEntries, purgeEntry, untrashEntry } from '../api/content-client.js'
import { readTrashStatus, type TrashStatus } from '../api/ops-status-client.js'
import { useAuth } from '../auth/auth-context.js'
import { canPerform } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
import type { CollectionSummary } from '../schema/types.js'
import { daysUntilPurge, relativeTime } from '../trash/date-format.js'
import { PurgeConfirmModal } from '../trash/purge-confirm-modal.js'
import {
  Button,
  Field,
  Input,
  Notice,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '../ui/index.js'

/**
 * The trash (`schema@2.0`, ADR-0022): what has been deleted, and everything
 * that can still happen to it (fiche 07 — "Corbeille").
 *
 * Deliberately plain in its styling — L11 owns how the admin looks. What
 * matters here is that it is real: it lists what the API actually holds,
 * restores through the API, and purges through the API, one row or many at
 * once, across one collection or every collection this actor may empty.
 *
 * Only collections this actor may `delete` are offered at all. That mirrors
 * the server exactly (the API refuses everyone else with a 403, whatever this
 * screen shows) — the UI hides what cannot be done rather than presenting a
 * button that fails, but the server is still the one enforcing it.
 *
 * The trash is deliberately never a `status` value here or anywhere else
 * (ADR-0022): it is a separate view keyed on `trashed`, never a filter option
 * mixed into a content list's status selector.
 */

const PAGE_LIMIT = 50
/** Per-collection cap for the "All" tab's merge — see the banner it shows when a collection has more than this. */
const ALL_PROBE_LIMIT = 50
/** A sane ceiling on how much "empty this collection's trash" will fetch before refusing rather than looping forever. */
const MAX_EMPTY_FETCH_ITEMS = 2000
const DEFAULT_RETAIN_DAYS = 30

type TabId = 'all' | string

interface TrashRow {
  readonly collection: string
  readonly entry: Entry
}

interface ActionReport {
  readonly action: 'restore' | 'purge'
  readonly succeeded: number
  readonly failed: readonly { readonly label: string; readonly message: string }[]
}

interface PurgeTarget {
  readonly scope: 'selection' | 'collection'
  readonly rows: readonly TrashRow[]
  readonly collectionLabel?: string
}

function keyOf(row: TrashRow): string {
  return `${row.collection}:${row.entry.id}`
}

function retainDaysOf(collection: CollectionSummary): number {
  return collection.trash === false || collection.trash === undefined
    ? DEFAULT_RETAIN_DAYS
    : collection.trash.retainDays
}

function retainDaysSummary(collections: readonly CollectionSummary[]): string {
  const values = collections.map(retainDaysOf)
  const min = Math.min(...values)
  const max = Math.max(...values)
  return min === max ? String(min) : `${min}–${max}`
}

export function TrashRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const schemaState = useSchema()

  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const collections: readonly CollectionSummary[] = useMemo(() => {
    if (schemaState.status !== 'ready') return []
    return schemaState.schema.collections.filter(
      (collection) => canPerform('delete', collection, roles) && collection.trash !== false,
    )
  }, [schemaState, roles])

  const [activeTab, setActiveTab] = useState<TabId>('all')
  const current =
    activeTab === 'all' ? null : (collections.find((c) => c.name === activeTab) ?? null)

  const [byCollection, setByCollection] = useState<
    Readonly<Record<string, { readonly items: readonly Entry[]; readonly hasMore: boolean }>>
  >({})
  const [singleItems, setSingleItems] = useState<readonly Entry[]>([])
  const [cursorStack, setCursorStack] = useState<readonly (string | undefined)[]>([undefined])
  const [hasMoreSingle, setHasMoreSingle] = useState(false)
  const [nextCursorSingle, setNextCursorSingle] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [actionReport, setActionReport] = useState<ActionReport | null>(null)

  const [purgeTarget, setPurgeTarget] = useState<PurgeTarget | null>(null)
  const [purgeBusy, setPurgeBusy] = useState(false)
  const [emptyLoading, setEmptyLoading] = useState(false)

  const [trashStatus, setTrashStatus] = useState<TrashStatus | null>(null)
  const [deletedBy, setDeletedBy] = useState<Readonly<Record<string, string>>>({})

  const cursor = cursorStack[cursorStack.length - 1]

  const load = useCallback(async () => {
    if (token === null || collections.length === 0) return
    setLoading(true)
    setError(null)
    try {
      if (activeTab === 'all') {
        // Fusion client bornée (décision de la tâche 1) plutôt qu'une route
        // serveur `GET /api/trash` : livrable tout de suite, honnête sur sa
        // limite via `allTabTruncated` ci-dessous.
        const results = await Promise.all(
          collections.map(async (collection) => {
            const page = await listEntries(token, collection.name, {
              trashed: 'only',
              limit: ALL_PROBE_LIMIT,
            })
            return [collection.name, { items: page.items, hasMore: page.hasMore }] as const
          }),
        )
        setByCollection(Object.fromEntries(results))
      } else {
        // `updatedAt` rather than the true `deletedAt` (not a sortable field
        // in contract A's `SortField` — adding one was not asked for by this
        // fiche and would be new REST surface). The merged "All" view below
        // sorts by the real `deletedAt` instead, since it carries no cursor
        // to keep consistent across pages.
        const page = await listEntries(token, activeTab, {
          trashed: 'only',
          limit: PAGE_LIMIT,
          sort: { field: 'updatedAt', direction: 'desc' },
          ...(cursor === undefined ? {} : { after: cursor }),
        })
        setSingleItems(page.items)
        setHasMoreSingle(page.hasMore)
        setNextCursorSingle(page.nextCursor)
      }
      setSelected(new Set())
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('trash.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, collections, activeTab, cursor, t])

  useEffect(() => {
    void load()
  }, [load])

  // The trash purge status (fiche 07 task 5), admin-only on the server —
  // fetched once collections are known to exist, never attempted for a
  // non-admin (avoiding a 403 nobody asked to see).
  useEffect(() => {
    if (token === null || !isAdmin) {
      setTrashStatus(null)
      return
    }
    let cancelled = false
    readTrashStatus(token)
      .then((status) => {
        if (!cancelled) setTrashStatus(status)
      })
      .catch(() => {
        if (!cancelled) setTrashStatus(null)
      })
    return () => {
      cancelled = true
    }
  }, [token, isAdmin])

  // "Deleted by" (fiche 07 task 3): the audit log already names who trashed
  // an entry (`content.delete`, recorded at the transport boundary since
  // this fiche closed the gap that also left `untrash`/`purge` unaudited).
  // Reached only for `admin`, the only role `/api/audit` accepts, and only
  // for the collections actually on screen — one request per collection,
  // not one per row.
  useEffect(() => {
    if (token === null || !isAdmin || collections.length === 0) {
      setDeletedBy({})
      return
    }
    const relevant = activeTab === 'all' ? collections.map((c) => c.name) : [activeTab]
    let cancelled = false
    Promise.all(
      relevant.map((name) =>
        listAuditEntries(token, { collection: name, action: 'content.delete', limit: 200 }).then(
          (entries) => [name, entries] as const,
          () => [name, []] as const,
        ),
      ),
    ).then((results) => {
      if (cancelled) return
      const map: Record<string, string> = {}
      for (const [name, entries] of results) {
        for (const entry of entries) {
          if (entry.entryId !== null && entry.actorId !== null) {
            map[`${name}:${entry.entryId}`] = entry.actorId
          }
        }
      }
      setDeletedBy(map)
    })
    return () => {
      cancelled = true
    }
  }, [token, isAdmin, activeTab, collections])

  function switchTab(tab: TabId): void {
    setActiveTab(tab)
    setCursorStack([undefined])
    setQuery('')
    setSelected(new Set())
    setActionReport(null)
    setError(null)
  }

  const rows: readonly TrashRow[] = useMemo(() => {
    if (activeTab === 'all') {
      const merged = collections.flatMap((collection) =>
        (byCollection[collection.name]?.items ?? []).map(
          (entry): TrashRow => ({ collection: collection.name, entry }),
        ),
      )
      return [...merged].sort((a, b) =>
        (b.entry.deletedAt ?? '').localeCompare(a.entry.deletedAt ?? ''),
      )
    }
    return singleItems.map((entry): TrashRow => ({ collection: activeTab, entry }))
  }, [activeTab, collections, byCollection, singleItems])

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle === '') return rows
    return rows.filter((row) => titleOf(row.entry).toLowerCase().includes(needle))
  }, [rows, query])

  const allTabTruncated =
    activeTab === 'all' && collections.some((c) => byCollection[c.name]?.hasMore === true)

  function toggleSelected(row: TrashRow): void {
    const key = keyOf(row)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleSelectAll(): void {
    setSelected((prev) => {
      if (filteredRows.length > 0 && filteredRows.every((row) => prev.has(keyOf(row)))) {
        return new Set()
      }
      return new Set(filteredRows.map(keyOf))
    })
  }

  const allSelected =
    filteredRows.length > 0 && filteredRows.every((row) => selected.has(keyOf(row)))
  const selectedRows = filteredRows.filter((row) => selected.has(keyOf(row)))

  /**
   * Restores one row or many. `Promise.allSettled`: a partial failure is
   * expected and reported by name, never hidden behind the first success
   * (fiche 07 task 2 — "le rapport nommé est la fonctionnalité").
   */
  async function restoreRows(targetRows: readonly TrashRow[]): Promise<void> {
    if (token === null || targetRows.length === 0) return
    setError(null)
    setActionReport(null)
    setBusy(true)
    const results = await Promise.allSettled(
      targetRows.map((row) => untrashEntry(token, row.collection, row.entry.id)),
    )
    const failed: { label: string; message: string }[] = []
    let succeeded = 0
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        succeeded += 1
      } else {
        const row = targetRows[index]
        if (row === undefined) return
        const message =
          result.reason instanceof ApiError ? result.reason.message : t('trash.restoreError')
        failed.push({ label: titleOf(row.entry), message })
      }
    })
    setBusy(false)
    setActionReport({ action: 'restore', succeeded, failed })
    await load()
  }

  function openPurgeForRows(
    targetRows: readonly TrashRow[],
    scope: 'selection' | 'collection',
    collectionLabel?: string,
  ): void {
    if (targetRows.length === 0) return
    setPurgeTarget({
      scope,
      rows: targetRows,
      ...(collectionLabel === undefined ? {} : { collectionLabel }),
    })
  }

  /** Runs the purge every `PurgeConfirmModal` confirmation leads to — one row, a selection, or a whole collection's trash, always through the same `Promise.allSettled` + named report as `restoreRows`. */
  async function confirmPurge(): Promise<void> {
    if (token === null || purgeTarget === null) return
    setPurgeBusy(true)
    const results = await Promise.allSettled(
      purgeTarget.rows.map((row) => purgeEntry(token, row.collection, row.entry.id)),
    )
    const failed: { label: string; message: string }[] = []
    let succeeded = 0
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        succeeded += 1
      } else {
        const row = purgeTarget.rows[index]
        if (row === undefined) return
        const message =
          result.reason instanceof ApiError ? result.reason.message : t('trash.purgeError')
        failed.push({ label: titleOf(row.entry), message })
      }
    })
    setPurgeBusy(false)
    setPurgeTarget(null)
    setActionReport({ action: 'purge', succeeded, failed })
    await load()
  }

  /**
   * "Vider la corbeille de cette collection" (task 2): fetches every page of
   * the active collection's trash for a real, exact count — never an
   * estimate — then reuses the very same confirmation and purge path as a
   * manual selection. Bounded by `MAX_EMPTY_FETCH_ITEMS`, refusing rather
   * than looping forever on a trash nobody has swept in a long time.
   */
  async function openEmptyCollection(): Promise<void> {
    if (token === null || current === null) return
    setEmptyLoading(true)
    setError(null)
    try {
      const all: Entry[] = []
      let after: string | undefined
      for (;;) {
        const page = await listEntries(token, current.name, {
          trashed: 'only',
          limit: PAGE_LIMIT,
          ...(after === undefined ? {} : { after }),
        })
        all.push(...page.items)
        if (!page.hasMore || page.nextCursor === null) break
        if (all.length >= MAX_EMPTY_FETCH_ITEMS) {
          setEmptyLoading(false)
          setError(t('trash.emptyTooLarge', { count: all.length }))
          return
        }
        after = page.nextCursor
      }
      setEmptyLoading(false)
      if (all.length === 0) return
      openPurgeForRows(
        all.map((entry): TrashRow => ({ collection: current.name, entry })),
        'collection',
        current.labels.plural,
      )
    } catch (caught) {
      setEmptyLoading(false)
      setError(caught instanceof ApiError ? caught.message : t('trash.loadError'))
    }
  }

  if (schemaState.status === 'loading') {
    return <p>{t('common.loading')}</p>
  }

  if (schemaState.status === 'error') {
    return <p role="alert">{t('common.schemaError', { message: schemaState.message })}</p>
  }

  const now = new Date()
  const showCollectionColumn = activeTab === 'all'
  const columnCount = 3 + (showCollectionColumn ? 1 : 0) + (isAdmin ? 1 : 0)

  return (
    <section aria-labelledby="trash-heading" className="flex flex-col gap-6">
      <h1 id="trash-heading" className="m-0 text-xl leading-7 font-semibold">
        {t('trash.heading')}
      </h1>

      {collections.length === 0 ? (
        <p>{t('trash.noCollections')}</p>
      ) : (
        <>
          <div role="tablist" aria-label={t('trash.tabsLabel')} className="flex flex-wrap gap-2">
            <Button
              variant={activeTab === 'all' ? 'primary' : 'secondary'}
              size="sm"
              aria-pressed={activeTab === 'all'}
              onClick={() => switchTab('all')}
            >
              {t('trash.allTab')}
            </Button>
            {collections.map((collection) => {
              const probe = byCollection[collection.name]
              return (
                <Button
                  key={collection.name}
                  variant={activeTab === collection.name ? 'primary' : 'secondary'}
                  size="sm"
                  aria-pressed={activeTab === collection.name}
                  onClick={() => switchTab(collection.name)}
                >
                  {probe === undefined
                    ? collection.labels.plural
                    : t('trash.tabWithCount', {
                        label: collection.labels.plural,
                        count: probe.items.length,
                        suffix: probe.hasMore ? '+' : '',
                      })}
                </Button>
              )
            })}
          </div>

          <Notice tone="info" live="off">
            <p>
              {activeTab === 'all'
                ? t('trash.autoPurgeBannerAll', { days: retainDaysSummary(collections) })
                : t('trash.autoPurgeBanner', {
                    days: current === null ? DEFAULT_RETAIN_DAYS : retainDaysOf(current),
                  })}
            </p>
            {isAdmin && trashStatus !== null && (
              <p>
                {trashStatus.lastRunAt === null
                  ? t('trash.neverSweptYet')
                  : t('trash.lastSweep', {
                      when: relativeTime(trashStatus.lastRunAt, now, i18n.language),
                    })}
              </p>
            )}
          </Notice>

          {allTabTruncated && (
            <Notice tone="warning" live="off">
              <p>{t('trash.allTruncated', { limit: ALL_PROBE_LIMIT })}</p>
            </Notice>
          )}

          <div className="flex flex-wrap items-end gap-4">
            {/* `<search>` for the same reason `collection-list.tsx` uses it: the
                element carries the landmark role implicitly. Client-side only —
                a real server-side search of the trash would need
                `withSearchIndexing` to index what is deleted, which it does
                not (fiche 07 task 4). */}
            <search>
              <Field label={t('trash.search')}>
                {(control) => (
                  <Input
                    {...control}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                )}
              </Field>
            </search>

            {current !== null && (
              <Button
                variant="destructive"
                size="sm"
                disabled={emptyLoading || busy}
                onClick={() => void openEmptyCollection()}
              >
                {emptyLoading ? t('common.loading') : t('trash.emptyButton')}
              </Button>
            )}

            {selected.size > 0 && (
              <>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void restoreRows(selectedRows)}
                >
                  {t('trash.restoreSelected', { count: selected.size })}
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => openPurgeForRows(selectedRows, 'selection')}
                >
                  {t('trash.purgeSelected', { count: selected.size })}
                </Button>
              </>
            )}
          </div>

          {error !== null && (
            <Notice tone="danger" live="assertive">
              <p>{error}</p>
            </Notice>
          )}

          {actionReport !== null && (
            <Notice
              tone={actionReport.failed.length === 0 ? 'success' : 'warning'}
              live="polite"
              onDismiss={() => setActionReport(null)}
              dismissLabel={t('trash.dismissReport')}
            >
              <p>
                {actionReport.action === 'restore'
                  ? t('trash.restoreReportSucceeded', { count: actionReport.succeeded })
                  : t('trash.purgeReportSucceeded', { count: actionReport.succeeded })}
              </p>
              {actionReport.failed.length > 0 && (
                <>
                  <p>{t('trash.reportFailedHeading', { count: actionReport.failed.length })}</p>
                  <ul className="m-0 list-disc pl-5">
                    {actionReport.failed.map((failure) => (
                      <li key={`${failure.label}-${failure.message}`}>
                        {failure.label} — {failure.message}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Notice>
          )}

          {loading && <p>{t('common.loading')}</p>}

          {!loading && (
            <TableRoot label={t('trash.caption')}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader aria-label={t('trash.selectionColumn')}>
                      <input
                        type="checkbox"
                        aria-label={t('trash.selectAllOnPage')}
                        checked={allSelected}
                        onChange={toggleSelectAll}
                      />
                    </TableHeader>
                    <TableHeader>{t('trash.entry')}</TableHeader>
                    {showCollectionColumn && (
                      <TableHeader>{t('trash.collectionColumn')}</TableHeader>
                    )}
                    <TableHeader>{t('trash.status')}</TableHeader>
                    <TableHeader>{t('trash.deletedAt')}</TableHeader>
                    <TableHeader>{t('trash.purgeInColumn')}</TableHeader>
                    {isAdmin && <TableHeader>{t('trash.deletedByColumn')}</TableHeader>}
                    <TableHeader>{t('trash.actions')}</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredRows.map((row) => {
                    const key = keyOf(row)
                    const collection = collections.find((c) => c.name === row.collection)
                    const retainDays =
                      collection === undefined ? DEFAULT_RETAIN_DAYS : retainDaysOf(collection)
                    const days =
                      row.entry.deletedAt === null
                        ? null
                        : daysUntilPurge(row.entry.deletedAt, retainDays, now)
                    const author = deletedBy[key]

                    return (
                      <TableRow key={key}>
                        <TableCell>
                          <input
                            type="checkbox"
                            aria-label={t('trash.selectRow', { title: titleOf(row.entry) })}
                            checked={selected.has(key)}
                            onChange={() => toggleSelected(row)}
                          />
                        </TableCell>
                        <TableCell>{titleOf(row.entry)}</TableCell>
                        {showCollectionColumn && (
                          <TableCell>{collection?.labels.plural ?? row.collection}</TableCell>
                        )}
                        {/* The status it had when it was thrown away, and the
                            one restoring gives back: deletedAt is orthogonal. */}
                        <TableCell>{row.entry.status}</TableCell>
                        <TableCell>
                          {row.entry.deletedAt === null ? (
                            '—'
                          ) : (
                            <span title={row.entry.deletedAt}>
                              {relativeTime(row.entry.deletedAt, now, i18n.language)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {days === null
                            ? '—'
                            : days > 0
                              ? t('trash.purgeInDays', { count: days })
                              : t('trash.purgeDue')}
                        </TableCell>
                        {isAdmin && <TableCell>{author ?? '—'}</TableCell>}
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={busy}
                              onClick={() => void restoreRows([row])}
                            >
                              {t('trash.restore')}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={busy}
                              onClick={() => openPurgeForRows([row], 'selection')}
                            >
                              {t('trash.purge')}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {filteredRows.length === 0 && (
                    <TableEmpty colSpan={columnCount}>{t('trash.empty')}</TableEmpty>
                  )}
                </TableBody>
              </Table>
            </TableRoot>
          )}

          {!loading && activeTab !== 'all' && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={cursorStack.length <= 1}
                onClick={() => setCursorStack((s) => s.slice(0, -1))}
              >
                {t('trash.previous')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!hasMoreSingle || nextCursorSingle === null}
                onClick={() => setCursorStack((s) => [...s, nextCursorSingle ?? undefined])}
              >
                {t('trash.next')}
              </Button>
            </div>
          )}
        </>
      )}

      <PurgeConfirmModal
        open={purgeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setPurgeTarget(null)
        }}
        count={purgeTarget?.rows.length ?? 0}
        scope={purgeTarget?.scope ?? 'selection'}
        {...(purgeTarget?.collectionLabel === undefined
          ? {}
          : { collectionLabel: purgeTarget.collectionLabel })}
        busy={purgeBusy}
        onConfirm={() => void confirmPurge()}
      />
    </section>
  )
}

/**
 * Something recognisable to a human, without knowing the collection: the
 * first text-ish value, falling back to the id.
 */
function titleOf(entry: Entry): string {
  for (const key of ['title', 'name', 'slug']) {
    const value = entry.values[key]
    if (typeof value === 'string' && value !== '') return value
  }
  return entry.id
}
