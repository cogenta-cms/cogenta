import type { TFunction } from 'i18next'
import { type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { ApiError } from '../api/client.js'
import { getSeoDiagnostics, type SeoContentRef, type SeoDiagnostics } from '../api/seo-client.js'
import { listSettings, type SiteSetting, writeSetting } from '../api/settings-client.js'
import { useAuth } from '../auth/auth-context.js'
import { useSchema } from '../schema/schema-context.js'
import { SiteSettingsField } from '../settings/site-settings-field.js'
import { cn } from '../ui/cn.js'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Input,
  Notice,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '../ui/index.js'
import { RedirectsPanel } from './redirects.js'

/**
 * `/seo` — the merged SEO screen (fiche 21 task 3).
 *
 * Before this fiche, `seo.tsx` was deliberately read-only (diagnostics only
 * — a comment in the old version of this file said so explicitly) and
 * `redirects.tsx` was a separate nav entry with its own screen. Neither was
 * an ADR: the "read-only" choice was a previous lot's scope decision, and
 * this fiche overrides it — SEO settings (title templates, sitemap hints,
 * social defaults) are editorial site configuration, the same category as
 * `SettingsRoute`'s own Général/Reading/Discussion tabs (ADR-0025's third
 * category), so this screen persists through the exact same
 * `SiteSettingsStore`/`SITE_SETTINGS_REGISTRY` machinery, just under its own
 * `seo` group and its own screen rather than a tab on `/settings` — the same
 * reason `commerce` gets `/commerce/settings` instead of a `SettingsRoute`
 * tab.
 *
 * Five tabs, structured after Yoast SEO / Rank Math's own settings grouping
 * (their organisation, never their code): **Général** (title/description
 * templates), **Sitemap** (per-collection inclusion, change frequency and
 * priority — see `readSitemapOverride`'s comment for what `@cogenta/seo`
 * actually consumes before this fiche added the rest), **Réseaux sociaux**
 * (default Open Graph/Twitter Card), **Redirections** (`redirects.tsx`,
 * moved here unchanged as `RedirectsPanel`), **Diagnostic** (the read-only
 * reports this screen already had, untouched). One nav entry, "SEO",
 * replaces the previous two ("SEO" and "Redirections" — see `nav-items.ts`).
 *
 * Admin-only for the whole screen, every tab included: SEO settings are no
 * more a `viewer`/`editor` concern than `commerce.settings` or
 * `ops-settings` are, and a redirect never had a reader role either.
 */

const TAB_ORDER = ['general', 'sitemap', 'social', 'redirects', 'diagnostics'] as const
type TabId = (typeof TAB_ORDER)[number]

/**
 * `createSeoRouter`'s `reason` (`@cogenta/api`) is prose meant for an API
 * response, in English, by AGENTS.md's own "code in English" rule — but the
 * diagnostics tab renders it straight into a French admin screen (found
 * auditing the SEO screen end to end, 2026-08-26: "This collection declares
 * no route." sitting in an otherwise fully French table). Only the two
 * reasons the router actually emits are mapped; an unrecognised future
 * reason still shows, in whatever language the server sent it, rather than
 * silently disappearing.
 */
function translatedSitemapReason(t: TFunction, reason: string | null): string {
  if (reason === 'This collection declares no route.') return t('seo.reasonNoRoute')
  if (reason === 'This collection is not readable by the "public" role.') {
    return t('seo.reasonNotPublicRole')
  }
  return reason ?? '—'
}

function isTabId(value: string | null): value is TabId {
  return TAB_ORDER.includes(value as TabId)
}

const CHANGE_FREQUENCIES = [
  '',
  'always',
  'hourly',
  'daily',
  'weekly',
  'monthly',
  'yearly',
  'never',
] as const

interface SitemapOverride {
  readonly included: boolean
  readonly changefreq: (typeof CHANGE_FREQUENCIES)[number]
  readonly priority: number | ''
}

const DEFAULT_SITEMAP_OVERRIDE: SitemapOverride = { included: true, changefreq: '', priority: '' }

function collectionTemplatesFrom(
  settings: readonly SiteSetting[],
): Readonly<Record<string, string>> {
  const found = settings.find((setting) => setting.key === 'seo.collectionTitleTemplates')
  const value = found?.value
  return typeof value === 'object' && value !== null ? (value as Record<string, string>) : {}
}

function sitemapOverridesFrom(
  settings: readonly SiteSetting[],
): Readonly<Record<string, SitemapOverride>> {
  const found = settings.find((setting) => setting.key === 'seo.sitemapCollectionSettings')
  const value = found?.value
  return typeof value === 'object' && value !== null
    ? (value as Record<string, SitemapOverride>)
    : {}
}

export function SeoRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')
  const schema = useSchema()
  const routedCollections = useMemo(
    () =>
      schema.status === 'ready'
        ? schema.schema.collections.filter((collection) => collection.routing !== undefined)
        : [],
    [schema],
  )

  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const [tab, setTab] = useState<TabId>(isTabId(requestedTab) ? requestedTab : 'general')

  function selectTab(next: TabId): void {
    setTab(next)
    setSearchParams((params) => {
      params.set('tab', next)
      return params
    })
  }

  const [settings, setSettings] = useState<readonly SiteSetting[] | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)

  const reloadSettings = useCallback(async (): Promise<void> => {
    try {
      setSettings(await listSettings())
      setSettingsError(null)
    } catch (caught) {
      setSettingsError(caught instanceof Error ? caught.message : t('seo.settingsLoadError'))
    }
  }, [t])

  useEffect(() => {
    if (!isAdmin) return
    void reloadSettings()
  }, [isAdmin, reloadSettings])

  const seoSettings = useMemo(
    () => (settings ?? []).filter((setting) => setting.group === 'seo'),
    [settings],
  )

  async function saveSetting(key: string, value: unknown): Promise<void> {
    if (token === null) return
    await writeSetting(token, key, value)
    await reloadSettings()
  }

  if (!isAdmin) {
    return (
      <section aria-labelledby="seo-heading">
        <h1 id="seo-heading">{t('seo.pageHeading')}</h1>
        <p role="alert">{t('seo.adminOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="seo-heading" className="flex flex-col gap-6">
      <div>
        <h1 id="seo-heading" className="m-0 text-xl leading-7 font-semibold">
          {t('seo.pageHeading')}
        </h1>
        <p className="text-muted-foreground text-sm">{t('seo.pageDescription')}</p>
      </div>

      {settingsError !== null && (
        <Notice tone="danger" live="assertive">
          <p>{settingsError}</p>
        </Notice>
      )}

      <div
        role="tablist"
        aria-label={t('seo.pageHeading')}
        className="flex flex-wrap gap-1 border-b border-border"
      >
        {TAB_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`seo-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`seo-panel-${id}`}
            className={cn(
              'rounded-t-md px-3 py-2 font-sans text-sm font-medium transition-colors',
              tab === id
                ? 'border border-b-0 border-border bg-card text-card-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => selectTab(id)}
          >
            {t(`seo.tab.${id}`)}
          </button>
        ))}
      </div>

      <div id={`seo-panel-${tab}`} role="tabpanel" aria-labelledby={`seo-tab-${tab}`}>
        {tab === 'general' && (
          <GeneralTab
            settings={seoSettings}
            collections={routedCollections}
            templates={collectionTemplatesFrom(seoSettings)}
            onSave={saveSetting}
          />
        )}
        {tab === 'sitemap' && (
          <SitemapTab
            collections={routedCollections}
            overrides={sitemapOverridesFrom(seoSettings)}
            onSave={saveSetting}
          />
        )}
        {tab === 'social' && <SocialTab settings={seoSettings} onSave={saveSetting} />}
        {tab === 'redirects' && <RedirectsPanel />}
        {tab === 'diagnostics' && <DiagnosticsTab active={tab === 'diagnostics'} />}
      </div>
    </section>
  )
}

type TabSaveHandler = (key: string, value: unknown) => Promise<void>

/** Exported for `test/seo/seo-tabs.test.tsx` — mounted directly, the same isolation `SeoPanel`'s own suite uses, without needing a routed collection in the shared app-level test fixture. */
export function GeneralTab({
  settings,
  collections,
  templates,
  onSave,
}: {
  readonly settings: readonly SiteSetting[]
  readonly collections: readonly {
    readonly name: string
    readonly labels: { readonly singular: string }
  }[]
  readonly templates: Readonly<Record<string, string>>
  readonly onSave: TabSaveHandler
}): JSX.Element {
  const { t } = useTranslation()
  const titleTemplate = settings.find((setting) => setting.key === 'seo.titleTemplate')
  const defaultDescription = settings.find(
    (setting) => setting.key === 'seo.defaultMetaDescription',
  )

  async function saveTemplate(collection: string, template: string): Promise<void> {
    await onSave('seo.collectionTitleTemplates', { ...templates, [collection]: template })
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('seo.tab.general')}</h2>
          </CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          {titleTemplate !== undefined && (
            <SiteSettingsField
              setting={titleTemplate}
              canEdit
              onSave={(value) => onSave('seo.titleTemplate', value)}
            />
          )}
          {defaultDescription !== undefined && (
            <SiteSettingsField
              setting={defaultDescription}
              canEdit
              onSave={(value) => onSave('seo.defaultMetaDescription', value)}
            />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('seo.collectionTemplatesHeading')}</h2>
          </CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <p className="text-muted-foreground m-0 text-sm">
            {t('seo.collectionTemplatesDescription')}
          </p>
          {collections.length === 0 ? (
            <p className="text-muted-foreground m-0 text-sm">{t('seo.noRoutedCollections')}</p>
          ) : (
            <TableRoot label={t('seo.collectionTemplatesHeading')}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>{t('seo.collectionColumn')}</TableHeader>
                    <TableHeader>{t('seo.templateColumn')}</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {collections.map((collection) => (
                    <TemplateRow
                      key={collection.name}
                      collection={collection}
                      value={templates[collection.name] ?? ''}
                      onSave={(value) => saveTemplate(collection.name, value)}
                    />
                  ))}
                </TableBody>
              </Table>
            </TableRoot>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function TemplateRow({
  collection,
  value,
  onSave,
}: {
  readonly collection: { readonly name: string; readonly labels: { readonly singular: string } }
  readonly value: string
  readonly onSave: (value: string) => Promise<void>
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <TableRow>
      <TableCell className="font-mono text-sm">{collection.labels.singular}</TableCell>
      <TableCell>
        <Input
          aria-label={t('seo.templateColumn')}
          placeholder={t('seo.templatePlaceholder')}
          defaultValue={value}
          onBlur={(event) => void onSave(event.target.value)}
        />
      </TableCell>
    </TableRow>
  )
}

/** Exported for `test/seo/seo-tabs.test.tsx` — see `GeneralTab`'s own comment. */
export function SitemapTab({
  collections,
  overrides,
  onSave,
}: {
  readonly collections: readonly {
    readonly name: string
    readonly labels: { readonly singular: string }
  }[]
  readonly overrides: Readonly<Record<string, SitemapOverride>>
  readonly onSave: TabSaveHandler
}): JSX.Element {
  const { t } = useTranslation()

  async function saveOverride(collection: string, patch: Partial<SitemapOverride>): Promise<void> {
    const current = overrides[collection] ?? DEFAULT_SITEMAP_OVERRIDE
    await onSave('seo.sitemapCollectionSettings', {
      ...overrides,
      [collection]: { ...current, ...patch },
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('seo.tab.sitemap')}</h2>
        </CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <p className="text-muted-foreground m-0 text-sm">
          {t('seo.sitemapCollectionsDescription')}
        </p>
        {collections.length === 0 ? (
          <p className="text-muted-foreground m-0 text-sm">{t('seo.noRoutedCollections')}</p>
        ) : (
          <TableRoot label={t('seo.tab.sitemap')}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>{t('seo.collectionColumn')}</TableHeader>
                  <TableHeader>{t('seo.includedColumn')}</TableHeader>
                  <TableHeader>{t('seo.changefreqColumn')}</TableHeader>
                  <TableHeader>{t('seo.priorityColumn')}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {collections.map((collection) => (
                  <SitemapRow
                    key={collection.name}
                    collection={collection}
                    override={overrides[collection.name] ?? DEFAULT_SITEMAP_OVERRIDE}
                    onSave={(patch) => saveOverride(collection.name, patch)}
                  />
                ))}
              </TableBody>
            </Table>
          </TableRoot>
        )}
      </CardBody>
    </Card>
  )
}

function SitemapRow({
  collection,
  override,
  onSave,
}: {
  readonly collection: { readonly name: string; readonly labels: { readonly singular: string } }
  readonly override: SitemapOverride
  readonly onSave: (patch: Partial<SitemapOverride>) => Promise<void>
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <TableRow>
      <TableCell className="font-mono text-sm">{collection.labels.singular}</TableCell>
      <TableCell>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            aria-label={t('seo.includedColumn')}
            checked={override.included}
            onChange={(event) => void onSave({ included: event.target.checked })}
          />
        </label>
      </TableCell>
      <TableCell>
        <Select
          aria-label={t('seo.changefreqColumn')}
          value={override.changefreq}
          onChange={(event) =>
            void onSave({ changefreq: event.target.value as SitemapOverride['changefreq'] })
          }
        >
          {CHANGE_FREQUENCIES.map((frequency) => (
            <option key={frequency || 'none'} value={frequency}>
              {frequency === '' ? t('seo.changefreqNone') : t(`seo.changefreq.${frequency}`)}
            </option>
          ))}
        </Select>
      </TableCell>
      <TableCell>
        <Input
          aria-label={t('seo.priorityColumn')}
          type="number"
          min={0}
          max={1}
          step={0.1}
          placeholder={t('seo.priorityPlaceholder')}
          defaultValue={override.priority}
          onBlur={(event) => {
            const raw = event.target.value.trim()
            if (raw === '') {
              void onSave({ priority: '' })
              return
            }
            const parsed = Number(raw)
            if (!Number.isNaN(parsed)) void onSave({ priority: parsed })
          }}
        />
      </TableCell>
    </TableRow>
  )
}

function SocialTab({
  settings,
  onSave,
}: {
  readonly settings: readonly SiteSetting[]
  readonly onSave: TabSaveHandler
}): JSX.Element {
  const { t } = useTranslation()
  const twitterHandle = settings.find((setting) => setting.key === 'seo.twitterHandle')
  const defaultImage = settings.find((setting) => setting.key === 'seo.defaultSocialImageUrl')

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('seo.socialHeading')}</h2>
        </CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <p className="text-muted-foreground m-0 text-sm">{t('seo.socialDescription')}</p>
        {twitterHandle !== undefined && (
          <SiteSettingsField
            setting={twitterHandle}
            canEdit
            onSave={(value) => onSave('seo.twitterHandle', value)}
          />
        )}
        {defaultImage !== undefined && (
          <SiteSettingsField
            setting={defaultImage}
            canEdit
            onSave={(value) => onSave('seo.defaultSocialImageUrl', value)}
          />
        )}
      </CardBody>
    </Card>
  )
}

/**
 * `GET /api/seo/diagnostics` — fiche 13, Task 2, unchanged since. "C'est
 * cette section qui aurait attrapé le bug isPublished" is the fiche's own
 * framing, and it is why this panel still computes every number live from
 * the exact same `@cogenta/seo` functions the public render path calls
 * (`isIndexable`, `isPublished`, `buildMetaTags`) rather than re-deriving
 * anything. Loaded only once this tab is actually selected — a diagnostic
 * scan walks every published entry, so it should not run just because an
 * admin opened `/seo` to edit a title template.
 */
function DiagnosticsTab({ active }: { readonly active: boolean }): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null

  const [data, setData] = useState<SeoDiagnostics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (token === null) return
    setLoading(true)
    setError(null)
    try {
      setData(await getSeoDiagnostics(token))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('seo.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, t])

  useEffect(() => {
    if (!active || data !== null) return
    void load()
  }, [active, data, load])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="m-0 text-lg leading-7 font-semibold">{t('seo.heading')}</h2>
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
                  <h3>{t('seo.anomaliesHeading')}</h3>
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
                <h3>{t('seo.sitemapHeading')}</h3>
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
                          {translatedSitemapReason(t, report.reason)}
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
                <h3>{t('seo.robotsHeading')}</h3>
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
                <h3>{t('seo.contentHeading')}</h3>
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
    </div>
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
