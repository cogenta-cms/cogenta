import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import { type Entry, listEntries, purgeEntry, untrashEntry } from '../api/content-client.js'
import { useAuth } from '../auth/auth-context.js'
import { canPerform } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
import type { CollectionSummary } from '../schema/types.js'
import {
  Button,
  Field,
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
    <section aria-labelledby="trash-heading" className="flex flex-col gap-6">
      <h1 id="trash-heading" className="m-0 text-xl leading-7 font-semibold">
        {t('trash.heading')}
      </h1>

      {collections.length === 0 ? (
        <p>{t('trash.noCollections')}</p>
      ) : (
        <>
          <div className="max-w-xs">
            <Field label={t('trash.collection')}>
              {(control) => (
                <Select
                  {...control}
                  value={current ?? ''}
                  onChange={(event) => setSelected(event.target.value)}
                >
                  {collections.map((collection) => (
                    <option key={collection.name} value={collection.name}>
                      {collection.labels.plural}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          {error !== null && (
            <Notice tone="danger" live="assertive">
              <p>{error}</p>
            </Notice>
          )}
          {loading && <p>{t('common.loading')}</p>}

          {!loading && (
            <TableRoot label={t('trash.caption')}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>{t('trash.entry')}</TableHeader>
                    <TableHeader>{t('trash.status')}</TableHeader>
                    <TableHeader>{t('trash.deletedAt')}</TableHeader>
                    <TableHeader>{t('trash.actions')}</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{titleOf(entry)}</TableCell>
                      {/* The status it had when it was thrown away, and the one
                          restoring gives back: deletedAt is orthogonal. */}
                      <TableCell>{entry.status}</TableCell>
                      <TableCell>{entry.deletedAt ?? '—'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy === entry.id}
                            onClick={() => void restore(entry.id)}
                          >
                            {t('trash.restore')}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={busy === entry.id}
                            onClick={() => void destroy(entry.id)}
                          >
                            {t('trash.purge')}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {entries.length === 0 && <TableEmpty colSpan={4}>{t('trash.empty')}</TableEmpty>}
                </TableBody>
              </Table>
            </TableRoot>
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
