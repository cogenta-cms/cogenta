import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ApiError } from '../api/client.js'
import { getSeoDiagnostics, type SeoContentRef, type SeoDiagnostics } from '../api/seo-client.js'
import { useAuth } from '../auth/auth-context.js'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Notice,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '../ui/index.js'

/**
 * `GET /api/seo/diagnostics` — fiche 13, Task 2.
 *
 * "C'est cette section qui aurait attrapé le bug isPublished" is the fiche's
 * own framing, and it is why this screen exists before anything about title
 * templates or a robots.txt editor: a sitemap of zero URLs on a site that has
 * published content is an anomaly, not a neutral number, and this is the one
 * place that says so instead of a client discovering it in Google Search
 * Console weeks later.
 *
 * Every number on this page is computed live by the exact same
 * `@cogenta/seo` functions the public render path calls (`isIndexable`,
 * `isPublished`, `buildMetaTags`) — never re-derived here.
 *
 * Read-only by design (matching `OpsSettingsRoute`'s own reasoning for
 * `security`/`webhooks`): sitemap inclusion, title templates and
 * `robots.txt` extras are site configuration, not admin-editable rows —
 * see `seo-router.ts`'s own doc comment for the fuller version of this
 * trade-off. Admin-only, because none of this is content a `viewer` or an
 * `editor` needs to see about collections they may not even read.
 */
export function SeoRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [data, setData] = useState<SeoDiagnostics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      setData(await getSeoDiagnostics(token))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('seo.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    void load()
  }, [load])

  if (!isAdmin) {
    return (
      <section aria-labelledby="seo-heading">
        <h1 id="seo-heading">{t('seo.heading')}</h1>
        <p role="alert">{t('seo.adminOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="seo-heading" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 id="seo-heading" className="m-0 text-xl leading-7 font-semibold">
            {t('seo.heading')}
          </h1>
          <p className="text-muted-foreground text-sm">{t('seo.description')}</p>
        </div>
        <Button type="button" variant="secondary" disabled={loading} onClick={() => void load()}>
          {t('seo.refresh')}
        </Button>
      </div>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}
      {loading && data === null && <p>{t('common.loading')}</p>}

      {data !== null && (
        <>
          {data.anomalies.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>{t('seo.anomaliesHeading')}</h2>
                </CardTitle>
              </CardHeader>
              <CardBody className="flex flex-col gap-2">
                {data.anomalies.map((anomaly) => (
                  <Notice key={anomaly.code} tone="warning">
                    <p>{anomaly.message}</p>
                  </Notice>
                ))}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t('seo.sitemapHeading')}</h2>
              </CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-3">
              <p className="m-0 text-lg font-semibold">
                {t('seo.sitemapTotal', { count: data.sitemap.totalUrls })}
              </p>
              <TableRoot label={t('seo.collectionsTableLabel')}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeader>{t('seo.collectionColumn')}</TableHeader>
                      <TableHeader>{t('seo.includedColumn')}</TableHeader>
                      <TableHeader>{t('seo.urlCountColumn')}</TableHeader>
                      <TableHeader>{t('seo.reasonColumn')}</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.sitemap.collections.map((report) => (
                      <TableRow key={report.name}>
                        <TableCell className="font-mono text-sm">{report.name}</TableCell>
                        <TableCell>
                          {report.included ? t('seo.includedYes') : t('seo.includedNo')}
                        </TableCell>
                        <TableCell>{report.urlCount}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {report.reason ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableRoot>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t('seo.robotsHeading')}</h2>
              </CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-3">
              {data.robots.disallowsEverything && (
                <Notice tone="danger">
                  <p>{t('seo.robotsDisallowAll')}</p>
                </Notice>
              )}
              <pre className="m-0 overflow-x-auto rounded-md border border-border bg-card p-3 font-mono text-xs">
                {data.robots.content}
              </pre>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t('seo.contentHeading')}</h2>
              </CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <p className="m-0 text-sm">
                {t('seo.publishedCount', { count: data.content.publishedCount })}
                {' · '}
                {t('seo.noindexCount', { count: data.content.noindexCount })}
              </p>

              <IssueList
                heading={t('seo.missingDescriptionHeading')}
                items={data.content.missingDescriptionCount}
                empty={t('seo.noIssues')}
                viewLabel={t('seo.viewEntry')}
              />

              <IssueList
                heading={t('seo.tooLongTitleHeading', { length: 60 })}
                items={data.content.tooLongTitleCount}
                empty={t('seo.noIssues')}
                viewLabel={t('seo.viewEntry')}
              />

              <div>
                <h3 className="m-0 mb-2 text-sm font-semibold">
                  {t('seo.duplicateTitlesHeading')}
                </h3>
                {data.content.duplicateTitles.length === 0 ? (
                  <p className="text-muted-foreground m-0 text-sm">{t('seo.noIssues')}</p>
                ) : (
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {data.content.duplicateTitles.map((group) => (
                      <li key={group.title} className="text-sm">
                        <p className="m-0 font-medium">“{group.title}”</p>
                        <ul className="m-0 flex list-none flex-col gap-1 p-0 pl-3">
                          {group.entries.map((entry) => (
                            <li key={`${entry.collection}-${entry.id}`}>
                              <EntryLink entry={entry} label={t('seo.viewEntry')} />
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardBody>
          </Card>

          <p className="text-muted-foreground text-sm">
            {t('seo.generatedAt', { at: new Date(data.generatedAt).toLocaleString() })}
          </p>
        </>
      )}
    </section>
  )
}

function EntryLink({
  entry,
  label,
}: {
  readonly entry: SeoContentRef
  readonly label: string
}): JSX.Element {
  return (
    <Link
      to={`/collections/${encodeURIComponent(entry.collection)}/${encodeURIComponent(entry.id)}`}
      className="text-primary underline"
    >
      {entry.collection} — {label}
    </Link>
  )
}

function IssueList({
  heading,
  items,
  empty,
  viewLabel,
}: {
  readonly heading: string
  readonly items: readonly SeoContentRef[]
  readonly empty: string
  readonly viewLabel: string
}): JSX.Element {
  return (
    <div>
      <h3 className="m-0 mb-2 text-sm font-semibold">
        {heading} {items.length > 0 && `(${items.length})`}
      </h3>
      {items.length === 0 ? (
        <p className="text-muted-foreground m-0 text-sm">{empty}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
          {items.map((entry) => (
            <li key={`${entry.collection}-${entry.id}`}>
              <EntryLink entry={entry} label={viewLabel} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
