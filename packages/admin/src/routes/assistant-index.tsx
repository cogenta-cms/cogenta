import { type ChangeEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AssistReferenceDocument, AssistVectorInfo } from '../api/assist-client.js'
import {
  deleteAssistantDocument,
  listAssistantDocuments,
  uploadAssistantDocument,
} from '../api/assist-client.js'
import { ApiError } from '../api/client.js'
import { listSettings, writeSetting } from '../api/settings-client.js'
import { useAuth } from '../auth/auth-context.js'
import { useSchema } from '../schema/schema-context.js'
import {
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
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
 * L22 task 4 — the redesigned assistant screen's "what is actually in the
 * index" tab.
 *
 * Two things a person could not previously answer by looking at `/assistant`
 * are answered here: **which collections** feed the index (with the explicit
 * ask honoured — a collection, e.g. published articles, can be excluded), and
 * **what else** feeds it beyond the site's own content — the reference
 * documents an admin has uploaded. Both read from and write to mechanisms
 * that already existed before this task: the toggle is one more entry in the
 * generic `SiteSettingsStore` (`assistant.indexedCollections`, `GET|PATCH
 * /api/settings`, exactly like every other editorial setting), and the
 * upload flow calls the existing `document.extract_text` → `chunkDocument` →
 * `EmbeddingProvider.embed` pipeline server-side
 * (`@cogenta/cli`'s `buildAssistant`) rather than a second one.
 *
 * Both sections are `admin`-only to *change* (the same `writeRoles` the
 * settings registry already declares, and the same gate
 * `assertMayManageDocuments` enforces server-side) — everyone who can use
 * the assistant may still *see* them, because "why did the assistant answer
 * that?" is a question any editor can reasonably ask.
 */

const INDEXED_COLLECTIONS_KEY = 'assistant.indexedCollections'

export interface AssistantIndexRouteProps {
  readonly vector: AssistVectorInfo
  readonly isAdmin: boolean
  /** Called after a toggle write succeeds, so the parent screen can refresh `GET /api/assistant` and show the new state (count is unaffected until a reindex, but `enabled` should not lag). */
  readonly onIndexChanged: () => void
}

function collectionLabel(name: string, labels: ReadonlyMap<string, string>): string {
  return labels.get(name) ?? name
}

export function AssistantIndexRoute({
  vector,
  isAdmin,
  onIndexChanged,
}: AssistantIndexRouteProps): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const schemaState = useSchema()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null

  const labels = new Map(
    schemaState.status === 'ready'
      ? schemaState.schema.collections.map(
          (collection) => [collection.name, collection.labels.plural] as const,
        )
      : [],
  )

  const [togglingCollection, setTogglingCollection] = useState<string | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)

  const [documents, setDocuments] = useState<readonly AssistReferenceDocument[] | null>(null)
  const [documentsError, setDocumentsError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const loadDocuments = useCallback(async () => {
    if (token === null) return
    try {
      setDocuments(await listAssistantDocuments(token))
      setDocumentsError(null)
    } catch (caught) {
      setDocumentsError(caught instanceof ApiError ? caught.message : t('assistantIndex.loadError'))
    }
  }, [token, t])

  useEffect(() => {
    void loadDocuments()
  }, [loadDocuments])

  async function toggleCollection(name: string, nextEnabled: boolean): Promise<void> {
    if (token === null || !isAdmin) return
    setTogglingCollection(name)
    setToggleError(null)
    try {
      // Read the live map fresh rather than trusting local state: another
      // admin (or another tab) may have changed a different collection's
      // toggle since this screen last loaded.
      const settings = await listSettings()
      const current = settings.find((setting) => setting.key === INDEXED_COLLECTIONS_KEY)
      const map = { ...((current?.value as Readonly<Record<string, boolean>> | undefined) ?? {}) }
      if (nextEnabled) delete map[name]
      else map[name] = false
      await writeSetting(token, INDEXED_COLLECTIONS_KEY, map)
      onIndexChanged()
    } catch (caught) {
      setToggleError(caught instanceof ApiError ? caught.message : t('assistantIndex.toggleError'))
    } finally {
      setTogglingCollection(null)
    }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file === undefined || token === null) return
    setUploading(true)
    setUploadError(null)
    try {
      await uploadAssistantDocument(token, file)
      await loadDocuments()
    } catch (caught) {
      setUploadError(caught instanceof ApiError ? caught.message : t('assistantIndex.uploadError'))
    } finally {
      setUploading(false)
    }
  }

  async function remove(id: string): Promise<void> {
    if (token === null) return
    setRemovingId(id)
    try {
      await deleteAssistantDocument(token, id)
      await loadDocuments()
    } catch (caught) {
      setDocumentsError(caught instanceof ApiError ? caught.message : t('assistantIndex.loadError'))
    } finally {
      setRemovingId(null)
    }
  }

  function statusLabel(document: AssistReferenceDocument): string {
    if (document.status === 'error') return t('assistantIndex.statusError')
    if (document.status === 'pending') return t('assistantIndex.statusPending')
    return t('assistantIndex.statusIndexed', { count: document.chunkCount })
  }

  return (
    <section aria-labelledby="assistant-index-heading" className="flex flex-col gap-6">
      <div>
        <h2 id="assistant-index-heading" className="m-0 text-lg font-semibold text-foreground">
          {t('assistantIndex.heading')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('assistantIndex.intro')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('assistantIndex.introShared')}</p>
      </div>

      <Card aria-labelledby="assistant-index-collections-heading">
        <CardHeader>
          <CardTitle>
            <h3 id="assistant-index-collections-heading">
              {t('assistantIndex.collectionsHeading')}
            </h3>
          </CardTitle>
          <CardDescription>{t('assistantIndex.collectionsIntro')}</CardDescription>
        </CardHeader>
        <CardBody>
          {toggleError !== null && (
            <Notice tone="danger" live="assertive">
              <p className="m-0">{toggleError}</p>
            </Notice>
          )}
          {vector.collections.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">
              {t('assistantIndex.collectionsEmpty')}
            </p>
          ) : (
            <TableRoot label={t('assistantIndex.collectionsHeading')}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>{t('assistantIndex.collectionColumn')}</TableHeader>
                    <TableHeader>{t('assistantIndex.countColumn')}</TableHeader>
                    <TableHeader>{t('assistantIndex.enabledColumn')}</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {vector.collections.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell>{collectionLabel(row.name, labels)}</TableCell>
                      <TableCell>{row.count}</TableCell>
                      <TableCell>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={row.enabled}
                            disabled={!isAdmin || togglingCollection === row.name}
                            onChange={(event) =>
                              void toggleCollection(row.name, event.target.checked)
                            }
                          />
                          <span className="text-sm text-muted-foreground">
                            {row.enabled
                              ? t('assistantIndex.enabledOn')
                              : t('assistantIndex.enabledOff')}
                          </span>
                        </label>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableRoot>
          )}
          <p className="mt-3 text-xs text-muted-foreground">{t('assistantIndex.reindexHint')}</p>
          {!isAdmin && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('assistantIndex.adminOnlyEdit')}
            </p>
          )}
        </CardBody>
      </Card>

      <Card aria-labelledby="assistant-index-documents-heading">
        <CardHeader>
          <CardTitle>
            <h3 id="assistant-index-documents-heading">{t('assistantIndex.documentsHeading')}</h3>
          </CardTitle>
          <CardDescription>{t('assistantIndex.documentsIntro')}</CardDescription>
        </CardHeader>
        <CardBody>
          {isAdmin && (
            <div className="mb-4">
              <label htmlFor="assistant-document-upload" className="text-sm font-medium">
                {t('assistantIndex.uploadLabel')}
              </label>
              <br />
              <input
                id="assistant-document-upload"
                type="file"
                accept=".pdf,.docx,.md,.markdown,.txt"
                disabled={uploading}
                onChange={(event) => void upload(event)}
              />
              {uploading && (
                <p className="m-0 mt-1 text-xs text-muted-foreground">
                  {t('assistantIndex.uploading')}
                </p>
              )}
              {uploadError !== null && (
                <Notice tone="danger" live="assertive">
                  <p className="m-0">{uploadError}</p>
                </Notice>
              )}
            </div>
          )}

          {documentsError !== null && (
            <Notice tone="danger" live="assertive">
              <p className="m-0">{documentsError}</p>
            </Notice>
          )}

          {documents === null ? (
            <p className="m-0 text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : (
            <TableRoot label={t('assistantIndex.documentsHeading')}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>{t('assistantIndex.filenameColumn')}</TableHeader>
                    <TableHeader>{t('assistantIndex.statusColumn')}</TableHeader>
                    <TableHeader>{t('assistantIndex.uploadedColumn')}</TableHeader>
                    {isAdmin && <TableHeader>{t('assistantIndex.actionsColumn')}</TableHeader>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {documents.map((document) => (
                    <TableRow key={document.id}>
                      <TableCell>{document.filename}</TableCell>
                      <TableCell>
                        {statusLabel(document)}
                        {document.status === 'error' && document.errorMessage !== null && (
                          <p className="m-0 text-xs text-destructive">{document.errorMessage}</p>
                        )}
                        {document.warnings.length > 0 && (
                          <ul className="m-0 mt-1 list-disc pl-4 text-xs text-muted-foreground">
                            {document.warnings.map((warning) => (
                              <li key={warning}>{warning}</li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                      <TableCell>{new Date(document.uploadedAt).toLocaleString()}</TableCell>
                      {isAdmin && (
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={removingId === document.id}
                            onClick={() => void remove(document.id)}
                          >
                            {t('assistantIndex.remove')}
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {documents.length === 0 && (
                    <TableEmpty colSpan={isAdmin ? 4 : 3}>
                      {t('assistantIndex.documentsEmpty')}
                    </TableEmpty>
                  )}
                </TableBody>
              </Table>
            </TableRoot>
          )}
        </CardBody>
      </Card>
    </section>
  )
}
