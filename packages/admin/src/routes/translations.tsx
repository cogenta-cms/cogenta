import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type { Entry, TranslationMatrixEntry } from '../api/content-client.js'
import { getTranslationMatrix } from '../api/content-client.js'
import { describeApiError } from '../api/describe-error.js'
import { useAuth } from '../auth/auth-context.js'
import { readableCollections } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
import type { CollectionSummary } from '../schema/types.js'
import { languageName } from '../search/result-labels.js'
import {
  Button,
  Card,
  CardBody,
  Field,
  Notice,
  PageHeader,
  Select,
  Table,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '../ui/index.js'

/**
 * The translation dashboard (fiche 10 task 1): one screen answering "what is
 * still missing in each language", the question `TranslationSwitcher` never
 * could because it only ever looks at the one entry already open.
 *
 * The matrix comes from `GET /{collection}/-/translation-matrix` — one
 * server-side query and join per page, never `getTranslations` called once
 * per row (the fiche's own "piège connu"). Task 2's obsolescence signal
 * rides along in the same response: a cell that is published but whose
 * source changed since is shown as a fact ("source changed since …"), never
 * as a verdict — the fiche is explicit that signal (a) is meant to be read
 * that way, or an editor learns to ignore it.
 */
export function TranslationsRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const schemaState = useSchema()

  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []

  const collections: readonly CollectionSummary[] =
    schemaState.status === 'ready' ? readableCollections(schemaState.schema.collections, roles) : []
  const locales: readonly string[] =
    schemaState.status === 'ready' ? (schemaState.schema.site?.locales ?? ['en']) : ['en']

  const [selected, setSelected] = useState<string | null>(null)
  const current = selected ?? collections[0]?.name ?? null

  const [rows, setRows] = useState<readonly TranslationMatrixEntry[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentCollection = collections.find((collection) => collection.name === current)

  const load = useCallback(
    async (append: boolean) => {
      if (token === null || current === null) return
      setLoading(true)
      setError(null)
      try {
        const page = await getTranslationMatrix(token, current, {
          ...(append && cursor !== null ? { cursor } : {}),
        })
        setRows((previous) => (append ? [...previous, ...page.items] : page.items))
        setCursor(page.nextCursor)
        setHasMore(page.hasMore)
      } catch (caught) {
        setError(describeApiError(caught, t('translationDashboard.loadError')).message)
      } finally {
        setLoading(false)
      }
    },
    // `cursor` deliberately left out: a fresh load (append = false) always
    // starts at the beginning, and "load more" reads the cursor state at
    // click time via the closure captured when it is called, not this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, current, t],
  )

  useEffect(() => {
    setRows([])
    setCursor(null)
    setHasMore(false)
    void load(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, current])

  return (
    <section aria-labelledby="translations-dashboard-heading" className="flex flex-col gap-6">
      <PageHeader
        id="translations-dashboard-heading"
        title={t('translationDashboard.heading')}
        description={t('translationDashboard.intro')}
      />

      {collections.length === 0 ? (
        <p>{t('translationDashboard.noCollections')}</p>
      ) : locales.length < 2 ? (
        <Notice tone="info">
          <p>
            {t('translationDashboard.singleLocaleNote')}{' '}
            <Link to="/settings">{t('translationDashboard.singleLocaleLink')}</Link>
          </p>
        </Notice>
      ) : (
        <>
          <div className="max-w-xs">
            <Field label={t('translationDashboard.collectionLabel')}>
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
          {currentCollection !== undefined && (
            <TableRoot label={currentCollection.labels.plural}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>{t('translationDashboard.entry')}</TableHeader>
                    {locales.map((locale) => (
                      <TableHeader key={locale}>{languageName(locale, i18n.language)}</TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <tbody>
                  {rows.map((row) => (
                    <TableRow key={row.root.id}>
                      <th scope="row" className="px-4 py-3 text-left font-medium">
                        {titleOf(row.root)}
                      </th>
                      {locales.map((locale) => (
                        <td key={locale} className="px-4 py-3">
                          <MatrixCell
                            collection={current as string}
                            locale={locale}
                            root={row.root}
                            cell={row.cells[locale] ?? null}
                          />
                        </td>
                      ))}
                    </TableRow>
                  ))}
                </tbody>
              </Table>
            </TableRoot>
          )}
          {loading && <p>{t('common.loading')}</p>}
          {hasMore && !loading && (
            <div>
              <Button type="button" variant="secondary" onClick={() => void load(true)}>
                {t('translationDashboard.loadMore')}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function MatrixCell({
  collection,
  locale,
  root,
  cell,
}: {
  readonly collection: string
  readonly locale: string
  readonly root: Entry
  readonly cell: { readonly id: string; readonly status: string; readonly obsolete: boolean } | null
}): JSX.Element {
  const { t } = useTranslation()

  if (cell === null) {
    return (
      <Link
        to={`/collections/${encodeURIComponent(collection)}/new`}
        state={{ locale, translationOf: root.id, values: root.values }}
      >
        {t('translationDashboard.createAction')}
      </Link>
    )
  }

  return (
    <Link to={`/collections/${encodeURIComponent(collection)}/${encodeURIComponent(cell.id)}`}>
      {stateLabel(t, cell.status)}
      {cell.obsolete && <span> — {t('translationDashboard.obsolete')}</span>}
    </Link>
  )
}

/**
 * Something recognisable to a human, without knowing the collection: the
 * first text-ish value, falling back to the id — the same crude convention
 * `trash.tsx`/`collection-list.tsx`/`dashboard.tsx` each keep locally rather
 * than sharing (contract A declares no title field to read one from).
 */
function titleOf(entry: Entry): string {
  for (const key of ['title', 'name', 'slug']) {
    const value = entry.values[key]
    if (typeof value === 'string' && value !== '') return value
  }
  return entry.id
}

function stateLabel(t: (key: string) => string, status: string): string {
  if (status === 'draft') return t('translationDashboard.stateDraft')
  if (status === 'published') return t('translationDashboard.statePublished')
  if (status === 'archived') return t('translationDashboard.stateArchived')
  if (status === 'scheduled') return t('translationDashboard.stateScheduled')
  return status
}
