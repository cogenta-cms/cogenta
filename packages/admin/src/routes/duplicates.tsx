import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type { DuplicateMatch } from '../api/assist-client.js'
import { getAssistCapabilities, runFindDuplicates } from '../api/assist-client.js'
import { ApiError } from '../api/client.js'
import { listEntries } from '../api/content-client.js'
import { useAuth } from '../auth/auth-context.js'
import { plainTextOfRichText } from '../collections/word-count.js'
import type { RichTextDocument } from '../rich-text/portable-text.js'
import { canPerform } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
import type { CollectionSummary } from '../schema/types.js'

/**
 * `assist.find_duplicates`, given a screen — the one L18 tool that needs no AI
 * provider at all (`packages/agents/src/assist/classify.ts`'s own note: it
 * embeds with whatever `EmbeddingProvider` the site has, the local hashing one
 * by default, and compares cosine similarity in the vector store). It still
 * goes through `GET /api/assistant` first and disappears if the toolset as a
 * whole answers `available: false` — a site can turn assistant tooling off
 * entirely, and this respects that even though this one tool does not strictly
 * need a model (R2 is about the toolset's switch, not about what one tool
 * happens to use).
 *
 * Duplicate detection needs an entry's text, not just a site-wide scan — the
 * underlying tool compares one passage against the vector store. This screen
 * picks a real entry from a collection as the thing to check, which is a
 * closer match to "detect a duplicate" than a free-text box: it is what an
 * editor actually means by "does this already exist?".
 *
 * Nothing here merges or deletes. `recommendedAction` is a closed union of
 * `none`/`review` on the wire; this screen adds no third option of its own.
 */
export function DuplicatesRoute(): JSX.Element | null {
  const { t } = useTranslation()
  const auth = useAuth()
  const schemaState = useSchema()

  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []

  const collections: readonly CollectionSummary[] =
    schemaState.status === 'ready'
      ? schemaState.schema.collections.filter((collection) => canPerform('read', collection, roles))
      : []
  const allCollectionNames = collections.map((collection) => collection.name)
  const locale =
    schemaState.status === 'ready' ? (schemaState.schema.site?.defaultLocale ?? 'en') : 'en'

  const [available, setAvailable] = useState<boolean | null>(null)
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null)
  const [entries, setEntries] = useState<readonly { readonly id: string; readonly text: string }[]>(
    [],
  )
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [matches, setMatches] = useState<readonly DuplicateMatch[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const current = selectedCollection ?? collections[0]?.name ?? null

  const loadCapabilities = useCallback(async () => {
    if (token === null) return
    try {
      const capabilities = await getAssistCapabilities(token)
      setAvailable(
        capabilities.available &&
          capabilities.tools.some((tool) => tool.tool === 'assist.find_duplicates'),
      )
    } catch {
      setAvailable(false)
    }
  }, [token])

  useEffect(() => {
    void loadCapabilities()
  }, [loadCapabilities])

  const loadEntries = useCallback(async () => {
    if (token === null || current === null) return
    setMatches(null)
    setError(null)
    try {
      const page = await listEntries(token, current, { limit: 50 })
      const withText = page.items.map((entry) => ({ id: entry.id, text: textOf(entry.values) }))
      setEntries(withText)
      setSelectedEntry(withText[0]?.id ?? null)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('duplicates.loadError'))
    }
  }, [token, current, t])

  useEffect(() => {
    void loadEntries()
  }, [loadEntries])

  if (available !== true || token === null) return null

  async function run(): Promise<void> {
    const entry = entries.find((candidate) => candidate.id === selectedEntry)
    if (token === null || current === null || entry === undefined || entry.text === '') return

    setRunning(true)
    setError(null)
    setMatches(null)
    try {
      const report = await runFindDuplicates(token, {
        text: entry.text,
        // Same documented stand-in as the chat screen: the admin's own origin
        // for the `site.url` the underlying tool scopes the vector store by.
        siteId: window.location.origin,
        locale,
        collections: allCollectionNames,
        excludeEntryId: entry.id,
      })
      setMatches(report.duplicates)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('duplicates.runError'))
    } finally {
      setRunning(false)
    }
  }

  return (
    <section aria-labelledby="duplicates-heading">
      <h1 id="duplicates-heading">{t('duplicates.heading')}</h1>
      <p>{t('duplicates.intro')}</p>

      {collections.length === 0 ? (
        <p>{t('duplicates.noCollections')}</p>
      ) : (
        <>
          <label htmlFor="duplicates-collection">{t('duplicates.collectionLabel')}</label>{' '}
          <select
            id="duplicates-collection"
            value={current ?? ''}
            onChange={(event) => setSelectedCollection(event.target.value)}
          >
            {collections.map((collection) => (
              <option key={collection.name} value={collection.name}>
                {collection.labels.plural}
              </option>
            ))}
          </select>{' '}
          <label htmlFor="duplicates-entry">{t('duplicates.entryLabel')}</label>{' '}
          <select
            id="duplicates-entry"
            value={selectedEntry ?? ''}
            onChange={(event) => setSelectedEntry(event.target.value)}
          >
            {entries.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.text !== '' ? entry.text.slice(0, 60) : entry.id}
              </option>
            ))}
          </select>{' '}
          <button
            type="button"
            disabled={running || selectedEntry === null}
            onClick={() => void run()}
          >
            {running ? t('duplicates.running') : t('duplicates.runButton')}
          </button>
          {error !== null && <p role="alert">{error}</p>}
          {matches !== null && matches.length === 0 && <p>{t('duplicates.none')}</p>}
          {matches !== null && matches.length > 0 && (
            <table>
              <caption>{t('duplicates.resultsCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('duplicates.entry')}</th>
                  <th scope="col">{t('duplicates.similarity')}</th>
                  <th scope="col">{t('duplicates.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((match) => (
                  <tr key={`${match.collection}/${match.entryId}`}>
                    <td>{match.excerpt}</td>
                    <td>{Math.round(match.similarity * 100)}%</td>
                    <td>
                      <Link
                        to={`/collections/${encodeURIComponent(match.collection)}/${encodeURIComponent(match.entryId)}`}
                      >
                        {t('duplicates.compare')}
                      </Link>
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

/** The fields worth comparing, in the order a reader would meet them. */
const COMPARED_FIELDS = ['title', 'name', 'slug', 'excerpt', 'summary', 'body'] as const

/**
 * Everything this entry has to say, for `assist.find_duplicates` to compare.
 *
 * It used to be the title and nothing else, through two defects that
 * compounded: the loop returned at the first field that matched, so `title`
 * always won and `body` was never reached — and `body` is a portable-text
 * document, an array, so the `typeof value === 'string'` test could not have
 * been true for it in any case.
 *
 * Measured on the real screen: a word-for-word copy of a 4 742-character
 * essay came back "no near-duplicate found", while the same call carrying
 * the body found it at 0.9984. A duplicate finder that reads only titles
 * finds only duplicate titles.
 *
 * Every field is now joined rather than the first one taken, and a rich-text
 * document goes through `plainTextOfRichText` — the same walk the word count
 * uses, which reads `children[].text` instead of stringifying the document
 * and counting `_key` and `_type` as words.
 */
export function textOf(values: Readonly<Record<string, unknown>>): string {
  const parts: string[] = []
  for (const key of COMPARED_FIELDS) {
    const value = values[key]
    if (typeof value === 'string') {
      if (value !== '') parts.push(value)
      continue
    }
    if (Array.isArray(value)) {
      const text = plainTextOfRichText(value as RichTextDocument)
      if (text !== '') parts.push(text)
    }
  }
  return parts.join('\n\n')
}
