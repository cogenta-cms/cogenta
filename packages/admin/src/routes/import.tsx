import { type ChangeEvent, type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import { importWordPressExport, type WordPressImportReport } from '../api/import-client.js'
import { useAuth } from '../auth/auth-context.js'
import { Card, CardBody, CardDescription, CardHeader, CardTitle, Notice } from '../ui/index.js'

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
    </section>
  )
}
