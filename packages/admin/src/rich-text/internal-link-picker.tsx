import { type JSX, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import { type Entry, listEntries } from '../api/content-client.js'
import { type SearchHit, searchContent } from '../api/search-client.js'
import { readableCollections } from '../schema/permissions.js'
import type { CollectionSummary } from '../schema/types.js'
import { Button, Input, Label, Select } from '../ui/index.js'

/**
 * The browse-and-search half of the internal link tab (fiche 04 task 2): a
 * target collection, then its entries — by recent update with no query, by
 * `GET /api/search` past two characters, the same split
 * `MenuEntryPicker`/fiche 03's `EntryPicker` already use elsewhere in this
 * admin, kept local here rather than imported because neither of those
 * exists in this package yet.
 *
 * Single-select and self-contained on purpose: a rich text link always
 * targets exactly one entry, so there is no reordering, no drag handle, no
 * `many` branch to carry.
 */

const RESULT_LIMIT = 20
const SEARCH_MIN_LENGTH = 2

function titleOf(entry: Pick<Entry, 'id' | 'values'>): string {
  const title = entry.values.title
  const name = entry.values.name
  if (typeof title === 'string' && title.length > 0) return title
  if (typeof name === 'string' && name.length > 0) return name
  return entry.id
}

interface ResultRow {
  readonly id: string
  readonly title: string
  readonly status: string
}

export function InternalLinkPicker({
  token,
  roles,
  collections,
  onPick,
  disabled = false,
}: {
  readonly token: string
  readonly roles: readonly string[]
  readonly collections: readonly CollectionSummary[]
  onPick(collection: string, id: string, label: string): void
  readonly disabled?: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const collectionId = useId()
  const searchId = useId()

  const targets = readableCollections(collections, roles)
  const [collection, setCollection] = useState(targets[0]?.name ?? '')
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [rows, setRows] = useState<readonly ResultRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (collection === '') return
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load(): Promise<void> {
      try {
        if (submitted.trim().length >= SEARCH_MIN_LENGTH) {
          const results = await searchContent(token, submitted, {
            collections: [collection],
            limit: RESULT_LIMIT,
          })
          if (!cancelled) {
            setRows(
              results.hits.map((hit: SearchHit) => ({
                id: hit.id,
                title: hit.title === '' ? hit.id : hit.title,
                status: hit.status,
              })),
            )
          }
          return
        }
        const page = await listEntries(token, collection, {
          limit: RESULT_LIMIT,
          sort: { field: 'updatedAt', direction: 'desc' },
        })
        if (!cancelled) {
          setRows(
            page.items.map((entry) => ({
              id: entry.id,
              title: titleOf(entry),
              status: entry.status,
            })),
          )
        }
      } catch (caught) {
        if (!cancelled) {
          setRows([])
          setError(
            caught instanceof ApiError ? caught.message : t('richText.linkInternalLoadError'),
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [token, collection, submitted, t])

  if (targets.length === 0) {
    return <p role="alert">{t('richText.linkInternalNoCollections')}</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={collectionId}>{t('richText.linkInternalCollectionLabel')}</Label>
        <Select
          id={collectionId}
          disabled={disabled}
          value={collection}
          onChange={(event) => {
            setCollection(event.target.value)
            setQuery('')
            setSubmitted('')
          }}
        >
          {targets.map((candidate) => (
            <option key={candidate.name} value={candidate.name}>
              {candidate.labels.plural}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={searchId}>{t('richText.linkInternalSearchLabel')}</Label>
        <Input
          id={searchId}
          type="search"
          disabled={disabled}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setSubmitted(event.target.value)
          }}
        />
      </div>

      {error !== null && <p role="alert">{error}</p>}
      {loading && rows.length === 0 && <p>{t('common.loading')}</p>}
      {!loading && rows.length === 0 && error === null && (
        <p className="text-sm text-muted-foreground">{t('richText.linkInternalNoResults')}</p>
      )}

      {rows.length > 0 && (
        <ul className="m-0 flex max-h-48 list-none flex-col gap-1 overflow-y-auto p-0">
          {rows.map((row) => (
            <li key={row.id}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={disabled}
                className="w-full justify-between"
                onClick={() => onPick(collection, row.id, row.title)}
              >
                <span className="truncate">{row.title}</span>
                {row.status !== 'published' && (
                  <span className="shrink-0 rounded-full bg-warning-surface px-2 py-0.5 text-[0.65rem] font-semibold text-warning uppercase">
                    {t(`entryEdit.status.${row.status}`, { defaultValue: row.status })}
                  </span>
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
