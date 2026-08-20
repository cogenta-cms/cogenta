import { type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { readConfigStatus } from '../api/ops-status-client.js'
import { listSettings, type SiteSetting, writeSetting } from '../api/settings-client.js'
import { useAuth } from '../auth/auth-context.js'
import { useSchema } from '../schema/schema-context.js'
import { SiteSettingsField } from '../settings/site-settings-field.js'
import { cn } from '../ui/cn.js'
import { Card, CardBody, CardHeader, CardTitle, Notice, Select } from '../ui/index.js'

/**
 * "Réglages" — fiche 23's rewrite. Before this, `/settings` held exactly one
 * control (the admin's own interface language, ADR-0019) which moved to
 * `/profile` (L11 task 3's "manage my account in one place"): this screen is
 * now the site-wide editorial settings ADR-0025 names as the third category
 * between infrastructure (`cogenta.config.mjs`, read-only — `/ops-settings`)
 * and a personal preference (`localStorage`, never on the server at all).
 *
 * Tabs on WordPress's own model, "parce qu'il est connu de tout le monde"
 * (fiche 23 § 4): the panel a `group` on `GET /api/settings` belongs to is
 * exactly the tab it renders under, and adding a setting to the registry
 * with an existing `group` needs no change here.
 */

const TAB_ORDER = ['general', 'reading', 'discussion', 'media', 'privacy', 'advanced'] as const
type TabId = (typeof TAB_ORDER)[number]

/**
 * `null` for a group this screen has no tab for — today only `commerce`
 * (fiche 34 task 4), which gets its own "Boutique" screen instead of a slot
 * here. Falling back to `'general'` for an unknown group would silently mix
 * shop settings into the editorial general tab; skipping them is the correct
 * behaviour until a future group earns its own tab.
 */
function groupOf(setting: SiteSetting): TabId | null {
  return TAB_ORDER.includes(setting.group as TabId) ? (setting.group as TabId) : null
}

export function SettingsRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')
  const schema = useSchema()
  const siteLocales = schema.status === 'ready' ? (schema.schema.site?.locales ?? ['en']) : ['en']
  const defaultLocale =
    schema.status === 'ready' ? (schema.schema.site?.defaultLocale ?? 'en') : 'en'

  const [tab, setTab] = useState<TabId>('general')
  const [locale, setLocale] = useState(defaultLocale)
  const [settings, setSettings] = useState<readonly SiteSetting[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notFoundPath, setNotFoundPath] = useState<string | null>(null)

  useEffect(() => {
    if (token === null || !isAdmin) return
    let cancelled = false
    readConfigStatus(token)
      .then((status) => {
        if (!cancelled) setNotFoundPath(status?.site.notFoundPath ?? null)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [token, isAdmin])

  const reload = useCallback(async (): Promise<void> => {
    try {
      const data = await listSettings(locale)
      setSettings(data)
      setLoadError(null)
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : t('settings.loadError'))
    }
  }, [locale, t])

  useEffect(() => {
    void reload()
  }, [reload])

  // Follows the schema once it resolves, rather than staying pinned to
  // 'en' — a site whose real default locale is 'fr' should show French
  // taglines by default, not require a manual switch every visit.
  useEffect(() => {
    setLocale(defaultLocale)
  }, [defaultLocale])

  const byTab = useMemo(() => {
    const grouped = new Map<TabId, SiteSetting[]>()
    for (const setting of settings ?? []) {
      const tabId = groupOf(setting)
      if (tabId === null) continue
      const list = grouped.get(tabId) ?? []
      list.push(setting)
      grouped.set(tabId, list)
    }
    for (const list of grouped.values()) list.sort((a, b) => a.order - b.order)
    return grouped
  }, [settings])

  async function save(key: string, value: unknown, settingLocale: string | null): Promise<void> {
    if (token === null) return
    await writeSetting(token, key, value, settingLocale ?? undefined)
    await reload()
  }

  if (!isAdmin) {
    return (
      <section aria-labelledby="settings-heading">
        <h1 id="settings-heading">{t('settings.heading')}</h1>
        <p role="alert">{t('settings.adminOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="settings-heading" className="flex flex-col gap-6">
      <div>
        <h1 id="settings-heading" className="m-0 text-xl leading-7 font-semibold">
          {t('settings.heading')}
        </h1>
        <p className="text-muted-foreground text-sm">{t('settings.description')}</p>
      </div>

      {loadError !== null && (
        <Notice tone="danger" live="assertive">
          <p>{loadError}</p>
        </Notice>
      )}

      <div
        role="tablist"
        aria-label={t('settings.heading')}
        className="flex flex-wrap gap-1 border-b border-border"
      >
        {TAB_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`settings-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`settings-panel-${id}`}
            className={cn(
              'rounded-t-md px-3 py-2 font-sans text-sm font-medium transition-colors',
              tab === id
                ? 'border border-b-0 border-border bg-card text-card-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setTab(id)}
          >
            {t(`settings.tab.${id}`)}
          </button>
        ))}
      </div>

      <div id={`settings-panel-${tab}`} role="tabpanel" aria-labelledby={`settings-tab-${tab}`}>
        {tab === 'general' && (
          <GeneralTab
            settings={byTab.get('general') ?? []}
            locale={locale}
            locales={siteLocales}
            defaultLocale={defaultLocale}
            onLocaleChange={setLocale}
            onSave={save}
          />
        )}
        {tab === 'reading' && (
          <ReadingTab
            settings={byTab.get('reading') ?? []}
            notFoundPath={notFoundPath}
            onSave={save}
          />
        )}
        {tab === 'discussion' && <DiscussionTab />}
        {tab === 'media' && <MediaTab settings={byTab.get('media') ?? []} onSave={save} />}
        {tab === 'privacy' && <PrivacyTab settings={byTab.get('privacy') ?? []} onSave={save} />}
        {tab === 'advanced' && <AdvancedTab />}
      </div>
    </section>
  )
}

type TabSaveHandler = (key: string, value: unknown, locale: string | null) => Promise<void>

function GeneralTab({
  settings,
  locale,
  locales,
  defaultLocale,
  onLocaleChange,
  onSave,
}: {
  readonly settings: readonly SiteSetting[]
  readonly locale: string
  readonly locales: readonly string[]
  readonly defaultLocale: string
  readonly onLocaleChange: (locale: string) => void
  readonly onSave: TabSaveHandler
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4">
      <Card aria-labelledby="settings-general-heading">
        <CardHeader>
          <CardTitle>
            <h2 id="settings-general-heading">{t('settings.tab.general')}</h2>
          </CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          {settings
            .filter((setting) => setting.scope === 'site')
            .map((setting) => (
              <SiteSettingsField
                key={setting.key}
                setting={setting}
                canEdit
                onSave={(value) => onSave(setting.key, value, null)}
              />
            ))}

          {locales.length > 1 && (
            <div className="max-w-xs">
              <label
                htmlFor="settings-tagline-locale"
                className="font-sans text-sm leading-5 font-medium text-foreground"
              >
                {t('settings.taglineLocaleLabel')}
              </label>
              <Select
                id="settings-tagline-locale"
                className="mt-1.5"
                value={locale}
                onChange={(event) => onLocaleChange(event.target.value)}
              >
                {locales.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {settings
            .filter((setting) => setting.scope === 'locale')
            .map((setting) => (
              <SiteSettingsField
                key={`${setting.key}-${locale}`}
                setting={setting}
                canEdit
                onSave={(value) => onSave(setting.key, value, locale)}
              />
            ))}
        </CardBody>
      </Card>

      <Card aria-labelledby="settings-general-locale-heading">
        <CardHeader>
          <CardTitle>
            <h2 id="settings-general-locale-heading">{t('settings.defaultLocaleHeading')}</h2>
          </CardTitle>
        </CardHeader>
        <CardBody>
          <p className="m-0 text-sm">
            {defaultLocale} — {t('settings.provenanceReadOnly')}
          </p>
        </CardBody>
      </Card>
    </div>
  )
}

function ReadingTab({
  settings,
  notFoundPath,
  onSave,
}: {
  readonly settings: readonly SiteSetting[]
  readonly notFoundPath: string | null
  readonly onSave: TabSaveHandler
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        {settings.map((setting) => (
          <SiteSettingsField
            key={setting.key}
            setting={setting}
            canEdit
            onSave={(value) => onSave(setting.key, value, null)}
          />
        ))}
        <div className="flex flex-col gap-1.5">
          <span className="font-sans text-sm leading-5 font-medium text-foreground">
            {t('settings.notFoundPathLabel')}
          </span>
          <p className="m-0 text-sm">{notFoundPath ?? t('settings.notFoundPathUnavailable')}</p>
          <p className="m-0 text-xs text-muted-foreground">
            {t('settings.notFoundPathNote')} — {t('settings.provenanceReadOnly')}
          </p>
        </div>
      </CardBody>
    </Card>
  )
}

function MediaTab({
  settings,
  onSave,
}: {
  readonly settings: readonly SiteSetting[]
  readonly onSave: TabSaveHandler
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        {settings.map((setting) => (
          <SiteSettingsField
            key={setting.key}
            setting={setting}
            canEdit
            onSave={(value) => onSave(setting.key, value, null)}
          />
        ))}
        <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <dt className="font-medium">{t('settings.mediaFormatsLabel')}</dt>
          <dd className="m-0">{t('settings.mediaFormatsValue')}</dd>
        </dl>
      </CardBody>
    </Card>
  )
}

function DiscussionTab(): JSX.Element {
  const { t } = useTranslation()
  return (
    <Card>
      <CardBody>
        <p className="m-0 text-sm text-muted-foreground">{t('settings.discussionPlaceholder')}</p>
      </CardBody>
    </Card>
  )
}

function PrivacyTab({
  settings,
  onSave,
}: {
  readonly settings: readonly SiteSetting[]
  readonly onSave: TabSaveHandler
}): JSX.Element {
  const { t } = useTranslation()
  const cookieBanner = settings.find((setting) => setting.key === 'privacy.cookieBannerEnabled')
  const bannerEnabled = cookieBanner?.value === true

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        {settings
          .filter((setting) => setting.key !== 'privacy.cookieBannerMessage' || bannerEnabled)
          .map((setting) => (
            <SiteSettingsField
              key={setting.key}
              setting={setting}
              canEdit
              onSave={(value) => onSave(setting.key, value, null)}
            />
          ))}
        <p className="m-0 text-xs text-muted-foreground">{t('settings.noCookieByDefault')}</p>
      </CardBody>
    </Card>
  )
}

function AdvancedTab(): JSX.Element {
  const { t } = useTranslation()
  return (
    <Card>
      <CardBody>
        <p className="m-0 text-sm">
          <Link to="/ops-settings" className="text-primary underline-offset-2 hover:underline">
            {t('settings.advancedLink')}
          </Link>
        </p>
        <p className="mt-2 mb-0 text-xs text-muted-foreground">{t('settings.advancedNote')}</p>
      </CardBody>
    </Card>
  )
}
