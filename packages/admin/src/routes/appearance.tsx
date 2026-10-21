import {
  aaThreshold,
  CONTRAST_PAIRS,
  compositeOver,
  contrastRatio,
  meetsContrastAa,
  parseColor,
  TOKEN_GROUPS,
  TOKEN_SPECS,
} from '@cogenta/render/browser'
import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { ApiError } from '../api/client.js'
import { listSettings, type SiteSetting, writeSetting } from '../api/settings-client.js'
import {
  type AvailableTheme,
  activateTheme,
  applyGallerySkin,
  clearThemeOverrides,
  deleteTheme,
  exportThemeToFile,
  type GallerySkin,
  getTheme,
  previewTheme,
  saveThemeOverrides,
  type ThemeState,
} from '../api/theme-client.js'
import { useAuth } from '../auth/auth-context.js'
import { MediaPicker } from '../fields/media-picker.js'
import { shippedText } from '../i18n/shipped-text.js'
import { PALETTE_PRESETS, type PalettePreset } from '../lib/appearance-palettes.js'
import { useAutosaveEnabled } from '../lib/autosave-prefs.js'
import { useDirtyGuard } from '../lib/use-dirty-guard.js'
import { SiteSettingsField } from '../settings/site-settings-field.js'
import { useSectionAutosave } from '../settings/site-settings-section.js'
import {
  Button,
  buttonVariants,
  Card,
  CardBody,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  Label,
  Modal,
  Notice,
  SavedIndicator,
  useSavedIndicator,
} from '../ui/index.js'
import { TokenField } from './appearance-fields.js'
import { AppearancePreviewFrame } from './appearance-preview.js'
import { ThemeApplyDialog } from './theme-apply-dialog.js'
import { ThemeGalleryPreview } from './theme-gallery-preview.js'

/**
 * "Apparence" (fiche 14) — the screen the fiche calls one of the CMS's three
 * remaining blank spots.
 *
 * Two-source-of-truth design (task 0, option (b), the fiche's own
 * recommendation): `theme.tokens.json` stays the versioned default; every
 * value changed here is a partial overlay saved to the database
 * (`PUT /api/theme/overrides`), applied on top of the file at render time —
 * live, on the very next page view, no restart. Exporting the merged result
 * back into the file is a separate, `cogenta dev`-only action, mirroring the
 * ADR-0010 gate L19's site-plan applier already uses for the schema file.
 *
 * The token editor below is generated from `TOKEN_SPECS`/`TOKEN_GROUPS`
 * (`@cogenta/render`) rather than a hand-written field per token — a new
 * token in contract D shows up here without a change to this file, which is
 * the fiche's own acceptance criterion ("jamais des champs inventés").
 */

type TokenOverrides = Record<string, Record<string, unknown>>

function deepMerge(
  base: Record<string, unknown> | null,
  overlay: TokenOverrides,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(base ?? {}) }
  for (const group of TOKEN_GROUPS) {
    const overlayGroup = overlay[group]
    if (overlayGroup === undefined) continue
    merged[group] = {
      ...((base?.[group] as Record<string, unknown> | undefined) ?? {}),
      ...overlayGroup,
    }
  }
  return merged
}

function valueAt(tokens: Record<string, unknown> | null, group: string, name: string): unknown {
  const at = tokens?.[group] as Record<string, unknown> | undefined
  return at?.[name]
}

/**
 * A comparable form of an overlay: keys sorted, empty groups dropped. The draft
 * is built by spreading the saved overlay and adding keys as they are edited,
 * so two overlays that mean the same thing do not always serialise the same.
 */
function canonicalOverlay(overlay: TokenOverrides | null): string {
  const groups: Record<string, Record<string, unknown>> = {}
  for (const group of Object.keys(overlay ?? {}).sort()) {
    const values = overlay?.[group] ?? {}
    const names = Object.keys(values).sort()
    if (names.length === 0) continue
    groups[group] = Object.fromEntries(names.map((name) => [name, values[name]]))
  }
  return JSON.stringify(groups)
}

interface ContrastWarning {
  readonly foreground: string
  readonly background: string
  readonly ratio: number
  readonly required: number
}

function computeContrastWarnings(
  tokens: Record<string, unknown> | null,
): readonly ContrastWarning[] {
  if (tokens === null) return []
  const color = tokens['color'] as Record<string, unknown> | undefined
  if (color === undefined) return []
  const warnings: ContrastWarning[] = []
  for (const pair of CONTRAST_PAIRS) {
    const fgValue = color[pair.foreground]
    const bgValue = color[pair.background]
    if (typeof fgValue !== 'string' || typeof bgValue !== 'string') continue
    const fg = parseColor(fgValue)
    const bg = parseColor(bgValue)
    if (fg === null || bg === null) continue
    const resolved = fg.a >= 1 ? fg : compositeOver(fg, bg)
    const ratio = contrastRatio(resolved, bg)
    if (!meetsContrastAa(ratio, pair.size)) {
      warnings.push({
        foreground: pair.foreground,
        background: pair.background,
        ratio,
        required: aaThreshold(pair.size),
      })
    }
  }
  return warnings
}

const PREVIEW_DEBOUNCE_MS = 300

/**
 * The refusal of a save or a preview, in the admin's language. The server's
 * own message is written for a developer ("Skin fails WCAG 2.2 AA contrast on
 * 1 pair: color.accentFg (#ffffff) on …") and names the code, not the person's
 * screen, so the codes a colour or font edit can actually hit are translated
 * here and anything else falls back to the generic sentence.
 */
function skinErrorMessage(
  caught: unknown,
  fallback: string,
  t: (key: string) => string,
): string {
  if (caught instanceof ApiError) {
    switch (caught.code) {
      case 'SKIN_CONTRAST_INSUFFICIENT':
        return t('appearance.errors.contrast')
      case 'SKIN_TOKEN_INVALID':
        return t('appearance.errors.invalidValue')
      case 'SKIN_TOKEN_MISSING':
      case 'SKIN_TOKEN_UNKNOWN':
        return t('appearance.errors.tokenSet')
      case 'SKIN_SCALE_NOT_MONOTONIC':
        return t('appearance.errors.scale')
      default:
        return fallback
    }
  }
  return fallback
}

/**
 * "Marque" (fiche 68 task 5) — moved here from the "Réglages" screen's own
 * tab (fiche L21 task 8), on the reasoning that whether the site credits
 * Cogenta and what logo replaces that credit is a question about how the
 * site *looks*, the same family as everything else on this screen, not a
 * site-wide editorial default like a tagline or a comment policy.
 *
 * **No data migration** — same registry, same `GET|PATCH /api/settings`
 * route, same `branding.*` keys the old tab already read and wrote. Moving
 * the UI never touches a stored value, so a site that had already turned
 * Cogenta's credit off keeps that choice exactly as it was.
 *
 * Its own `listSettings`/`writeSetting` round trip, deliberately not folded
 * into `AppearanceRoute`'s own `theme`/`load` state — `branding.*` lives in
 * the site-settings store, not the theme-overrides one this screen is
 * otherwise entirely about, and mixing the two would make one `load()`
 * respond to two unrelated failure modes.
 *
 * It has no save button of its own: the screen's single "Enregistrer" flushes
 * it (`registerFlush`) and reads whether it has anything pending
 * (`onPendingChange`), so one click saves everything on the page.
 */
function BrandingCard({
  token,
  autosaveEnabled,
  onPendingChange,
  registerFlush,
}: {
  readonly token: string
  readonly autosaveEnabled: boolean
  onPendingChange(pending: boolean): void
  registerFlush(flush: () => Promise<void>): void
}): JSX.Element {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<readonly SiteSetting[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const indicator = useSavedIndicator()

  const load = useCallback(async () => {
    try {
      const data = await listSettings(undefined, token ?? undefined)
      setSettings(data.filter((setting) => setting.group === 'branding'))
      setLoadError(null)
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : t('appearance.brandingLoadError'))
    }
  }, [token, t])

  useEffect(() => {
    void load()
  }, [load])

  // Locale is always `null` here — every `branding.*` setting is site-scoped
  // (matches this card's pre-fiche shape, which never passed one either).
  async function save(key: string, value: unknown): Promise<void> {
    await writeSetting(token, key, value)
    await load()
    indicator.show()
  }

  const section = useSectionAutosave(autosaveEnabled, (key, value) => save(key, value))

  const flushRef = useRef(section.flush)
  flushRef.current = section.flush
  useEffect(() => {
    registerFlush(() => flushRef.current())
  }, [registerFlush])
  useEffect(() => {
    onPendingChange(section.hasPending)
  }, [section.hasPending, onPendingChange])

  return (
    <Card aria-labelledby="appearance-branding-heading">
      <CardHeader>
        <CardTitle>
          <h2 id="appearance-branding-heading">{t('appearance.brandingHeading')}</h2>
        </CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        {loadError !== null && (
          <Notice tone="danger" live="assertive">
            <p>{loadError}</p>
          </Notice>
        )}
        {(settings ?? []).map((setting) => (
          <SiteSettingsField
            key={setting.key}
            setting={setting}
            canEdit
            translationNamespace="appearance"
            onSave={(value) => save(setting.key, value)}
            {...section.fieldFor(setting.key, null)}
          />
        ))}
        <p className="m-0 text-xs text-muted-foreground">{t('appearance.brandingNote')}</p>
      </CardBody>
      <CardFooter>
        <SavedIndicator visible={indicator.visible} label={t('appearance.saved')} />
      </CardFooter>
      {section.error !== null && (
        <div className="px-5 pb-4">
          <Notice tone="danger" live="assertive">
            <p>{section.error}</p>
          </Notice>
        </div>
      )}
    </Card>
  )
}

/** The four colours of a palette, as a row of swatches. */
function Swatches({
  colors,
}: {
  readonly colors: readonly string[]
}): JSX.Element {
  return (
    <span aria-hidden="true" className="flex overflow-hidden rounded-md border border-input">
      {colors.map((color, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed-length row of colours that never reorders
          key={index}
          className="h-8 flex-1"
          style={{ background: color }}
        />
      ))}
    </span>
  )
}

function paletteMatches(palette: PalettePreset, tokens: Record<string, unknown> | null): boolean {
  const color = tokens?.['color'] as Record<string, unknown> | undefined
  if (color === undefined) return false
  return Object.entries(palette.colors).every(
    ([name, value]) => String(color[name] ?? '').toLowerCase() === value,
  )
}

export function AppearanceRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  // Two-screen navigation (fiche 48): the gallery (theme metadata and
  // switching) and the personalization screen (tokens, CSS, identity, skin
  // gallery, AI) — previously one dense, continuous screen. Fiche 71: this
  // used to be a plain `useState`, so the URL never changed between the two
  // views — an F5 or a shared link always landed back on the gallery. Now
  // derived straight from `?view=`, the same pattern `seo.tsx` proved for its
  // own tabs, so a reload or a shared link lands on the exact same view.
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view') === 'customize' ? 'customize' : 'gallery'
  const setView = (next: 'gallery' | 'customize') => {
    const params = new URLSearchParams(searchParams)
    params.set('view', next)
    setSearchParams(params)
  }
  const [theme, setTheme] = useState<ThemeState | null>(null)
  const [overrideDraft, setOverrideDraft] = useState<TokenOverrides>({})
  const [additionalCss, setAdditionalCss] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Shared with `settings.tsx` rather than a bespoke boolean + timeout: the
  // token editor below has always required its own explicit "Enregistrer"
  // click (never silent autosave), so only the *rendering* of its
  // confirmation changes here — `hide()` still clears it the instant a
  // further edit is made, exactly as the old `setSaved(false)` calls did.
  const savedIndicator = useSavedIndicator()
  const [autosaveEnabled] = useAutosaveEnabled()
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [switchingTheme, setSwitchingTheme] = useState<string | null>(null)
  const [switchThemeError, setSwitchThemeError] = useState<string | null>(null)
  const [deletingTheme, setDeletingTheme] = useState<AvailableTheme | null>(null)
  const [selectingTheme, setSelectingTheme] = useState<AvailableTheme | null>(null)
  const [selectingFocus, setSelectingFocus] = useState<'theme' | 'sample'>('theme')
  const [enlargedTheme, setEnlargedTheme] = useState<AvailableTheme | null>(null)
  const [deleteThemeInProgress, setDeleteThemeInProgress] = useState(false)
  const [deleteThemeError, setDeleteThemeError] = useState<string | null>(null)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [leavingToGallery, setLeavingToGallery] = useState(false)

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    try {
      const data = await getTheme(token)
      setTheme(data)
      setOverrideDraft((data.overrides.tokenOverrides as TokenOverrides | null) ?? {})
      setAdditionalCss(data.overrides.additionalCss ?? '')
      setLoadError(null)
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : t('appearance.loadError'))
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    void load()
  }, [load])

  const effectiveTokens = useMemo(
    () => (theme === null ? null : deepMerge(theme.fileTokens, overrideDraft)),
    [theme, overrideDraft],
  )
  const contrastWarnings = useMemo(
    () => computeContrastWarnings(effectiveTokens),
    [effectiveTokens],
  )

  // What is saved, to know whether the screen holds anything that would be
  // lost by leaving it.
  const savedOverlay = (theme?.overrides.tokenOverrides as TokenOverrides | null) ?? null
  const savedCss = theme?.overrides.additionalCss ?? ''
  const tokensDirty =
    theme !== null &&
    (canonicalOverlay(overrideDraft) !== canonicalOverlay(savedOverlay) || additionalCss !== savedCss)
  const hasSavedOverrides =
    canonicalOverlay(savedOverlay) !== '{}' || savedCss !== ''

  function setToken(group: string, name: string, value: unknown): void {
    setOverrideDraft((previous) => ({
      ...previous,
      [group]: { ...previous[group], [name]: value },
    }))
    savedIndicator.hide()
  }

  function applyPalette(palette: PalettePreset): void {
    setOverrideDraft((previous) => ({
      ...previous,
      color: { ...previous['color'], ...palette.colors },
    }))
    savedIndicator.hide()
  }

  // One preview render per settled edit, the same debounce and
  // abandoned-response discipline `PageBuilder` already uses for content.
  useEffect(() => {
    if (token === null || theme === null) return
    let abandoned = false
    const timer = setTimeout(() => {
      previewTheme(token, {
        tokens: overrideDraft as Record<string, unknown>,
        additionalCss,
      })
        .then((result) => {
          if (abandoned) return
          setPreviewHtml(result.html)
          setPreviewError(null)
        })
        .catch((caught: unknown) => {
          if (abandoned) return
          setPreviewError(skinErrorMessage(caught, t('appearance.previewError'), t))
        })
    }, PREVIEW_DEBOUNCE_MS)
    return () => {
      abandoned = true
      clearTimeout(timer)
    }
  }, [token, theme, overrideDraft, additionalCss, t])

  /**
   * "Identité" (logo/logo sombre/favicon/image de partage) — four
   * `MediaPicker`s that used to call `saveThemeOverrides` straight from
   * `onChange`, with no confirmation at all. Same draft-then-flush shape as
   * `SectionAutosave` (`site-settings-section.ts`), hand-rolled here rather
   * than reused: these four fields are not `SiteSettingsField`s (a media
   * reference has no setting *key* the registry knows), and they share one
   * PUT (`saveThemeOverrides` merges all four keys at once) rather than one
   * write per field.
   */
  const identityIndicator = useSavedIndicator()
  const [identityDraft, setIdentityDraft] = useState<
    Partial<
      Pick<
        ThemeState['overrides'],
        'logoMediaId' | 'logoDarkMediaId' | 'faviconMediaId' | 'shareImageMediaId'
      >
    >
  >({})
  const [brandingPending, setBrandingPending] = useState(false)
  const brandingFlush = useRef<(() => Promise<void>) | null>(null)
  const registerBrandingFlush = useCallback((flush: () => Promise<void>) => {
    brandingFlush.current = flush
  }, [])

  type IdentityField = 'logoMediaId' | 'logoDarkMediaId' | 'faviconMediaId' | 'shareImageMediaId'

  function identityValue(field: IdentityField): string | null {
    if (field in identityDraft) return identityDraft[field] ?? null
    return theme?.overrides[field] ?? null
  }

  async function handleIdentityChange(field: IdentityField, value: string | null): Promise<void> {
    if (!autosaveEnabled) {
      setIdentityDraft((previous) => ({ ...previous, [field]: value }))
      savedIndicator.hide()
      return
    }
    if (token === null) return
    await saveThemeOverrides(token, { [field]: value })
    await load()
    identityIndicator.show()
  }

  const identityDirty = Object.keys(identityDraft).length > 0
  const dirty = tokensDirty || identityDirty || brandingPending

  // Leaving with unsaved changes asks first — a click on any link of the
  // admin (`useDirtyGuard`), the tab being closed (`beforeunload`), and the
  // screen's own "back to the gallery" button, which is not a link.
  const blocker = useDirtyGuard(dirty && view === 'customize')

  /**
   * One "Enregistrer" for the whole screen: the colours, fonts and CSS, the
   * four identity images and the Cogenta credit used to have three buttons of
   * their own, and a change made in the second was lost by clicking the first.
   * Returns whether everything was written, so a guarded exit can continue.
   */
  async function saveAll(): Promise<boolean> {
    if (token === null) return false
    if (contrastWarnings.length > 0) return false
    setSaving(true)
    setSaveError(null)
    try {
      if (tokensDirty || identityDirty) {
        await saveThemeOverrides(token, {
          ...(tokensDirty
            ? {
                tokenOverrides: Object.keys(overrideDraft).length === 0 ? null : overrideDraft,
                additionalCss: additionalCss === '' ? null : additionalCss,
              }
            : {}),
          ...identityDraft,
        })
        setIdentityDraft({})
      }
      if (brandingPending) await brandingFlush.current?.()
      savedIndicator.show()
      await load()
      return true
    } catch (caught) {
      setSaveError(skinErrorMessage(caught, t('appearance.saveError'), t))
      return false
    } finally {
      setSaving(false)
    }
  }

  async function reset(): Promise<void> {
    if (token === null) return
    await clearThemeOverrides(token)
    setOverrideDraft({})
    setAdditionalCss('')
    setConfirmingReset(false)
    await load()
  }

  async function applySkin(skin: GallerySkin): Promise<void> {
    if (token === null) return
    await applyGallerySkin(token, skin.id)
    await load()
  }

  /**
   * Switches which theme *package* renders the public site (fiche L23) —
   * distinct from every other action on this screen, which only ever
   * changes colours within whichever theme is active. Read live off the
   * same overrides row `resolveStyles`/`renderEntryPage` already read on
   * every request, so this takes effect on the very next page view, no
   * restart — unlike L19's site-plan applier, which genuinely does need one.
   */
  async function switchTheme(name: string | null, applySkin = false): Promise<void> {
    if (token === null) return
    setSwitchingTheme(name ?? '')
    setSwitchThemeError(null)
    try {
      if (name === null) {
        await saveThemeOverrides(token, { activeTheme: null })
      } else {
        await activateTheme(token, name, applySkin)
      }
      setSelectingTheme(null)
      setEnlargedTheme(null)
      await load()
    } catch (caught) {
      setSwitchThemeError(
        caught instanceof ApiError ? caught.message : t('appearance.themeSwitchError'),
      )
    } finally {
      setSwitchingTheme(null)
    }
  }

  /**
   * "Supprimer" (fiche « supprimer un thème ») — real, irreversible removal
   * of a local theme (`themes/<name>/` and its whole archived version
   * history), never offered for a built-in (`candidate.local` gates the
   * button itself). If the deleted theme was `activeTheme`, the server
   * clears that override too — `load()` picks up the fallback the very same
   * way `switchTheme` already does for an ordinary switch.
   */
  async function confirmDeleteTheme(): Promise<void> {
    if (token === null || deletingTheme === null) return
    setDeleteThemeInProgress(true)
    setDeleteThemeError(null)
    try {
      await deleteTheme(token, deletingTheme.name)
      setDeletingTheme(null)
      await load()
    } catch (caught) {
      setDeleteThemeError(
        caught instanceof ApiError ? caught.message : t('appearance.themeDeleteError'),
      )
    } finally {
      setDeleteThemeInProgress(false)
    }
  }

  async function exportToFile(): Promise<void> {
    if (token === null) return
    await exportThemeToFile(token)
    await load()
  }

  function openSelection(candidate: AvailableTheme, focus: 'theme' | 'sample'): void {
    setSelectingFocus(focus)
    setSelectingTheme(candidate)
  }

  function goBackToGallery(): void {
    if (dirty) {
      setLeavingToGallery(true)
      return
    }
    setView('gallery')
  }

  function formatRatio(value: number): string {
    return value.toLocaleString(i18n.language, { maximumFractionDigits: 2, minimumFractionDigits: 2 })
  }

  const tokenLabel = (name: string): string =>
    t(`appearance.token.color.${name}`, { defaultValue: name })

  if (!isAdmin) {
    return (
      <section aria-labelledby="appearance-heading">
        <h1 id="appearance-heading">{t('appearance.heading')}</h1>
        <p role="alert">{t('appearance.adminOnly')}</p>
      </section>
    )
  }

  const activeTheme =
    (theme?.availableThemes ?? []).find(
      (candidate) =>
        theme?.overrides.activeTheme === candidate.name ||
        (theme?.overrides.activeTheme === null && candidate.name === '@cogenta/theme-canonical'),
    ) ?? null

  return (
    <section aria-labelledby="appearance-heading" className="flex flex-col gap-6">
      <div>
        <h1 id="appearance-heading" className="m-0 text-2xl leading-tight font-bold tracking-tight">
          {t('appearance.heading')}
        </h1>
        <p className="text-muted-foreground text-sm">{t('appearance.description')}</p>
        {/* Fiche 73 — a theme built by hand (or by an AI agent writing real
            code, not just tokens) lives in themes/, outside npm packages.
            Reachable from here regardless of `aiAvailable`: a local theme
            never needs a configured LLM provider (R2). */}
        <Link to="/theme-sandbox" className="text-sm text-primary underline">
          {t('appearance.themeSandboxLinkAction')}
        </Link>
      </div>

      {loadError !== null && (
        <Notice tone="danger" live="assertive">
          <p>{loadError}</p>
        </Notice>
      )}

      {theme !== null && (
        <>
          {view === 'gallery' &&
            (theme.aiAvailable ? (
              <Card aria-labelledby="appearance-ai-gallery-heading">
                <CardHeader>
                  <CardTitle>
                    <h2 id="appearance-ai-gallery-heading">{t('appearance.aiHeading')}</h2>
                  </CardTitle>
                  <CardDescription>{t('appearance.aiIntro')}</CardDescription>
                </CardHeader>
                <CardBody>
                  {/*
                   * The same entry the customize view's own AI card offers
                   * (see below) — surfaced here too, unconditionally of which
                   * theme is active, and above the gallery grid rather than
                   * below it, so the workshop is the first thing an admin
                   * sees on this screen, not something found by scrolling
                   * past every theme card.
                   */}
                  <Link to="/theme-generator" className={buttonVariants({ variant: 'primary' })}>
                    {t('appearance.aiOpenWorkshopAction')}
                  </Link>
                </CardBody>
              </Card>
            ) : (
              <Notice
                tone="info"
                actions={
                  <Link
                    to="/providers"
                    className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                  >
                    {t('appearance.aiNoProviderAction')}
                  </Link>
                }
              >
                <p>{t('appearance.aiNoProviderNotice')}</p>
              </Notice>
            ))}

          {view === 'gallery' && (
            <Card aria-labelledby="appearance-theme-heading">
              <CardHeader>
                <CardTitle>
                  <h2 id="appearance-theme-heading">{t('appearance.themeHeading')}</h2>
                </CardTitle>
              </CardHeader>
              <CardBody className="flex flex-col gap-3">
                <p className="m-0 text-sm text-muted-foreground">
                  {t('appearance.themeDescription')}
                </p>
                {switchThemeError !== null && (
                  <Notice tone="danger" live="assertive">
                    <p>{switchThemeError}</p>
                  </Notice>
                )}
                {deleteThemeError !== null && (
                  <Notice tone="danger" live="assertive">
                    <p>{deleteThemeError}</p>
                  </Notice>
                )}
                <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
                  {(theme.availableThemes ?? []).map((candidate) => {
                    const active =
                      theme.overrides.activeTheme === candidate.name ||
                      (theme.overrides.activeTheme === null &&
                        candidate.name === '@cogenta/theme-canonical')
                    // `version`/`author` (fiche 48) are read from the theme's
                    // own manifest and always present on a current server —
                    // still guarded here the same way `availableThemes`
                    // itself already tolerates an older server's response
                    // shape (the version-mismatch test right below this
                    // file's changes), rather than crashing the whole card.
                    const version = typeof candidate.version === 'string' ? candidate.version : null
                    const author =
                      typeof candidate.author === 'string' && candidate.author !== ''
                        ? candidate.author
                        : null
                    return (
                      <li
                        key={candidate.name}
                        className={`flex flex-col gap-2 rounded-md border p-3 ${
                          active ? 'border-primary bg-accent/40' : 'border-border'
                        }`}
                      >
                        {token !== null && (
                          <ThemeGalleryPreview
                            token={token}
                            themeName={candidate.name}
                            label={candidate.label}
                            onOpen={() => setEnlargedTheme(candidate)}
                          />
                        )}
                        <span className="flex items-center justify-between gap-2">
                          <strong className="text-sm text-foreground">{candidate.label}</strong>
                          {active && (
                            <span className="text-xs font-medium text-primary">
                              {t('appearance.themeActive')}
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {candidate.local
                            ? candidate.description
                            : shippedText(
                                `themes.${candidate.name.replace(/^@cogenta\//u, '')}.description`,
                                candidate.description,
                                t,
                              )}
                        </span>
                        {theme.sampleData?.themes.includes(candidate.name) === true && (
                          <span className="text-xs font-medium text-foreground">
                            {t('appearance.sampleData.cardBadge')}
                          </span>
                        )}
                        {(version !== null || author !== null) && (
                          <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                            {version !== null && (
                              <span>{t('appearance.themeVersionLabel', { version })}</span>
                            )}
                            {version !== null && author !== null && (
                              <span aria-hidden="true">·</span>
                            )}
                            {author !== null && (
                              <span>{t('appearance.themeAuthorLabel', { author })}</span>
                            )}
                          </span>
                        )}
                        {/* `mt-auto` pins the buttons to the card's bottom edge,
                            so they line up across a row whatever the text above. */}
                        <div className="mt-auto flex flex-wrap gap-2 pt-1">
                          {active ? (
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              onClick={() => setView('customize')}
                            >
                              {t('appearance.themePersonalizeAction')}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              disabled={switchingTheme !== null}
                              onClick={() => openSelection(candidate, 'theme')}
                            >
                              {switchingTheme === candidate.name
                                ? t('appearance.themeSwitching')
                                : t('appearance.themeSelectAction')}
                            </Button>
                          )}
                          {theme.sampleData?.themes.includes(candidate.name) === true && (
                            // Every theme that ships a demo site says so on its
                            // own card (L28) — including the active one, which
                            // cannot be "selected" again but can still import it.
                            // It opens straight on the sample-data choice: the
                            // switch-the-theme-only step is not what was asked.
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => openSelection(candidate, 'sample')}
                            >
                              {t('appearance.sampleData.activeAction')}
                            </Button>
                          )}
                          {active && theme.aiAvailable && (
                            // The "customize the current theme" entry into
                            // the AI workshop (as opposed to the plain
                            // "generate new" card inside the customize view
                            // below) — presets `?baseline=` to this theme's
                            // own name, so the workshop opens already in
                            // "adjust what's running" mode rather than
                            // "start over".
                            <Link
                              to={`/theme-generator?baseline=${encodeURIComponent(candidate.name)}`}
                              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                            >
                              {t('appearance.themePersonalizeAiAction')}
                            </Link>
                          )}
                          {candidate.local && (
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => setDeletingTheme(candidate)}
                            >
                              {t('appearance.themeDeleteAction')}
                            </Button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </CardBody>
            </Card>
          )}

          {view === 'customize' && (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Button type="button" variant="ghost" onClick={goBackToGallery}>
                  {t('appearance.customizeBackAction')}
                </Button>
                <h2 className="m-0 text-lg leading-6 font-semibold text-foreground">
                  {activeTheme === null
                    ? t('appearance.customizeHeading')
                    : t('appearance.customizeHeadingTheme', { theme: activeTheme.label })}
                </h2>
              </div>

              <Notice tone={tokensDirty ? 'warning' : 'info'}>
                <p>
                  {tokensDirty
                    ? t('appearance.provenanceUnsaved')
                    : hasSavedOverrides
                      ? t('appearance.provenanceOverridden')
                      : t('appearance.provenanceFileOnly')}
                </p>
              </Notice>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
                <div className="flex min-w-0 flex-col gap-4">
                  <Card aria-labelledby="appearance-palettes-heading">
                    <CardHeader>
                      <CardTitle>
                        <h2 id="appearance-palettes-heading">{t('appearance.palettesHeading')}</h2>
                      </CardTitle>
                      <CardDescription>{t('appearance.palettesIntro')}</CardDescription>
                    </CardHeader>
                    <CardBody>
                      <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                        {PALETTE_PRESETS.map((palette) => {
                          const current = paletteMatches(palette, effectiveTokens)
                          const label = t(`appearance.palette.${palette.id}`)
                          return (
                            <li key={palette.id}>
                              <button
                                type="button"
                                onClick={() => applyPalette(palette)}
                                aria-pressed={current}
                                aria-label={t('appearance.paletteApply', { name: label })}
                                className={`flex w-full cursor-pointer flex-col gap-1.5 rounded-md border bg-card p-2 text-left font-sans text-xs text-card-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                                  current ? 'border-primary ring-1 ring-primary' : 'border-border'
                                }`}
                              >
                                <Swatches
                                  colors={[
                                    palette.colors.bg,
                                    palette.colors.fg,
                                    palette.colors.accent,
                                    palette.colors.muted,
                                  ]}
                                />
                                <span className="font-medium">{label}</span>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </CardBody>
                  </Card>

                  {TOKEN_GROUPS.map((group) => (
                    <div key={group} className="contents">
                      <Card aria-labelledby={`appearance-group-${group}`}>
                        <CardHeader>
                          <CardTitle>
                            <h2 id={`appearance-group-${group}`}>
                              {t(`appearance.group.${group}`)}
                            </h2>
                          </CardTitle>
                        </CardHeader>
                        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          {TOKEN_SPECS.filter((spec) => spec.group === group).map((spec) => (
                            <TokenField
                              key={`${spec.group}.${spec.name}`}
                              spec={spec}
                              value={valueAt(effectiveTokens, spec.group, spec.name)}
                              onChange={(value) => setToken(spec.group, spec.name, value)}
                            />
                          ))}
                        </CardBody>
                      </Card>

                      {/* Right under the colours it is about, not at the foot of a
                          page this long: nobody who has just picked a yellow accent
                          scrolls down to learn it cannot be read. */}
                      {group === 'color' && contrastWarnings.length > 0 && (
                        <Notice tone="warning" live="polite">
                          <p className="m-0 font-medium">{t('appearance.contrastWarningHeading')}</p>
                          <ul className="m-0 mt-1 list-disc pl-5">
                            {contrastWarnings.map((warning) => (
                              <li key={`${warning.foreground}-${warning.background}`}>
                                {t('appearance.contrastWarningLine', {
                                  foreground: tokenLabel(warning.foreground),
                                  background: tokenLabel(warning.background),
                                  ratio: formatRatio(warning.ratio),
                                  required: warning.required.toLocaleString(i18n.language),
                                })}
                              </li>
                            ))}
                          </ul>
                          <p className="m-0 mt-2">{t('appearance.contrastWarningAdvice')}</p>
                        </Notice>
                      )}
                    </div>
                  ))}

                  <Card aria-labelledby="appearance-css-heading">
                    <CardHeader>
                      <CardTitle>
                        <h2 id="appearance-css-heading">{t('appearance.additionalCssHeading')}</h2>
                      </CardTitle>
                    </CardHeader>
                    <CardBody className="flex flex-col gap-2">
                      <Field label={t('appearance.additionalCssLabel')}>
                        {(control) => (
                          <textarea
                            {...control}
                            rows={6}
                            className="w-full appearance-none rounded-md border border-input bg-card px-3 py-2 font-mono text-sm text-card-foreground shadow-card"
                            value={additionalCss}
                            onChange={(event) => {
                              setAdditionalCss(event.target.value)
                              savedIndicator.hide()
                            }}
                          />
                        )}
                      </Field>
                      <p className="m-0 text-xs text-muted-foreground">
                        {t('appearance.additionalCssNote')}
                      </p>
                    </CardBody>
                  </Card>

                  <Card aria-labelledby="appearance-identity-heading">
                    <CardHeader>
                      <CardTitle>
                        <h2 id="appearance-identity-heading">{t('appearance.identityHeading')}</h2>
                      </CardTitle>
                    </CardHeader>
                    <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {(
                        [
                          ['appearance-logo', 'logoMediaId', 'appearance.logoLabel'],
                          ['appearance-logo-dark', 'logoDarkMediaId', 'appearance.logoDarkLabel'],
                          ['appearance-favicon', 'faviconMediaId', 'appearance.faviconLabel'],
                          [
                            'appearance-share-image',
                            'shareImageMediaId',
                            'appearance.shareImageLabel',
                          ],
                        ] as const
                      ).map(([id, field, labelKey]) => (
                        <div key={id} className="flex flex-col gap-1.5">
                          <Label htmlFor={id}>{t(labelKey)}</Label>
                          <MediaPicker
                            id={id}
                            token={token ?? ''}
                            accept={['image']}
                            many={false}
                            value={identityValue(field) === null ? [] : [identityValue(field) as string]}
                            onChange={(ids) => void handleIdentityChange(field, ids[0] ?? null)}
                          />
                        </div>
                      ))}
                    </CardBody>
                    <CardFooter>
                      <SavedIndicator
                        visible={identityIndicator.visible}
                        label={t('appearance.saved')}
                      />
                    </CardFooter>
                  </Card>

                  <BrandingCard
                    token={token ?? ''}
                    autosaveEnabled={autosaveEnabled}
                    onPendingChange={setBrandingPending}
                    registerFlush={registerBrandingFlush}
                  />

                  {theme.skins.length > 0 && (
                    <Card aria-labelledby="appearance-gallery-heading">
                      <CardHeader>
                        <CardTitle>
                          <h2 id="appearance-gallery-heading">{t('appearance.galleryHeading')}</h2>
                        </CardTitle>
                        <CardDescription>{t('appearance.galleryIntro')}</CardDescription>
                      </CardHeader>
                      <CardBody className="flex flex-col gap-2">
                        <ul className="m-0 flex flex-col gap-2 p-0">
                          {theme.skins.map((skin) => (
                            <li
                              key={skin.id}
                              className="flex items-center justify-between gap-2 rounded-md border border-border p-2"
                            >
                              <span className="flex items-center gap-2">
                                {skin.tokens !== null && (
                                  <span
                                    aria-hidden="true"
                                    className="size-8 shrink-0 rounded border border-input"
                                    style={{
                                      background: String(
                                        (
                                          skin.tokens['color'] as
                                            | Record<string, unknown>
                                            | undefined
                                        )?.['accent'] ?? 'transparent',
                                      ),
                                    }}
                                  />
                                )}
                                {skin.displayName}
                              </span>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => void applySkin(skin)}
                              >
                                {t('appearance.applyAction')}
                              </Button>
                            </li>
                          ))}
                        </ul>
                      </CardBody>
                    </Card>
                  )}

                  {theme.aiAvailable ? (
                    <Card aria-labelledby="appearance-ai-heading">
                      <CardHeader>
                        <CardTitle>
                          <h2 id="appearance-ai-heading">{t('appearance.aiHeading')}</h2>
                        </CardTitle>
                        <CardDescription>{t('appearance.aiIntro')}</CardDescription>
                      </CardHeader>
                      <CardBody>
                        {/*
                         * The full workshop (describe, attach files, preview
                         * several candidates, activate one) lives on its own
                         * page — `theme-generator.tsx` — rather than crammed
                         * into this card. This button always opens it in
                         * "generate new" mode; the gallery card's own
                         * "Personnaliser ce thème avec l'IA" button above is
                         * the "adjust what's running" entry.
                         */}
                        <Link
                          to="/theme-generator"
                          className={buttonVariants({ variant: 'secondary' })}
                        >
                          {t('appearance.aiOpenWorkshopAction')}
                        </Link>
                      </CardBody>
                    </Card>
                  ) : (
                    <Notice
                      tone="info"
                      actions={
                        <Link
                          to="/providers"
                          className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                        >
                          {t('appearance.aiNoProviderAction')}
                        </Link>
                      }
                    >
                      <p>{t('appearance.aiNoProviderNotice')}</p>
                    </Notice>
                  )}
                </div>

                {/* Stays on screen while the left column scrolls: the point of a
                    live preview is to see the effect of the field being edited,
                    and the fields are a long way from the top. On a phone there
                    is no room for two columns, so the same frame opens from the
                    bar below instead. */}
                <aside
                  aria-labelledby="appearance-preview-heading"
                  className="sticky top-20 hidden h-[calc(100dvh-11rem)] min-h-96 flex-col gap-2 lg:flex"
                >
                  <h2
                    id="appearance-preview-heading"
                    className="m-0 text-sm font-semibold text-foreground"
                  >
                    {t('appearance.previewHeading')}
                  </h2>
                  {contrastWarnings.length > 0 && (
                    <p className="m-0 text-xs text-muted-foreground">
                      {t('appearance.previewCorrectedNote')}
                    </p>
                  )}
                  <AppearancePreviewFrame html={previewHtml} error={previewError} />
                </aside>
              </div>

              {/* The one save bar of the screen. Sticky, so it is never a
                  scroll away from what was just edited. */}
              <div className="sticky bottom-0 z-20 -mx-1 flex flex-wrap items-center gap-2 border-t border-border bg-background/95 px-1 py-3 backdrop-blur">
                <Button
                  type="button"
                  onClick={() => void saveAll()}
                  loading={saving}
                  disabled={saving || !dirty || contrastWarnings.length > 0}
                >
                  {saving ? t('appearance.saving') : t('appearance.saveAction')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!hasSavedOverrides}
                  onClick={() => setConfirmingReset(true)}
                >
                  {t('appearance.resetAction')}
                </Button>
                {theme.exportAvailable && (
                  <Button type="button" variant="secondary" onClick={() => void exportToFile()}>
                    {t('appearance.exportAction')}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  className="lg:hidden"
                  onClick={() => setPreviewOpen(true)}
                >
                  {t('appearance.previewOpenAction')}
                </Button>
                {dirty && !saving && (
                  <span role="status" className="text-sm text-muted-foreground">
                    {contrastWarnings.length > 0
                      ? t('appearance.saveBlockedByContrast')
                      : t('appearance.unsavedChanges')}
                  </span>
                )}
                <SavedIndicator visible={savedIndicator.visible} label={t('appearance.saved')} />
              </div>
              {saveError !== null && (
                <Notice tone="danger" live="assertive">
                  <p>{saveError}</p>
                </Notice>
              )}
            </>
          )}
        </>
      )}

      {token !== null && (
        <ThemeApplyDialog
          token={token}
          theme={selectingTheme}
          focus={selectingFocus}
          hasSampleData={
            selectingTheme !== null &&
            (theme?.sampleData?.themes.includes(selectingTheme.name) ?? false)
          }
          sampleDataWritable={theme?.sampleData?.writable ?? false}
          active={selectingTheme !== null && theme?.overrides.activeTheme === selectingTheme.name}
          switching={switchingTheme !== null}
          switchError={switchThemeError}
          onApplyThemeOnly={(applySkin) =>
            selectingTheme !== null && void switchTheme(selectingTheme.name, applySkin)
          }
          onClose={() => {
            setSelectingTheme(null)
            setSwitchThemeError(null)
          }}
          onSampleDataApplied={load}
        />
      )}

      <Modal
        open={enlargedTheme !== null}
        onOpenChange={(open) => {
          if (!open) setEnlargedTheme(null)
        }}
        title={t('appearance.themePreviewTitle', { theme: enlargedTheme?.label ?? '' })}
        description={t('appearance.themePreviewLargeHint')}
        closeLabel={t('appearance.close')}
        className="w-[min(64rem,calc(100vw-2rem))]"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setEnlargedTheme(null)}>
              {t('appearance.close')}
            </Button>
            {enlargedTheme !== null &&
              theme?.overrides.activeTheme !== enlargedTheme.name &&
              !(
                theme?.overrides.activeTheme === null &&
                enlargedTheme.name === '@cogenta/theme-canonical'
              ) && (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    const chosen = enlargedTheme
                    setEnlargedTheme(null)
                    openSelection(chosen, 'theme')
                  }}
                >
                  {t('appearance.themeSelectAction')}
                </Button>
              )}
          </>
        }
      >
        {enlargedTheme !== null && token !== null && (
          <ThemeGalleryPreview
            token={token}
            themeName={enlargedTheme.name}
            label={enlargedTheme.label}
            size="large"
          />
        )}
      </Modal>

      <Modal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={t('appearance.previewHeading')}
        closeLabel={t('appearance.close')}
        className="w-[calc(100vw-1rem)]"
      >
        <div className="flex h-[70dvh] flex-col">
          <AppearancePreviewFrame html={previewHtml} error={previewError} />
        </div>
      </Modal>

      <Modal
        open={confirmingReset}
        onOpenChange={setConfirmingReset}
        title={t('appearance.resetConfirmTitle')}
        closeLabel={t('appearance.close')}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setConfirmingReset(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" variant="destructive" onClick={() => void reset()}>
              {t('appearance.resetConfirmAction')}
            </Button>
          </>
        }
      >
        <p>{t('appearance.resetConfirmBody')}</p>
      </Modal>

      <Modal
        open={blocker.blocked || leavingToGallery}
        onOpenChange={(open) => {
          if (!open) {
            blocker.reset()
            setLeavingToGallery(false)
          }
        }}
        title={t('appearance.leaveTitle')}
        closeLabel={t('common.cancel')}
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                blocker.reset()
                setLeavingToGallery(false)
              }}
            >
              {t('appearance.leaveStay')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (leavingToGallery) {
                  setOverrideDraft(savedOverlay ?? {})
                  setAdditionalCss(savedCss)
                  setIdentityDraft({})
                  setLeavingToGallery(false)
                  setView('gallery')
                } else {
                  blocker.proceed()
                }
              }}
            >
              {t('appearance.leaveDiscard')}
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={contrastWarnings.length > 0}
              onClick={() => {
                void saveAll().then((ok) => {
                  if (!ok) return
                  if (leavingToGallery) {
                    setLeavingToGallery(false)
                    setView('gallery')
                  } else {
                    blocker.proceed()
                  }
                })
              }}
            >
              {t('appearance.leaveSave')}
            </Button>
          </>
        }
      >
        <p>
          {contrastWarnings.length > 0
            ? t('appearance.leaveBodyContrast')
            : t('appearance.leaveBody')}
        </p>
      </Modal>

      <Modal
        open={deletingTheme !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingTheme(null)
            setDeleteThemeError(null)
          }
        }}
        title={t('appearance.themeDeleteConfirmTitle', { name: deletingTheme?.label ?? '' })}
        closeLabel={t('appearance.close')}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDeletingTheme(null)}
              disabled={deleteThemeInProgress}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmDeleteTheme()}
              disabled={deleteThemeInProgress}
            >
              {deleteThemeInProgress
                ? t('appearance.themeDeleting')
                : t('appearance.themeDeleteConfirmButton')}
            </Button>
          </>
        }
      >
        <Notice tone="danger" live="off">
          <p>{t('appearance.themeDeleteWarning')}</p>
        </Notice>
        {deletingTheme !== null && theme?.overrides.activeTheme === deletingTheme.name && (
          <Notice tone="warning" live="off">
            <p>{t('appearance.themeDeleteWarningActive')}</p>
          </Notice>
        )}
      </Modal>
    </section>
  )
}
