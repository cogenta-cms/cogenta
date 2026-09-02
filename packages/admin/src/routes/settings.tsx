import { type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { readConfigStatus } from '../api/ops-status-client.js'
import { listSettings, type SiteSetting, writeSetting } from '../api/settings-client.js'
import { useAuth } from '../auth/auth-context.js'
import { useAutosaveEnabled } from '../lib/autosave-prefs.js'
import { useSchema } from '../schema/schema-context.js'
import { useRefreshSiteSettings } from '../settings/site-settings-context.js'
import { SiteSettingsField } from '../settings/site-settings-field.js'
import { type SectionAutosave, useSectionAutosave } from '../settings/site-settings-section.js'
import { NAV_GROUPS, NAV_ITEMS, type NavGroupId } from '../shell/nav-items.js'
import {
  type NavLayoutOverrides,
  parseNavLayoutOverrides,
  reorderByKey,
  serialiseNavLayoutOverrides,
} from '../shell/nav-layout.js'
import { cn } from '../ui/cn.js'
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  Notice,
  SavedIndicator,
  Select,
  useSavedIndicator,
} from '../ui/index.js'

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

const TAB_ORDER = [
  'general',
  'reading',
  'discussion',
  'media',
  'privacy',
  'navigation',
  'advanced',
] as const
type TabId = (typeof TAB_ORDER)[number]

/**
 * `null` for a group this screen has no tab for — `commerce` (fiche 34 task
 * 4), which gets its own "Boutique" screen instead of a slot here, and
 * `branding` (fiche 68 task 5), moved to the "Apparence" screen's own
 * "Marque" card. Falling back to `'general'` for an unknown group would
 * silently mix shop or branding settings into the editorial general tab;
 * skipping them is the correct behaviour until a future group earns its own
 * tab.
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
  const refreshSiteSettings = useRefreshSiteSettings()
  const siteLocales = schema.status === 'ready' ? (schema.schema.site?.locales ?? ['en']) : ['en']
  const defaultLocale =
    schema.status === 'ready' ? (schema.schema.site?.defaultLocale ?? 'en') : 'en'

  const [tab, setTab] = useState<TabId>('general')
  const [locale, setLocale] = useState(defaultLocale)
  const [settings, setSettings] = useState<readonly SiteSetting[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notFoundPath, setNotFoundPath] = useState<string | null>(null)
  // Every field auto-saves on blur with no "Save" button of its own — the
  // only tell that it worked was a network request nobody but a developer
  // would think to check. A brief, self-clearing confirmation is the whole
  // fix — shared with `appearance.tsx` rather than each screen inventing its
  // own timeout, and now fed by both an individual field's own autosave
  // *and* a section's manual "Enregistrer" flush (`save()` below is the one
  // funnel both go through).
  const savedIndicator = useSavedIndicator()
  const [autosaveEnabled, setAutosaveEnabled] = useAutosaveEnabled()

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
    savedIndicator.show()
  }

  // Fiche 22 tâche 8, part 3 — the four `navigation.*` keys always travel
  // together: a reorder or a hide always produces a full, self-consistent
  // `NavLayoutOverrides`, so this writes all four rather than asking the
  // Navigation tab to know which of the four actually changed this time.
  const navOverrides = useMemo(() => parseNavLayoutOverrides(settings ?? []), [settings])
  async function saveNavOverrides(next: NavLayoutOverrides): Promise<void> {
    if (token === null) return
    const serialised = serialiseNavLayoutOverrides(next)
    await Promise.all([
      writeSetting(token, 'navigation.sectionOrder', serialised.sectionOrder),
      writeSetting(token, 'navigation.hiddenSections', serialised.hiddenSections),
      writeSetting(token, 'navigation.itemOrder', serialised.itemOrder),
      writeSetting(token, 'navigation.hiddenItems', serialised.hiddenItems),
    ])
    // Unlike the general `save()` above, this has to be seen immediately in
    // the shell's own sidebar (`app-shell.tsx` reads the same four keys off
    // the shared `SiteSettingsProvider`, not this screen's local `settings`)
    // — the whole point of the Navigation tab is seeing a hide/reorder take
    // effect without a reload.
    await Promise.all([reload(), refreshSiteSettings()])
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
        <h1 id="settings-heading" className="m-0 text-2xl leading-tight font-bold tracking-tight">
          {t('settings.heading')}
        </h1>
        <p className="text-muted-foreground text-sm">{t('settings.description')}</p>
      </div>

      {loadError !== null && (
        <Notice tone="danger" live="assertive">
          <p>{loadError}</p>
        </Notice>
      )}

      <SavedIndicator visible={savedIndicator.visible} label={t('settings.savedNotice')} />

      <Card aria-labelledby="settings-autosave-heading">
        <CardHeader>
          <CardTitle>
            <h2 id="settings-autosave-heading">{t('settings.autosaveHeading')}</h2>
          </CardTitle>
        </CardHeader>
        <CardBody>
          <label className="flex items-center gap-2 font-sans text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={autosaveEnabled}
              onChange={(event) => setAutosaveEnabled(event.target.checked)}
            />
            {t('settings.autosaveToggleLabel')}
          </label>
          <p className="m-0 mt-1.5 text-xs text-muted-foreground">
            {t('settings.autosaveToggleHelp')}
          </p>
        </CardBody>
      </Card>

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
            autosaveEnabled={autosaveEnabled}
          />
        )}
        {tab === 'reading' && (
          <ReadingTab
            settings={byTab.get('reading') ?? []}
            notFoundPath={notFoundPath}
            onSave={save}
            autosaveEnabled={autosaveEnabled}
          />
        )}
        {tab === 'discussion' && (
          <DiscussionTab
            settings={byTab.get('discussion') ?? []}
            onSave={save}
            autosaveEnabled={autosaveEnabled}
          />
        )}
        {tab === 'media' && (
          <MediaTab
            settings={byTab.get('media') ?? []}
            onSave={save}
            autosaveEnabled={autosaveEnabled}
          />
        )}
        {tab === 'privacy' && (
          <PrivacyTab
            settings={byTab.get('privacy') ?? []}
            onSave={save}
            autosaveEnabled={autosaveEnabled}
          />
        )}
        {tab === 'navigation' && (
          <NavigationTab overrides={navOverrides} onSave={saveNavOverrides} />
        )}
        {tab === 'advanced' && <AdvancedTab />}
      </div>
    </section>
  )
}

type TabSaveHandler = (key: string, value: unknown, locale: string | null) => Promise<void>

/**
 * The explicit "Enregistrer" one field-autosaving `<Card>` always shows now,
 * whatever the "Enregistrer automatiquement" preference is set to (the site
 * owner's own words: "surtout et surtout toujours ajouter le bouton
 * enregistrer chaque fois"). Disabled while `!section.hasPending` — true for
 * the whole life of a `<Card>` when autosave is on, since nothing is ever
 * queued in that case; see `site-settings-section.ts` for why that alone is
 * enough, without also asking the toggle's own current state.
 */
function SectionSaveFooter({
  section,
  label,
}: {
  readonly section: SectionAutosave
  readonly label: string
}): JSX.Element {
  return (
    <>
      <CardFooter>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          loading={section.saving}
          disabled={!section.hasPending}
          onClick={() => void section.flush()}
        >
          {label}
        </Button>
      </CardFooter>
      {section.error !== null && (
        <div className="px-5 pb-4">
          <Notice tone="danger" live="assertive">
            <p>{section.error}</p>
          </Notice>
        </div>
      )}
    </>
  )
}

function GeneralTab({
  settings,
  locale,
  locales,
  defaultLocale,
  onLocaleChange,
  onSave,
  autosaveEnabled,
}: {
  readonly settings: readonly SiteSetting[]
  readonly locale: string
  readonly locales: readonly string[]
  readonly defaultLocale: string
  readonly onLocaleChange: (locale: string) => void
  readonly onSave: TabSaveHandler
  readonly autosaveEnabled: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const section = useSectionAutosave(autosaveEnabled, onSave)
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
                {...section.fieldFor(setting.key, null)}
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
                {...section.fieldFor(setting.key, locale)}
              />
            ))}
        </CardBody>
        {settings.length > 0 && (
          <SectionSaveFooter section={section} label={t('settings.saveSectionAction')} />
        )}
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
  autosaveEnabled,
}: {
  readonly settings: readonly SiteSetting[]
  readonly notFoundPath: string | null
  readonly onSave: TabSaveHandler
  readonly autosaveEnabled: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const section = useSectionAutosave(autosaveEnabled, onSave)
  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        {settings.map((setting) => (
          <SiteSettingsField
            key={setting.key}
            setting={setting}
            canEdit
            onSave={(value) => onSave(setting.key, value, null)}
            {...section.fieldFor(setting.key, null)}
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
      {settings.length > 0 && (
        <SectionSaveFooter section={section} label={t('settings.saveSectionAction')} />
      )}
    </Card>
  )
}

function MediaTab({
  settings,
  onSave,
  autosaveEnabled,
}: {
  readonly settings: readonly SiteSetting[]
  readonly onSave: TabSaveHandler
  readonly autosaveEnabled: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const section = useSectionAutosave(autosaveEnabled, onSave)
  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        {settings.map((setting) => (
          <SiteSettingsField
            key={setting.key}
            setting={setting}
            canEdit
            onSave={(value) => onSave(setting.key, value, null)}
            {...section.fieldFor(setting.key, null)}
          />
        ))}
        <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <dt className="font-medium">{t('settings.mediaFormatsLabel')}</dt>
          <dd className="m-0">{t('settings.mediaFormatsValue')}</dd>
        </dl>
      </CardBody>
      {settings.length > 0 && (
        <SectionSaveFooter section={section} label={t('settings.saveSectionAction')} />
      )}
    </Card>
  )
}

/**
 * Fiche 15 task 5 — the site-wide `discussion.*` defaults (ADR-0025). Every
 * comment-enabled site starts here; a collection or a single entry can then
 * override `enabled` (and a collection can override `moderationRequired`)
 * from `/collections/:name` and the entry editor sidebar respectively —
 * neither lives in this registry (see `SITE_SETTINGS_REGISTRY`'s own comment
 * on the `discussion` group for why), so this tab only ever shows the site
 * floor the rest of the inheritance chain falls back to.
 */
function DiscussionTab({
  settings,
  onSave,
  autosaveEnabled,
}: {
  readonly settings: readonly SiteSetting[]
  readonly onSave: TabSaveHandler
  readonly autosaveEnabled: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const section = useSectionAutosave(autosaveEnabled, onSave)
  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        {settings.map((setting) => (
          <SiteSettingsField
            key={setting.key}
            setting={setting}
            canEdit
            onSave={(value) => onSave(setting.key, value, null)}
            {...section.fieldFor(setting.key, null)}
          />
        ))}
        <p className="m-0 text-xs text-muted-foreground">{t('settings.discussionNote')}</p>
      </CardBody>
      {settings.length > 0 && (
        <SectionSaveFooter section={section} label={t('settings.saveSectionAction')} />
      )}
    </Card>
  )
}

function PrivacyTab({
  settings,
  onSave,
  autosaveEnabled,
}: {
  readonly settings: readonly SiteSetting[]
  readonly onSave: TabSaveHandler
  readonly autosaveEnabled: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const section = useSectionAutosave(autosaveEnabled, onSave)
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
              {...section.fieldFor(setting.key, null)}
            />
          ))}
        <p className="m-0 text-xs text-muted-foreground">{t('settings.noCookieByDefault')}</p>
      </CardBody>
      {settings.length > 0 && (
        <SectionSaveFooter section={section} label={t('settings.saveSectionAction')} />
      )}
    </Card>
  )
}

/**
 * "Navigation" (fiche 22 tâche 8, part 3) — reordering and hiding sidebar
 * sections and entries, site-wide (`navigation.*`, `nav-layout.ts`), the
 * example the fiche itself gives being "hide Boutique on a portfolio site".
 *
 * Deliberately edits the *full*, unfiltered `NAV_GROUPS`/`NAV_ITEMS`
 * (`reorderByKey` applied directly, not `visibleNavGroups`): an admin
 * configuring this screen has to see and act on an entry regardless of
 * whether their own account would currently be shown it — hiding Boutique
 * has to work before the shop is ever visited, and reordering a section
 * only `admin` can see must still work for `admin` to arrange it.
 *
 * Buttons only, no drag-and-drop, unlike the dashboard's own customize panel
 * (fiche 22 tâche 2): two nested reorderable lists (sections, then entries
 * within a section) is already enough surface for named up/down controls to
 * cover the whole feature — a second interaction model here would be an
 * abstraction for a case this screen does not have (AGENTS.md).
 */
function NavigationTab({
  overrides,
  onSave,
}: {
  readonly overrides: NavLayoutOverrides
  readonly onSave: (next: NavLayoutOverrides) => Promise<void>
}): JSX.Element {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)

  const displayedGroups = reorderByKey(NAV_GROUPS, (group) => group.id, overrides.sectionOrder)
  const displayedItemsByGroup = new Map(
    displayedGroups.map((group) => [
      group.id,
      reorderByKey(
        NAV_ITEMS.filter((item) => item.group === group.id),
        (item) => item.to,
        overrides.itemOrder,
      ),
    ]),
  )

  async function persist(next: NavLayoutOverrides): Promise<void> {
    setSaving(true)
    try {
      await onSave(next)
    } finally {
      setSaving(false)
    }
  }

  function moveGroup(groupId: NavGroupId, direction: 'up' | 'down'): void {
    const pos = displayedGroups.findIndex((group) => group.id === groupId)
    const target = direction === 'up' ? pos - 1 : pos + 1
    if (pos === -1 || target < 0 || target >= displayedGroups.length) return
    const reordered = [...displayedGroups]
    const swap = reordered[target]
    reordered[target] = reordered[pos] as (typeof reordered)[number]
    reordered[pos] = swap as (typeof reordered)[number]
    void persist({ ...overrides, sectionOrder: reordered.map((group) => group.id) })
  }

  function toggleGroupHidden(groupId: NavGroupId): void {
    const hidden = new Set(overrides.hiddenSections)
    if (hidden.has(groupId)) hidden.delete(groupId)
    else hidden.add(groupId)
    void persist({
      ...overrides,
      hiddenSections: NAV_GROUPS.map((group) => group.id).filter((id) => hidden.has(id)),
    })
  }

  function moveItem(groupId: NavGroupId, itemTo: string, direction: 'up' | 'down'): void {
    const items = displayedItemsByGroup.get(groupId) ?? []
    const pos = items.findIndex((item) => item.to === itemTo)
    const target = direction === 'up' ? pos - 1 : pos + 1
    if (pos === -1 || target < 0 || target >= items.length) return
    const reordered = [...items]
    const swap = reordered[target]
    reordered[target] = reordered[pos] as (typeof reordered)[number]
    reordered[pos] = swap as (typeof reordered)[number]
    // The other groups keep their own currently-displayed arrangement — only
    // this one group's slice of the flat, cross-group `itemOrder` changes.
    const nextItemOrder = displayedGroups.flatMap((group) =>
      group.id === groupId
        ? reordered.map((item) => item.to)
        : (displayedItemsByGroup.get(group.id) ?? []).map((item) => item.to),
    )
    void persist({ ...overrides, itemOrder: nextItemOrder })
  }

  function toggleItemHidden(itemTo: string): void {
    const hidden = new Set(overrides.hiddenItems)
    if (hidden.has(itemTo)) hidden.delete(itemTo)
    else hidden.add(itemTo)
    void persist({
      ...overrides,
      hiddenItems: NAV_ITEMS.map((item) => item.to).filter((to) => hidden.has(to)),
    })
  }

  return (
    <Card aria-busy={saving}>
      <CardBody className="flex flex-col gap-4">
        <p className="m-0 text-xs text-muted-foreground">{t('settings.navigationNote')}</p>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {displayedGroups.map((group, groupIndex) => (
            <li key={group.id} className="rounded-md border border-border p-3">
              <div className="flex items-center gap-2">
                <label className="flex flex-1 items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    checked={!overrides.hiddenSections.includes(group.id)}
                    onChange={() => toggleGroupHidden(group.id)}
                  />
                  {t(group.labelKey)}
                </label>
                <button
                  type="button"
                  onClick={() => moveGroup(group.id, 'up')}
                  disabled={groupIndex === 0}
                  className="rounded-sm border border-border px-2 py-0.5 text-xs disabled:opacity-40"
                >
                  {t('dashboard.moveUp')}
                </button>
                <button
                  type="button"
                  onClick={() => moveGroup(group.id, 'down')}
                  disabled={groupIndex === displayedGroups.length - 1}
                  className="rounded-sm border border-border px-2 py-0.5 text-xs disabled:opacity-40"
                >
                  {t('dashboard.moveDown')}
                </button>
              </div>

              <ul className="m-0 mt-2.5 flex list-none flex-col gap-1.5 border-l border-dashed border-border py-0 pr-0 pl-3">
                {(displayedItemsByGroup.get(group.id) ?? []).map((item, itemIndex, items) => (
                  <li key={item.to} className="flex items-center gap-2 text-sm">
                    <label className="flex flex-1 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!overrides.hiddenItems.includes(item.to)}
                        onChange={() => toggleItemHidden(item.to)}
                      />
                      {t(item.labelKey)}
                    </label>
                    <button
                      type="button"
                      onClick={() => moveItem(group.id, item.to, 'up')}
                      disabled={itemIndex === 0}
                      className="rounded-sm border border-border px-2 py-0.5 text-xs disabled:opacity-40"
                    >
                      {t('dashboard.moveUp')}
                    </button>
                    <button
                      type="button"
                      onClick={() => moveItem(group.id, item.to, 'down')}
                      disabled={itemIndex === items.length - 1}
                      className="rounded-sm border border-border px-2 py-0.5 text-xs disabled:opacity-40"
                    >
                      {t('dashboard.moveDown')}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
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
