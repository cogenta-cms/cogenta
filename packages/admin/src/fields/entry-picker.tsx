import { type JSX, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import { type Entry, getEntriesByIds, listEntries } from '../api/content-client.js'
import { type SearchHit, searchContent } from '../api/search-client.js'
import { titleOf } from '../lib/entry-title.js'
import { canPerform } from '../schema/permissions.js'
import type { CollectionSummary } from '../schema/types.js'
import { cn } from '../ui/cn.js'
import { Button, Input, Label, Modal } from '../ui/index.js'
import '../styles/entry-picker.css'

/**
 * The reusable relation picker (fiche 03, task 1): browse-and-search a
 * target collection's entries, shown by their resolved title, never a raw
 * id. Used directly by `RelationField`, and by `LinkTargetField`'s
 * "existing entry" branch — both need the same permission gate and the
 * same trashed-reference honesty, so it lives once.
 *
 * `value`/`onChange` work in ids only, normalised to an array by the
 * caller: a to-one relation is a zero-or-one-element array here, never a
 * bare `string | null` — one shape for both cardinalities keeps this
 * component's own logic (resolve, reorder, remove) from forking in two.
 */
export interface EntryPickerProps {
  readonly id: string
  readonly token: string
  /** Undefined when the schema names no such collection — a stale or misconfigured `to`. */
  readonly collection: CollectionSummary | undefined
  readonly roles: readonly string[]
  readonly many: boolean
  readonly value: readonly string[]
  onChange(ids: readonly string[]): void
  readonly disabled?: boolean
}

interface ResolvedEntry {
  readonly title: string
  readonly status: string
  readonly trashed: boolean
}

const PAGE_SIZE = 20
/** Drag payload for reordering the selected list — scoped to this component, never read by anything else. */
const ENTRY_ID_MIME = 'application/x-cogenta-entry-picker-id'

const STATUS_KEYS = ['draft', 'scheduled', 'published', 'archived'] as const
type KnownStatus = (typeof STATUS_KEYS)[number]

function isKnownStatus(status: string): status is KnownStatus {
  return (STATUS_KEYS as readonly string[]).includes(status)
}

export function EntryPicker({
  id,
  token,
  collection,
  roles,
  many,
  value,
  onChange,
  disabled = false,
}: EntryPickerProps): JSX.Element {
  const { t } = useTranslation()
  const searchId = useId()

  const canReadTarget = collection !== undefined && canPerform('read', collection, roles)
  const canSeeTrash = collection !== undefined && canPerform('delete', collection, roles)

  const [resolved, setResolved] = useState<Readonly<Record<string, ResolvedEntry | 'unresolved'>>>(
    {},
  )
  const [browsing, setBrowsing] = useState(false)

  // Resolves every selected id's title, status and trashed flag in one or
  // two batched requests — never one request per token, which a gallery of
  // a dozen relations would turn into a dozen round trips.
  useEffect(() => {
    if (collection === undefined || !canReadTarget || value.length === 0) {
      setResolved({})
      return
    }
    const target = collection
    let cancelled = false

    async function resolve(): Promise<void> {
      const live = await getEntriesByIds(token, target.name, value).catch(() => [] as const)
      const map: Record<string, ResolvedEntry | 'unresolved'> = {}
      for (const entry of live) {
        map[entry.id] = { title: titleOf(entry), status: entry.status, trashed: false }
      }
      const missing = value.filter((entryId) => map[entryId] === undefined)
      if (missing.length > 0 && canSeeTrash) {
        const trashedEntries = await getEntriesByIds(token, target.name, missing, {
          trashed: 'only',
        }).catch(() => [] as const)
        for (const entry of trashedEntries) {
          map[entry.id] = { title: titleOf(entry), status: entry.status, trashed: true }
        }
      }
      for (const entryId of value) {
        if (map[entryId] === undefined) map[entryId] = 'unresolved'
      }
      if (!cancelled) setResolved(map)
    }

    void resolve()
    return () => {
      cancelled = true
    }
  }, [token, collection, canReadTarget, canSeeTrash, value])

  function remove(entryId: string): void {
    onChange(value.filter((candidate) => candidate !== entryId))
  }

  function moveTo(entryId: string, toIndex: number): void {
    const fromIndex = value.indexOf(entryId)
    if (fromIndex === -1 || toIndex < 0 || toIndex >= value.length) return
    const next = [...value]
    const [moved] = next.splice(fromIndex, 1)
    if (moved === undefined) return
    next.splice(toIndex, 0, moved)
    onChange(next)
  }

  function pick(entryId: string): void {
    if (many) {
      if (!value.includes(entryId)) onChange([...value, entryId])
    } else {
      onChange([entryId])
      setBrowsing(false)
    }
  }

  if (collection === undefined) {
    return (
      <p role="alert" className="entry-picker__notice">
        {t('entryPicker.unknownCollection')}
      </p>
    )
  }

  if (!canReadTarget) {
    return (
      <p role="alert" className="entry-picker__notice">
        {t('entryPicker.accessDenied', { collection: collection.labels.plural })}
      </p>
    )
  }

  return (
    <div id={id} className="entry-picker">
      {value.length === 0 ? (
        <p className="entry-picker__empty">{t('entryPicker.empty')}</p>
      ) : (
        <ol className="entry-picker__selected" aria-label={t('entryPicker.selectedLabel')}>
          {value.map((entryId, index) => {
            const entry = resolved[entryId]
            return (
              <li
                key={entryId}
                draggable={!disabled && many}
                onDragStart={(event) => {
                  event.dataTransfer.setData(ENTRY_ID_MIME, entryId)
                  event.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(event) => {
                  if (many) event.preventDefault()
                }}
                onDrop={(event) => {
                  if (!many) return
                  event.preventDefault()
                  const dragged = event.dataTransfer.getData(ENTRY_ID_MIME)
                  if (dragged !== '') moveTo(dragged, index)
                }}
                className="entry-picker__token"
              >
                <span className="entry-picker__token-title">
                  {entry === undefined
                    ? t('common.loading')
                    : entry === 'unresolved'
                      ? t('entryPicker.unresolved', { id: entryId })
                      : entry.title}
                </span>
                {typeof entry === 'object' && entry.trashed && (
                  <span className="entry-picker__badge entry-picker__badge--trashed">
                    {t('entryPicker.trashedBadge')}
                  </span>
                )}
                {typeof entry === 'object' &&
                  !entry.trashed &&
                  entry.status !== 'published' &&
                  isKnownStatus(entry.status) && (
                    <span className="entry-picker__badge">
                      {t(`entryEdit.status.${entry.status}`)}
                    </span>
                  )}
                {!disabled && (
                  <span className="entry-picker__token-actions">
                    {many && (
                      <>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={index === 0}
                          aria-label={t('entryPicker.moveUp', { position: index + 1 })}
                          onClick={() => moveTo(entryId, index - 1)}
                        >
                          ↑
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={index === value.length - 1}
                          aria-label={t('entryPicker.moveDown', { position: index + 1 })}
                          onClick={() => moveTo(entryId, index + 1)}
                        >
                          ↓
                        </Button>
                      </>
                    )}
                    <Button type="button" size="sm" variant="ghost" onClick={() => remove(entryId)}>
                      {t('entryPicker.removeButton')}
                    </Button>
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {!disabled && (many || value.length === 0) && (
        <Button type="button" variant="secondary" size="sm" onClick={() => setBrowsing(true)}>
          {many ? t('entryPicker.addButton') : t('entryPicker.chooseButton')}
        </Button>
      )}
      {!disabled && !many && value.length > 0 && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setBrowsing(true)}
          className="entry-picker__change"
        >
          {t('entryPicker.changeButton')}
        </Button>
      )}

      <Modal
        open={browsing}
        onOpenChange={setBrowsing}
        title={t('entryPicker.dialogTitle', { collection: collection.labels.plural })}
        closeLabel={t('common.cancel')}
      >
        {/* Mounted only while open: `Modal`'s content is a Radix portal that
            Radix itself keeps out of the DOM when closed, but React still
            constructs `children` either way — an unconditional `BrowsePanel`
            here would fetch a page of entries the moment this field mounts,
            long before anyone opens the picker. */}
        {browsing && (
          <BrowsePanel
            token={token}
            collection={collection}
            searchId={searchId}
            selected={value}
            onPick={pick}
          />
        )}
      </Modal>
    </div>
  )
}

function BrowsePanel({
  token,
  collection,
  searchId,
  selected,
  onPick,
}: {
  readonly token: string
  readonly collection: CollectionSummary
  readonly searchId: string
  readonly selected: readonly string[]
  onPick(id: string): void
}): JSX.Element {
  const { t } = useTranslation()
  const [items, setItems] = useState<readonly Entry[]>([])
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [hits, setHits] = useState<readonly SearchHit[] | null>(null)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listEntries(token, collection.name, { limit: PAGE_SIZE })
      .then((page) => {
        if (cancelled) return
        setItems(page.items)
        setHasMore(page.hasMore)
        setCursor(page.nextCursor ?? undefined)
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof ApiError ? caught.message : t('entryPicker.loadError'))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, collection.name, t])

  async function loadMore(): Promise<void> {
    if (cursor === undefined) return
    setLoading(true)
    try {
      const page = await listEntries(token, collection.name, { limit: PAGE_SIZE, after: cursor })
      setItems((current) => [...current, ...page.items])
      setHasMore(page.hasMore)
      setCursor(page.nextCursor ?? undefined)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('entryPicker.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    const text = submitted.trim()
    if (text === '') {
      setHits(null)
      return
    }
    setSearching(true)
    searchContent(token, text, { collections: [collection.name] })
      .then((results) => {
        if (!cancelled) setHits(results.hits)
      })
      .catch(() => {
        if (!cancelled) setHits([])
      })
      .finally(() => {
        if (!cancelled) setSearching(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, collection.name, submitted])

  const rows: readonly { readonly id: string; readonly title: string; readonly status: string }[] =
    hits !== null
      ? hits.map((hit) => ({
          id: hit.id,
          title: hit.title === '' ? hit.id : hit.title,
          status: hit.status,
        }))
      : items.map((entry) => ({ id: entry.id, title: titleOf(entry), status: entry.status }))

  return (
    <div className="entry-picker__browse">
      <form
        className="entry-picker__search"
        onSubmit={(event) => {
          event.preventDefault()
          setSubmitted(query)
        }}
      >
        <Label htmlFor={searchId}>{t('entryPicker.searchLabel')}</Label>
        <div className="entry-picker__search-row">
          <Input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button type="submit" variant="secondary" size="sm">
            {t('entryPicker.searchButton')}
          </Button>
          {submitted !== '' && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery('')
                setSubmitted('')
              }}
            >
              {t('common.cancel')}
            </Button>
          )}
        </div>
      </form>

      {error !== null && (
        <p role="alert" className="entry-picker__notice">
          {error}
        </p>
      )}
      {(loading || searching) && rows.length === 0 && <p>{t('common.loading')}</p>}

      {!loading && !searching && rows.length === 0 && (
        <p className="entry-picker__empty">{t('entryPicker.noResults')}</p>
      )}

      {rows.length > 0 && (
        <ul className="entry-picker__results">
          {rows.map((row) => {
            const already = selected.includes(row.id)
            return (
              <li key={row.id}>
                <button
                  type="button"
                  disabled={already}
                  onClick={() => onPick(row.id)}
                  className={cn('entry-picker__result', already && 'entry-picker__result--picked')}
                >
                  <span>{row.title}</span>
                  {row.status !== 'published' && isKnownStatus(row.status) && (
                    <span className="entry-picker__badge">
                      {t(`entryEdit.status.${row.status}`)}
                    </span>
                  )}
                  {already && (
                    <span className="entry-picker__badge">{t('entryPicker.alreadyPicked')}</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {hits === null && hasMore && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={loading}
          onClick={() => void loadMore()}
        >
          {t('entryPicker.loadMore')}
        </Button>
      )}
    </div>
  )
}
