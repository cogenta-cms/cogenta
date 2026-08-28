import type { TFunction } from 'i18next'
import { type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { ApiError } from '../api/client.js'
import {
  disconnectSearchConsole,
  getSearchConsoleAuthorizeUrl,
  getSearchConsoleMetrics,
  getSearchConsoleStatus,
  type SearchConsoleMetrics,
  type SearchConsoleStatus,
} from '../api/search-console-client.js'
import {
  getSeoDiagnostics,
  getSeoLinkSuggestions,
  type SeoContentRef,
  type SeoDiagnostics,
  type SeoLinkSuggestions,
} from '../api/seo-client.js'
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

// `features` first (fiche 70 task 3's own "section en tête d'écran" — the
// grid is the one screen that answers "what is on, what is off" for every
// SEO sub-feature this admin offers, so it leads).
const TAB_ORDER = ['features', 'general', 'sitemap', 'social', 'redirects', 'diagnostics'] as const
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
        {tab === 'features' && (
          <FeaturesTab
            settings={seoSettings}
            collections={routedCollections}
            onSave={saveSetting}
          />
        )}
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
        {tab === 'diagnostics' && (
          <DiagnosticsTab
            active={tab === 'diagnostics'}
            settings={seoSettings}
            onSave={saveSetting}
            collections={routedCollections}
          />
        )}
      </div>
    </section>
  )
}

type TabSaveHandler = (key: string, value: unknown) => Promise<void>

/**
 * Fiche 70 task 3 — one card per SEO sub-feature, each with a real toggle.
 *
 * The whole point named by the fiche's own acceptance criterion is that
 * "activer une carte doit changer exactement le même réglage que l'écran
 * d'origine, jamais un doublon" — every `settingKey` below is the identical
 * key some other tab on this screen already reads/writes (IndexNow and
 * llms.txt on the Général tab's `IndexingExtrasCard`, the verification
 * tokens and custom rules on the Diagnostics tab), so flipping a card here
 * and reloading the page a different tab was left on shows the same state,
 * because it *is* the same state — one `SiteSettingsStore` row, never a
 * second copy.
 *
 * Content score and the link assistant have no settings screen elsewhere
 * (they existed for the first time in this fiche), so their card is that
 * feature's only on/off switch.
 */
interface FeatureCardDescriptor {
  readonly id:
    | 'indexNow'
    | 'llmsTxt'
    | 'contentScore'
    | 'linkAssistant'
    | 'searchVerification'
    | 'robotsCustomRules'
  readonly settingKey: string
}

const FEATURE_CARDS: readonly FeatureCardDescriptor[] = [
  { id: 'contentScore', settingKey: 'seo.contentScoreEnabled' },
  { id: 'linkAssistant', settingKey: 'seo.linkAssistantEnabled' },
  { id: 'searchVerification', settingKey: 'seo.searchVerificationEnabled' },
  { id: 'robotsCustomRules', settingKey: 'seo.robotsCustomRulesEnabled' },
  { id: 'indexNow', settingKey: 'seo.indexNowEnabled' },
  { id: 'llmsTxt', settingKey: 'seo.llmsTxtEnabled' },
]

function stringSettingValue(settings: readonly SiteSetting[], key: string): string {
  const value = settings.find((setting) => setting.key === key)?.value
  return typeof value === 'string' ? value : ''
}

/**
 * Whether a card reads as "grisé" (fiche's own word) — dependent on a
 * setting nobody has filled in yet, so the switch would turn on a feature
 * with nothing for it to actually do. Never means hidden: every card still
 * renders, with its toggle and its explanation, exactly as the fiche
 * requires ("jamais caché").
 */
function isDependencyMissing(
  id: FeatureCardDescriptor['id'],
  settings: readonly SiteSetting[],
  collections: readonly { readonly name: string }[],
): boolean {
  if (id === 'linkAssistant') return collections.length === 0
  if (id === 'indexNow') return stringSettingValue(settings, 'seo.indexNowKey') === ''
  if (id === 'searchVerification') {
    return (
      stringSettingValue(settings, 'seo.googleSiteVerification') === '' &&
      stringSettingValue(settings, 'seo.bingSiteVerification') === ''
    )
  }
  if (id === 'robotsCustomRules')
    return stringSettingValue(settings, 'seo.robotsCustomRules') === ''
  return false
}

function FeaturesTab({
  settings,
  collections,
  onSave,
}: {
  readonly settings: readonly SiteSetting[]
  readonly collections: readonly {
    readonly name: string
    readonly labels: { readonly singular: string }
  }[]
  readonly onSave: TabSaveHandler
}): JSX.Element {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="m-0 text-lg leading-7 font-semibold">{t('seo.featuresHeading')}</h2>
        <p className="text-muted-foreground text-sm">{t('seo.featuresDescription')}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FEATURE_CARDS.map((card) => (
          <FeatureCard
            key={card.id}
            card={card}
            settings={settings}
            dependencyMissing={isDependencyMissing(card.id, settings, collections)}
            onSave={onSave}
          />
        ))}
      </div>
    </div>
  )
}

function FeatureCard({
  card,
  settings,
  dependencyMissing,
  onSave,
}: {
  readonly card: FeatureCardDescriptor
  readonly settings: readonly SiteSetting[]
  readonly dependencyMissing: boolean
  readonly onSave: TabSaveHandler
}): JSX.Element {
  const { t } = useTranslation()
  const setting = settings.find((candidate) => candidate.key === card.settingKey)
  const enabled = setting?.value === true
  const [saving, setSaving] = useState(false)

  async function toggle(next: boolean): Promise<void> {
    setSaving(true)
    try {
      await onSave(card.settingKey, next)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className={dependencyMissing ? 'opacity-60' : undefined}>
      <CardBody className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <h3 className="m-0 text-sm font-semibold text-foreground">
            {t(`seo.feature.${card.id}.title`)}
          </h3>
          <input
            type="checkbox"
            role="switch"
            aria-checked={enabled}
            aria-label={t(`seo.feature.${card.id}.title`)}
            checked={enabled}
            disabled={saving || setting === undefined}
            onChange={(event) => void toggle(event.target.checked)}
            className="shrink-0"
          />
        </div>
        <p className="text-muted-foreground m-0 text-sm">
          {t(`seo.feature.${card.id}.description`)}
        </p>
        {dependencyMissing && (
          <p className="text-muted-foreground m-0 text-xs italic">
            {t(`seo.feature.${card.id}.dependencyHint`)}
          </p>
        )}
      </CardBody>
    </Card>
  )
}

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

      <SearchEngineVerificationCard settings={settings} onSave={onSave} />
      <IndexingExtrasCard settings={settings} onSave={onSave} />
    </div>
  )
}

/**
 * Fiche 50 task 2 — meta-tag verification for Google Search Console and Bing
 * Webmaster Tools. Both `SiteSettingsField`-rendered `string` settings: no
 * bespoke widget needed, since a verification token is exactly a single-line
 * text value the generic field already knows how to save on blur.
 */
function SearchEngineVerificationCard({
  settings,
  onSave,
}: {
  readonly settings: readonly SiteSetting[]
  readonly onSave: TabSaveHandler
}): JSX.Element {
  const { t } = useTranslation()
  const google = settings.find((setting) => setting.key === 'seo.googleSiteVerification')
  const bing = settings.find((setting) => setting.key === 'seo.bingSiteVerification')

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('seo.verificationHeading')}</h2>
        </CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <p className="text-muted-foreground m-0 text-sm">{t('seo.verificationDescription')}</p>
        {google !== undefined && (
          <SiteSettingsField
            setting={google}
            canEdit
            onSave={(value) => onSave('seo.googleSiteVerification', value)}
          />
        )}
        {bing !== undefined && (
          <SiteSettingsField
            setting={bing}
            canEdit
            onSave={(value) => onSave('seo.bingSiteVerification', value)}
          />
        )}
      </CardBody>
    </Card>
  )
}

/** A random IndexNow key, in the exact hexadecimal shape `indexNowKeyOrEmpty` requires (`@cogenta/schema`). */
function generateIndexNowKey(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Fiche 50 tasks 3 and 5 — the two off-by-default indexing extras.
 * `seo.indexNowKey` gets a bespoke control (a text input plus a "Generate"
 * button) rather than the generic `SiteSettingsField`, because the button
 * writes a value the field itself never typed — a plain `defaultValue`-based
 * input would keep showing the old key after a `Generate` click, since
 * nothing forces an uncontrolled input to pick up a value it did not type.
 */
function IndexingExtrasCard({
  settings,
  onSave,
}: {
  readonly settings: readonly SiteSetting[]
  readonly onSave: TabSaveHandler
}): JSX.Element {
  const { t } = useTranslation()
  const enabled = settings.find((setting) => setting.key === 'seo.indexNowEnabled')
  const keySetting = settings.find((setting) => setting.key === 'seo.indexNowKey')
  const llmsTxtEnabled = settings.find((setting) => setting.key === 'seo.llmsTxtEnabled')

  const [keyValue, setKeyValue] = useState(
    typeof keySetting?.value === 'string' ? keySetting.value : '',
  )
  const [keySaving, setKeySaving] = useState(false)
  const [keyError, setKeyError] = useState<string | null>(null)

  useEffect(() => {
    setKeyValue(typeof keySetting?.value === 'string' ? keySetting.value : '')
  }, [keySetting?.value])

  async function saveKey(next: string): Promise<void> {
    setKeySaving(true)
    setKeyError(null)
    try {
      await onSave('seo.indexNowKey', next)
      setKeyValue(next)
    } catch (caught) {
      setKeyError(caught instanceof Error ? caught.message : t('settings.saveError'))
    } finally {
      setKeySaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('seo.indexNowHeading')}</h2>
        </CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <p className="text-muted-foreground m-0 text-sm">{t('seo.indexNowDescription')}</p>
        {enabled !== undefined && (
          <SiteSettingsField
            setting={enabled}
            canEdit
            onSave={(value) => onSave('seo.indexNowEnabled', value)}
          />
        )}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="seo-indexnow-key"
            className="font-sans text-sm font-medium text-foreground"
          >
            {t('seo.indexNowKeyLabel')}
          </label>
          <div className="flex gap-2">
            <Input
              id="seo-indexnow-key"
              className="flex-1 font-mono"
              value={keyValue}
              disabled={keySaving}
              onChange={(event) => setKeyValue(event.target.value)}
              onBlur={(event) => void saveKey(event.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={keySaving}
              onClick={() => void saveKey(generateIndexNowKey())}
            >
              {t('seo.indexNowGenerateKey')}
            </Button>
          </div>
          {keyValue !== '' && (
            <p className="text-muted-foreground m-0 font-mono text-xs">
              {t('seo.indexNowKeyFileHint', { url: `${window.location.origin}/${keyValue}.txt` })}
            </p>
          )}
          {keyError !== null && (
            <p role="alert" className="text-xs leading-5 font-medium text-destructive">
              {keyError}
            </p>
          )}
        </div>
        {llmsTxtEnabled !== undefined && (
          <SiteSettingsField
            setting={llmsTxtEnabled}
            canEdit
            onSave={(value) => onSave('seo.llmsTxtEnabled', value)}
          />
        )}
      </CardBody>
    </Card>
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
 * A bare `Disallow: /` for `*` — the one line that blocks every crawler from
 * the whole site (fiche 50's own named pitfall). Mirrors `@cogenta/seo`'s
 * `robotsRuleDisallowsEverything` (`robots.ts`) verbatim rather than
 * importing it: this admin has no dependency on `@cogenta/seo` today, and a
 * single regex is not worth adding one for.
 */
const ROBOTS_DISALLOW_ALL_PATTERN = /^\s*Disallow:\s*\/\s*$/imu

const ROBOTS_TEXTAREA_CLASSES =
  'w-full appearance-none rounded-md border border-input bg-card px-3 py-2 font-mono text-xs ' +
  'leading-5 text-card-foreground shadow-card transition-colors placeholder:text-muted-foreground ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ' +
  'disabled:cursor-default disabled:opacity-60'

/**
 * Fiche 50 task 4 — an admin's own robots.txt lines, merged into the
 * rendered document shown just above (`renderRobots`'s `customRules`
 * option). A bespoke editor rather than the generic `SiteSettingsField`,
 * because saving here has a gate the generic field cannot express: a rule
 * that would block every crawler needs an explicit confirmation first, the
 * same `window.confirm` pattern this admin already uses for an irreversible
 * action (`comments.tsx`'s purge confirm).
 */
function RobotsCustomRulesEditor({
  settings,
  onSave,
}: {
  readonly settings: readonly SiteSetting[]
  readonly onSave: TabSaveHandler
}): JSX.Element {
  const { t } = useTranslation()
  const setting = settings.find((candidate) => candidate.key === 'seo.robotsCustomRules')
  const value = typeof setting?.value === 'string' ? setting.value : ''

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function commit(next: string): Promise<void> {
    if (next === value) return
    if (
      ROBOTS_DISALLOW_ALL_PATTERN.test(next) &&
      !window.confirm(t('seo.robotsDisallowAllConfirm'))
    ) {
      return
    }
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await onSave('seo.robotsCustomRules', next)
      setSaved(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('settings.saveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor="seo-robots-custom-rules"
        className="font-sans text-sm font-medium text-foreground"
      >
        {t('seo.robotsCustomRulesLabel')}
      </label>
      <textarea
        id="seo-robots-custom-rules"
        className={ROBOTS_TEXTAREA_CLASSES}
        rows={4}
        disabled={saving}
        defaultValue={value}
        placeholder={t('seo.robotsCustomRulesPlaceholder')}
        onBlur={(event) => void commit(event.target.value)}
      />
      <p className="text-muted-foreground m-0 text-xs">{t('seo.robotsCustomRulesHelp')}</p>
      {error !== null && (
        <p role="alert" className="text-xs leading-5 font-medium text-destructive">
          {error}
        </p>
      )}
      {error === null && saving && (
        <p className="text-xs leading-5 text-muted-foreground">{t('settings.saving')}</p>
      )}
      {error === null && !saving && saved && (
        <p className="text-xs leading-5 text-muted-foreground">{t('settings.saved')}</p>
      )}
    </div>
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
function DiagnosticsTab({
  active,
  settings,
  onSave,
  collections,
}: {
  readonly active: boolean
  /** Fiche 50 task 4 — needed only for the robots.txt custom-rules editor below. */
  readonly settings: readonly SiteSetting[]
  readonly onSave: TabSaveHandler
  /** Fiche 70 task 2 — routed collections, for the link assistant's own selector below. */
  readonly collections: readonly {
    readonly name: string
    readonly labels: { readonly singular: string }
  }[]
}): JSX.Element {
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
            <CardHeader className="flex-row items-center justify-between gap-2">
              <CardTitle>
                <h3>{t('seo.sitemapHeading')}</h3>
              </CardTitle>
              <a
                href={`${window.location.origin}/sitemap.xml`}
                target="_blank"
                rel="noreferrer"
                className="text-primary shrink-0 text-sm underline"
              >
                {t('seo.openSitemap')}
              </a>
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
            <CardHeader className="flex-row items-center justify-between gap-2">
              <CardTitle>
                <h3>{t('seo.robotsHeading')}</h3>
              </CardTitle>
              <a
                href={`${window.location.origin}/robots.txt`}
                target="_blank"
                rel="noreferrer"
                className="text-primary shrink-0 text-sm underline"
              >
                {t('seo.openRobots')}
              </a>
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
              <RobotsCustomRulesEditor settings={settings} onSave={onSave} />
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

      <LinkAssistantSection collections={collections} />
      <SearchConsoleSection />
    </div>
  )
}

/**
 * Fiche 70 task 4, ADR-0032 — "Performance réelle": Google Search Console's
 * clicks/impressions/CTR/position, the one thing the fiche's own research
 * names as the real gap versus AIOSEO/MonsterInsights/Site Kit.
 *
 * **Absent, not empty or erroring, without a connector configured** — the
 * same contract `GET /api/assistant` already established for the writing
 * assistant panel (L18): this component returns `null` outright once
 * `status.configured` comes back `false`, so a site with no
 * `COGENTA_SEARCH_CONSOLE_CLIENT_ID`/`_CLIENT_SECRET` never sees a broken or
 * empty card here (R1/R2).
 *
 * **Connecting leaves the SPA on purpose.** `window.location.href` to
 * Google's own consent screen, then back to `?search_console=connected` on
 * this same tab — there is no in-app modal, because the whole point of
 * OAuth is that Google's own origin is the one asking for consent.
 */
function SearchConsoleSection(): JSX.Element | null {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const [searchParams, setSearchParams] = useSearchParams()

  const [status, setStatus] = useState<SearchConsoleStatus | null>(null)
  const [metrics, setMetrics] = useState<SearchConsoleMetrics | null>(null)
  const [loading, setLoading] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    if (token === null) return
    setLoading(true)
    setError(null)
    try {
      const found = await getSearchConsoleStatus(token)
      setStatus(found)
      if (found.connected) setMetrics(await getSearchConsoleMetrics(token))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('seo.searchConsoleLoadError'))
    } finally {
      setLoading(false)
    }
  }, [token, t])

  useEffect(() => {
    void loadStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // The callback route redirects here with an outcome marker (fiche 70 task
  // 4) — shown once, then scrubbed from the URL so refreshing the page does
  // not keep repeating "connected".
  const outcome = searchParams.get('search_console')
  useEffect(() => {
    if (outcome === null) return
    setSearchParams((params) => {
      params.delete('search_console')
      return params
    })
  }, [outcome, setSearchParams])

  async function connect(): Promise<void> {
    if (token === null || connecting) return
    setConnecting(true)
    setError(null)
    try {
      const { url } = await getSearchConsoleAuthorizeUrl(token)
      window.location.href = url
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('seo.searchConsoleLoadError'))
      setConnecting(false)
    }
  }

  async function disconnect(): Promise<void> {
    if (token === null) return
    setLoading(true)
    setError(null)
    try {
      await disconnectSearchConsole(token)
      setMetrics(null)
      await loadStatus()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('seo.searchConsoleLoadError'))
    } finally {
      setLoading(false)
    }
  }

  if (status !== null && !status.configured) return null

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>
          <h3>{t('seo.searchConsoleHeading')}</h3>
        </CardTitle>
        {status?.connected === true && (
          <Button
            type="button"
            variant="secondary"
            disabled={loading}
            onClick={() => void disconnect()}
          >
            {t('seo.searchConsoleDisconnect')}
          </Button>
        )}
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <p className="text-muted-foreground m-0 text-sm">{t('seo.searchConsoleDescription')}</p>

        {outcome === 'denied' && (
          <Notice tone="warning" live="assertive">
            <p>{t('seo.searchConsoleDenied')}</p>
          </Notice>
        )}
        {outcome === 'connected' && (
          <Notice tone="success" live="polite">
            <p>{t('seo.searchConsoleConnected')}</p>
          </Notice>
        )}
        {error !== null && (
          <Notice tone="danger" live="assertive">
            <p>{error}</p>
          </Notice>
        )}

        {status === null && loading && <p>{t('common.loading')}</p>}

        {status !== null && !status.connected && (
          <Button type="button" disabled={connecting} onClick={() => void connect()}>
            {connecting ? t('seo.searchConsoleConnecting') : t('seo.searchConsoleConnect')}
          </Button>
        )}

        {status?.connected === true && (
          <>
            <p className="text-muted-foreground m-0 text-sm">
              {t('seo.searchConsoleConnectedTo', { siteUrl: status.siteUrl ?? '' })}
            </p>
            {metrics !== null && (
              <TableRoot label={t('seo.searchConsoleHeading')}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeader>{t('seo.searchConsolePageColumn')}</TableHeader>
                      <TableHeader>{t('seo.searchConsoleClicksColumn')}</TableHeader>
                      <TableHeader>{t('seo.searchConsoleImpressionsColumn')}</TableHeader>
                      <TableHeader>{t('seo.searchConsoleCtrColumn')}</TableHeader>
                      <TableHeader>{t('seo.searchConsolePositionColumn')}</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {metrics.rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-muted-foreground text-sm">
                          {t('seo.searchConsoleNoRows')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      metrics.rows.map((row) => (
                        <TableRow key={row.page}>
                          <TableCell className="font-mono text-sm">{row.page}</TableCell>
                          <TableCell>{row.clicks}</TableCell>
                          <TableCell>{row.impressions}</TableCell>
                          <TableCell>{(row.ctr * 100).toFixed(1)}%</TableCell>
                          <TableCell>{row.position.toFixed(1)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableRoot>
            )}
          </>
        )}
      </CardBody>
    </Card>
  )
}

/**
 * Fiche 70 task 2 — orphaned entries and internal-link candidates, one
 * routed collection at a time. A separate section from the scan above (own
 * loading state, own trigger) because `GET /api/seo/link-suggestions` reads
 * `update` permission on the chosen collection, not `admin` — an editor
 * without the `admin` role that the rest of this screen requires would
 * still be able to call it, so this section is built to stand on its own
 * rather than assume the page-level admin gate around it.
 */
function LinkAssistantSection({
  collections,
}: {
  readonly collections: readonly {
    readonly name: string
    readonly labels: { readonly singular: string }
  }[]
}): JSX.Element | null {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null

  const [collectionName, setCollectionName] = useState<string>(collections[0]?.name ?? '')
  const [suggestions, setSuggestions] = useState<SeoLinkSuggestions | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (token === null || collectionName === '') return
    setLoading(true)
    setError(null)
    try {
      setSuggestions(await getSeoLinkSuggestions(token, collectionName))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('seo.linkAssistantLoadError'))
    } finally {
      setLoading(false)
    }
  }, [token, collectionName, t])

  useEffect(() => {
    setSuggestions(null)
  }, [collectionName])

  useEffect(() => {
    if (collectionName === '' || suggestions !== null) return
    void load()
  }, [collectionName, suggestions, load])

  if (collections.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <h3>{t('seo.linkAssistantHeading')}</h3>
          </CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-muted-foreground m-0 text-sm">{t('seo.linkAssistantNoCollections')}</p>
        </CardBody>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>
          <h3>{t('seo.linkAssistantHeading')}</h3>
        </CardTitle>
        <Button type="button" variant="secondary" disabled={loading} onClick={() => void load()}>
          {t('seo.refresh')}
        </Button>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <p className="text-muted-foreground m-0 text-sm">{t('seo.linkAssistantDescription')}</p>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="link-assistant-collection"
            className="text-sm font-medium text-foreground"
          >
            {t('seo.linkAssistantCollectionLabel')}
          </label>
          <Select
            id="link-assistant-collection"
            value={collectionName}
            onChange={(event) => setCollectionName(event.target.value)}
          >
            {collections.map((collection) => (
              <option key={collection.name} value={collection.name}>
                {collection.labels.singular}
              </option>
            ))}
          </Select>
        </div>

        {error !== null && (
          <Notice tone="danger" live="assertive">
            <p>{error}</p>
          </Notice>
        )}
        {loading && suggestions === null && <p>{t('common.loading')}</p>}

        {suggestions !== null && (
          <>
            <div>
              <h4 className="m-0 mb-2 text-sm font-semibold">
                {t('seo.linkAssistantOrphansHeading')}{' '}
                {suggestions.orphans.length > 0 && `(${suggestions.orphans.length})`}
              </h4>
              {suggestions.orphans.length === 0 ? (
                <p className="text-muted-foreground m-0 text-sm">
                  {t('seo.linkAssistantNoOrphans')}
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                  {suggestions.orphans.map((orphan) => (
                    <li key={orphan.id}>
                      <EntryLink
                        entry={orphan}
                        label={orphan.title === '' ? t('seo.viewEntry') : orphan.title}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h4 className="m-0 mb-2 text-sm font-semibold">
                {t('seo.linkAssistantSuggestionsHeading')}
              </h4>
              {Object.keys(suggestions.suggestionsByEntry).length === 0 ? (
                <p className="text-muted-foreground m-0 text-sm">
                  {t('seo.linkAssistantNoSuggestions')}
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-3 p-0 text-sm">
                  {Object.entries(suggestions.suggestionsByEntry).map(([entryId, candidates]) => (
                    <li key={entryId}>
                      <EntryLink
                        entry={{ collection: suggestions.collection, id: entryId }}
                        label={entryId}
                      />
                      <ul className="m-0 flex list-none flex-col gap-1 p-0 pl-3">
                        {candidates.map((candidate) => (
                          <li key={candidate.id}>
                            <EntryLink entry={candidate} label={candidate.title} />
                            <span className="text-muted-foreground ml-2 text-xs">
                              {t('seo.linkAssistantSharedWords', {
                                count: candidate.sharedWordCount,
                              })}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardBody>
    </Card>
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
