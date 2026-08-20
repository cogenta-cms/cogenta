import { type ChangeEvent, type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import {
  analyzeImport,
  applyImportRun,
  cancelImportRun,
  type ImportRun,
  type ImportSource,
  importWordPressExport,
  type WordPressImportReport,
} from '../api/import-client.js'
import { useAuth } from '../auth/auth-context.js'
import {
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Notice,
  Select,
} from '../ui/index.js'

/**
 * The admin's counterpart to `cogenta import wordpress` on a terminal
 * (`packages/import/src/wordpress/`, unchanged — this screen only uploads
 * the file and shows the same report the CLI already prints).
 *
 * Admin only, same courtesy-plus-server-check split every other admin-only
 * screen in this app uses: this page hides the upload from a role that
 * cannot import, but the 403 `ImportRouter` produces is what actually stops
 * them (R4).
 */
export function ImportRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<WordPressImportReport | null>(null)
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null)

  async function upload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const [file] = event.target.files ?? []
    event.target.value = ''
    if (token === null || file === undefined) return
    setBusy(true)
    setError(null)
    setReport(null)
    try {
      setReport(await importWordPressExport(token, file))
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? { message: caught.message, ...(caught.hint === undefined ? {} : { hint: caught.hint }) }
          : { message: t('importWordpress.uploadError') },
      )
    } finally {
      setBusy(false)
    }
  }

  if (!isAdmin) {
    return (
      <section aria-labelledby="import-heading">
        <h1 id="import-heading">{t('importWordpress.heading')}</h1>
        <p role="alert">{t('importWordpress.adminOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="import-heading" className="flex flex-col gap-6">
      <div>
        <h1 id="import-heading">{t('importWordpress.heading')}</h1>
        <p className="text-muted-foreground">{t('importWordpress.intro')}</p>
      </div>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error.message}</p>
          {error.hint !== undefined && <p>{error.hint}</p>}
        </Notice>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('importWordpress.uploadHeading')}</h2>
          </CardTitle>
          <CardDescription>{t('importWordpress.uploadHelp')}</CardDescription>
        </CardHeader>
        <CardBody>
          <label htmlFor="wordpress-import-upload">{t('importWordpress.uploadLabel')}</label>
          <input
            id="wordpress-import-upload"
            type="file"
            accept=".xml"
            disabled={busy}
            onChange={(event) => void upload(event)}
          />
          {busy && <p>{t('importWordpress.importing')}</p>}
        </CardBody>
      </Card>

      {report !== null && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t('importWordpress.reportHeading')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <Notice tone="success" live="polite">
              <p>
                {t('importWordpress.summary', {
                  posts: report.imported.posts,
                  pages: report.imported.pages,
                  categories: report.imported.categories,
                  tags: report.imported.tags,
                  media: report.imported.media,
                  authors: report.imported.authors,
                  comments: report.imported.comments,
                  redirects: report.redirectsCreated,
                })}
              </p>
            </Notice>

            {report.skipped.length > 0 && (
              <div>
                <h3>{t('importWordpress.skippedHeading', { count: report.skipped.length })}</h3>
                <ul>
                  {report.skipped.map((item, index) => (
                    <li key={`${item.type}-${item.wpId}-${index}`}>
                      [{item.type} {item.wpId}] &ldquo;{item.title}&rdquo; — {item.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.unconvertedBlocks.length > 0 && (
              <div>
                <h3>
                  {t('importWordpress.unconvertedHeading', {
                    count: report.unconvertedBlocks.length,
                  })}
                </h3>
                <ul>
                  {report.unconvertedBlocks.map((note, index) => (
                    <li key={`${note.postTitle}-${index}`}>
                      &ldquo;{note.postTitle}&rdquo; — {note.source}: {note.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.warnings.length > 0 && (
              <div>
                <h3>{t('importWordpress.warningsHeading', { count: report.warnings.length })}</h3>
                <ul>
                  {report.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <PreviewImportCard token={token} />
    </section>
  )
}

/**
 * The preview/apply/undo flow (fiche 25 tasks 1-4), for every source
 * `/api/import/analyze` accepts. Unlike the one-shot WordPress uploader
 * above, nothing is written until "Apply" is pressed — and applying twice on
 * the same run resumes rather than duplicates (task 3), so the same button
 * doubles as the "resume after an interruption" control.
 */
function PreviewImportCard({ token }: { readonly token: string | null }): JSX.Element {
  const { t } = useTranslation()
  const [source, setSource] = useState<ImportSource>('csv')
  const [targetCollection, setTargetCollection] = useState('')
  const [run, setRun] = useState<ImportRun | null>(null)
  const [busy, setBusy] = useState<'analyze' | 'apply' | 'cancel' | null>(null)
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null)

  function describeError(caught: unknown, fallback: string): { message: string; hint?: string } {
    return caught instanceof ApiError
      ? { message: caught.message, ...(caught.hint === undefined ? {} : { hint: caught.hint }) }
      : { message: fallback }
  }

  async function onAnalyze(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const [file] = event.target.files ?? []
    event.target.value = ''
    if (token === null || file === undefined) return
    setBusy('analyze')
    setError(null)
    setRun(null)
    try {
      setRun(
        await analyzeImport(token, {
          source,
          file,
          ...(targetCollection.trim().length > 0
            ? { targetCollection: targetCollection.trim() }
            : {}),
        }),
      )
    } catch (caught) {
      setError(describeError(caught, t('importPreview.analyzeError')))
    } finally {
      setBusy(null)
    }
  }

  async function onApply(): Promise<void> {
    if (token === null || run === null) return
    setBusy('apply')
    setError(null)
    try {
      setRun(await applyImportRun(token, run.id))
    } catch (caught) {
      setError(describeError(caught, t('importPreview.applyError')))
    } finally {
      setBusy(null)
    }
  }

  async function onCancel(): Promise<void> {
    if (token === null || run === null) return
    setBusy('cancel')
    setError(null)
    try {
      setRun(await cancelImportRun(token, run.id))
    } catch (caught) {
      setError(describeError(caught, t('importPreview.cancelError')))
    } finally {
      setBusy(null)
    }
  }

  const analysis = run?.analysis as {
    totalRecords?: number
    counts?: Record<string, number>
  } | null
  const totalRecords =
    analysis?.totalRecords ??
    (analysis?.counts === undefined
      ? undefined
      : Object.values(analysis.counts).reduce((a, b) => a + b, 0))
  const report = run?.report as { imported?: number; resumedSkips?: number } | null

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('importPreview.heading')}</h2>
        </CardTitle>
        <CardDescription>{t('importPreview.intro')}</CardDescription>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        {error !== null && (
          <Notice tone="danger" live="assertive">
            <p>{error.message}</p>
            {error.hint !== undefined && <p>{error.hint}</p>}
          </Notice>
        )}

        <Field label={t('importPreview.sourceLabel')}>
          {(control) => (
            <Select
              {...control}
              value={source}
              disabled={busy !== null}
              onChange={(event) => {
                setSource(event.target.value as ImportSource)
                setRun(null)
              }}
            >
              <option value="wordpress">{t('importPreview.sourceWordpress')}</option>
              <option value="csv">{t('importPreview.sourceCsv')}</option>
              <option value="json">{t('importPreview.sourceJson')}</option>
              <option value="rss">{t('importPreview.sourceRss')}</option>
            </Select>
          )}
        </Field>

        {(source === 'csv' || source === 'rss') && (
          <Field
            label={t('importPreview.targetCollectionLabel')}
            description={t('importPreview.targetCollectionHelp')}
          >
            {(control) => (
              <Input
                {...control}
                value={targetCollection}
                disabled={busy !== null}
                onChange={(event) => setTargetCollection(event.target.value)}
                placeholder="page"
              />
            )}
          </Field>
        )}

        <Field label={t('importPreview.fileLabel')}>
          {(control) => (
            <input
              {...control}
              type="file"
              disabled={busy !== null}
              onChange={(event) => void onAnalyze(event)}
            />
          )}
        </Field>
        {busy === 'analyze' && <p>{t('importPreview.analyzing')}</p>}

        {run !== null && (
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <h3>{t('importPreview.previewHeading')}</h3>
            {totalRecords !== undefined && (
              <p>{t('importPreview.previewRecords', { count: totalRecords })}</p>
            )}

            {(run.status === 'analyzed' || run.status === 'failed') && (
              <Button type="button" disabled={busy !== null} onClick={() => void onApply()}>
                {run.status === 'failed'
                  ? t('importPreview.resumeButton')
                  : t('importPreview.applyButton')}
              </Button>
            )}
            {busy === 'apply' && <p>{t('importPreview.applying')}</p>}

            {run.status === 'done' && report !== null && (
              <Notice tone="success" live="polite">
                <p>{t('importPreview.reportImported', { count: report.imported ?? 0 })}</p>
                {(report.resumedSkips ?? 0) > 0 && (
                  <p>{t('importPreview.reportSkipped', { count: report.resumedSkips })}</p>
                )}
              </Notice>
            )}
            {run.status === 'failed' && run.error !== null && (
              <Notice tone="danger" live="assertive">
                <p>{t('importPreview.statusFailed', { error: run.error })}</p>
              </Notice>
            )}

            {(run.status === 'done' || run.status === 'running') && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy !== null}
                onClick={() => void onCancel()}
              >
                {t('importPreview.cancelButton')}
              </Button>
            )}
            {busy === 'cancel' && <p>{t('importPreview.cancelling')}</p>}

            {run.status === 'cancelled' && (
              <Notice tone="info" live="polite">
                <p>{t('importPreview.cancelled')}</p>
              </Notice>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  )
}
