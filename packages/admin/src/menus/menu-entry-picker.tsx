import { type JSX, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type Entry, listEntries } from '../api/content-client.js'
import { searchContent } from '../api/search-client.js'
import { Button, cn, Input } from '../ui/index.js'

/**
 * A search-capable target picker for an `entry`-kind menu item (fiche 09,
 * task 4).
 *
 * This is a menu-scoped stand-in, not fiche 03's future `EntryPicker`
 * (`packages/admin/src/fields/entry-picker.tsx`) — that component did not
 * exist anywhere in this codebase when this fiche shipped, and fiche 03 is
 * its own multi-day lot with its own acceptance criteria (pagination, an
 * access-denied state, a trashed-target warning). Building the general
 * version here would be scope creep on this fiche, and guessing at its
 * eventual shape risks a second one that drifts. What this *does* fix is the
 * real, named gap fiche 09 calls out: the old picker's `listEntries(token,
 * collection, { limit: 100 })` with no search silently hid every entry past
 * the hundredth. Once fiche 03 lands its own `EntryPicker`, this file is the
 * one to delete in favour of it.
 *
 * With an empty query it shows the most recently updated entries (the same
 * `listEntries` call the old picker made, just ordered usefully); past two
 * characters it switches to the real full-text index (`GET /api/search`,
 * scoped to this one collection) so a target is never unreachable just
 * because it is not among the first page.
 */

export interface EntryOption {
  readonly id: string
  readonly label: string
  readonly status: string
}

function labelOf(entry: Entry): string {
  const title = entry.values['title']
  const name = entry.values['name']
  if (typeof title === 'string' && title.length > 0) return title
  if (typeof name === 'string' && name.length > 0) return name
  return entry.id
}

const SEARCH_MIN_LENGTH = 2
const RESULT_LIMIT = 20

export function MenuEntryPicker({
  token,
  collection,
  value,
  onChange,
  disabled = false,
}: {
  readonly token: string
  readonly collection: string
  readonly value: string | null
  onChange(id: string, label: string): void
  readonly disabled?: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<readonly EntryOption[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setFailed(false)

    async function load(): Promise<void> {
      try {
        if (query.trim().length >= SEARCH_MIN_LENGTH) {
          const results = await searchContent(token, query, {
            collections: [collection],
            limit: RESULT_LIMIT,
          })
          if (!cancelled) {
            setOptions(
              results.hits.map((hit) => ({ id: hit.id, label: hit.title, status: hit.status })),
            )
          }
          return
        }
        const page = await listEntries(token, collection, {
          limit: RESULT_LIMIT,
          sort: { field: 'updatedAt', direction: 'desc' },
        })
        if (!cancelled) {
          setOptions(
            page.items.map((entry) => ({
              id: entry.id,
              label: labelOf(entry),
              status: entry.status,
            })),
          )
        }
      } catch {
        // A collection this actor may not read, or a transient failure: the
        // picker simply has nothing to offer, the same treatment
        // `TaxonomyField` gives a taxonomy it cannot list.
        if (!cancelled) {
          setOptions([])
          setFailed(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [token, collection, query])

  return (
    <div className="flex flex-col gap-2">
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('menus.pickerSearchPlaceholder')}
        disabled={disabled}
        aria-label={t('menus.pickerSearchLabel')}
      />
      {loading && <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}
      {!loading && failed && (
        <p className="text-xs text-destructive">{t('menus.pickerLoadError')}</p>
      )}
      {!loading && !failed && options.length === 0 && (
        <p className="text-xs text-muted-foreground">{t('menus.pickerEmpty')}</p>
      )}
      {options.length > 0 && (
        <div className="m-0 flex max-h-56 flex-col gap-1 overflow-y-auto p-0" role="listbox">
          {options.map((option) => (
            <div key={option.id}>
              <Button
                type="button"
                variant={option.id === value ? 'primary' : 'secondary'}
                size="sm"
                role="option"
                aria-selected={option.id === value}
                disabled={disabled}
                className="w-full justify-start"
                onClick={() => onChange(option.id, option.label)}
              >
                <span className="flex-1 truncate text-left">{option.label}</span>
                {option.status !== 'published' && (
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase',
                      option.id === value
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : 'bg-warning-surface text-warning',
                    )}
                  >
                    {t(`menus.status.${option.status}`, { defaultValue: option.status })}
                  </span>
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
