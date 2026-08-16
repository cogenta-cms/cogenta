import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import { type Entry, listEntries, purgeEntry, untrashEntry } from '../api/content-client.js'
import { useAuth } from '../auth/auth-context.js'
import { canPerform } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
import type { CollectionSummary } from '../schema/types.js'

/**
 * The trash (`schema@2.0`, ADR-0022): what has been deleted, and the two
 * things that can still happen to it.
 *
 * Deliberately plain — L11 owns how the admin looks. What matters here is that
 * it is real: it lists what the API actually holds, restores through the API,
 * and purges through the API.
 *
 * Only collections this actor may `delete` are offered at all. That mirrors
 * the server exactly (the API refuses everyone else with a 403, whatever this
 * screen shows) — the UI hides what cannot be done rather than presenting a
 * button that fails, but the server is still the one enforcing it.
 */
export function TrashRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const schemaState = useSchema()

  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []

  const collections: readonly CollectionSummary[] =
    schemaState.status === 'ready'
      ? schemaState.schema.collections.filter(
          (collection) => canPerform('delete', collection, roles) && collection.trash !== false,
        )
      : []

  const [selected, setSelected] = useState<string | null>(null)
  const [entries, setEntries] = useState<readonly Entry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const current = selected ?? collections[0]?.name ?? null

  const load = useCallback(async () => {
    if (token === null || current === null) return
    setLoading(true)
    setError(null)
    try {
      // `trashed: 'only'` is the whole screen. The default everywhere else is
      // `exclude`, which is why no other page had to learn about any of this.
      const page = await listEntries(token, current, { trashed: 'only', limit: 50 })
      setEntries(page.items)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('trash.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, current, t])

  useEffect(() => {
    void load()
  }, [load])

  async function restore(id: string): Promise<void> {
    if (token === null || current === null) return
    setBusy(id)
    setError(null)
    try {
      await untrashEntry(token, current, id)
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('trash.restoreError'))
    } finally {
      setBusy(null)
    }
  }

  async function destroy(id: string): Promise<void> {
    if (token === null || current === null) return
    // A confirmation, because this one really is irreversible — the only
    // operation in the admin of which that is true.
    if (!globalThis.confirm(t('trash.purgeConfirm'))) return

    setBusy(id)
    setError(null)
    try {
      await purgeEntry(token, current, id)
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('trash.purgeError'))
    } finally {
      setBusy(null)
    }
  }

  if (schemaState.status === 'loading') {
    return <p>{t('common.loading')}</p>
  }

  if (schemaState.status === 'error') {
    return <p role="alert">{t('common.schemaError', { message: schemaState.message })}</p>
  }

  return (
    <section aria-labelledby="trash-heading">
      <h1 id="trash-heading">{t('trash.heading')}</h1>

      {collections.length === 0 ? (
        <p>{t('trash.noCollections')}</p>
      ) : (
        <>
          <label htmlFor="trash-collection">{t('trash.collection')}</label>{' '}
          <select
            id="trash-collection"
            value={current ?? ''}
            onChange={(event) => setSelected(event.target.value)}
          >
            {collections.map((collection) => (
              <option key={collection.name} value={collection.name}>
                {collection.labels.plural}
              </option>
            ))}
          </select>
          {error !== null && <p role="alert">{error}</p>}
          {loading && <p>{t('common.loading')}</p>}
          {!loading && entries.length === 0 && <p>{t('trash.empty')}</p>}
          {entries.length > 0 && (
            <table>
              <caption>{t('trash.caption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('trash.entry')}</th>
                  <th scope="col">{t('trash.status')}</th>
                  <th scope="col">{t('trash.deletedAt')}</th>
                  <th scope="col">{t('trash.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{titleOf(entry)}</td>
                    {/* The status it had when it was thrown away, and the one
                        restoring gives back: deletedAt is orthogonal. */}
                    <td>{entry.status}</td>
                    <td>{entry.deletedAt ?? '—'}</td>
                    <td>
                      <button
                        type="button"
                        disabled={busy === entry.id}
                        onClick={() => void restore(entry.id)}
                      >
                        {t('trash.restore')}
                      </button>{' '}
                      <button
                        type="button"
                        disabled={busy === entry.id}
                        onClick={() => void destroy(entry.id)}
                      >
                        {t('trash.purge')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
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
