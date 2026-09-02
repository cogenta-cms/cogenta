import {
  aaThreshold,
  CONTRAST_PAIRS,
  compositeOver,
  contrastRatio,
  DENSITIES,
  meetsContrastAa,
  parseColor,
  TOKEN_GROUPS,
  TOKEN_SPECS,
  type TokenSpec,
} from '@cogenta/render'
import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { ApiError } from '../api/client.js'
import { listSettings, type SiteSetting, writeSetting } from '../api/settings-client.js'
import {
  applyGallerySkin,
  clearThemeOverrides,
  exportThemeToFile,
  type GallerySkin,
  generateSkinCandidates,
  getTheme,
  previewTheme,
  type SkinCandidate,
  saveThemeOverrides,
  type ThemeState,
} from '../api/theme-client.js'
import { useAuth } from '../auth/auth-context.js'
import { MediaPicker } from '../fields/media-picker.js'
import { useAutosaveEnabled } from '../lib/autosave-prefs.js'
import { SiteSettingsField } from '../settings/site-settings-field.js'
import { useSectionAutosave } from '../settings/site-settings-section.js'
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Label,
  Notice,
  SavedIndicator,
  Select,
  useSavedIndicator,
} from '../ui/index.js'
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
 */
function BrandingCard({
  token,
  autosaveEnabled,
}: {
  readonly token: string
  readonly autosaveEnabled: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<readonly SiteSetting[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const indicator = useSavedIndicator()

  const load = useCallback(async () => {
    try {
      const data = await listSettings()
      setSettings(data.filter((setting) => setting.group === 'branding'))
      setLoadError(null)
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : t('appearance.brandingLoadError'))
    }
  }, [t])

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
        <Button
          type="button"
          size="sm"
          variant="secondary"
          loading={section.saving}
          disabled={!section.hasPending}
          onClick={() => void section.flush()}
        >
          {t('appearance.brandingSaveAction')}
        </Button>
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

function TokenField({
  spec,
  value,
  onChange,
}: {
  readonly spec: TokenSpec
  readonly value: unknown
  onChange(value: unknown): void
}): JSX.Element {
  const { t } = useTranslation()
  const label = t(`appearance.token.${spec.group}.${spec.name}`, {
    defaultValue: `${spec.group}.${spec.name}`,
  })

  if (spec.kind === 'boolean') {
    return (
      <label className="flex items-center gap-2 font-sans text-sm text-foreground">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        {label}
      </label>
    )
  }

  if (spec.kind === 'density') {
    return (
      <Field label={label}>
        {(control) => (
          <Select
            {...control}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
          >
            {DENSITIES.map((density) => (
              <option key={density} value={density}>
                {density}
              </option>
            ))}
          </Select>
        )}
      </Field>
    )
  }

  if (spec.kind === 'ratio') {
    return (
      <Field label={label}>
        {(control) => (
          <Input
            {...control}
            type="number"
            step="0.01"
            min="1.01"
            value={typeof value === 'number' ? value : ''}
            onChange={(event) => onChange(Number(event.target.value))}
          />
        )}
      </Field>
    )
  }

  if (spec.kind === 'color') {
    return (
      <Field label={label}>
        {(control) => (
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-6 shrink-0 rounded border border-input"
              style={{ background: typeof value === 'string' ? value : 'transparent' }}
            />
            <Input
              {...control}
              type="text"
              value={typeof value === 'string' ? value : ''}
              onChange={(event) => onChange(event.target.value)}
            />
          </div>
        )}
      </Field>
    )
  }

  // length | duration | text
  return (
    <Field label={label}>
      {(control) => (
        <Input
          {...control}
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  )
}

export function AppearanceRoute(): JSX.Element {
  const { t } = useTranslation()
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
  const [description, setDescription] = useState('')
  const [candidates, setCandidates] = useState<readonly SkinCandidate[] | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [switchingTheme, setSwitchingTheme] = useState<string | null>(null)
  const [switchThemeError, setSwitchThemeError] = useState<string | null>(null)

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

  function setToken(group: string, name: string, value: unknown): void {
    setOverrideDraft((previous) => ({
      ...previous,
      [group]: { ...previous[group], [name]: value },
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
          setPreviewError(
            caught instanceof ApiError ? caught.message : t('appearance.previewError'),
          )
        })
    }, PREVIEW_DEBOUNCE_MS)
    return () => {
      abandoned = true
      clearTimeout(timer)
    }
  }, [token, theme, overrideDraft, additionalCss, t])

  async function save(): Promise<void> {
    if (token === null) return
    setSaving(true)
    setSaveError(null)
    try {
      await saveThemeOverrides(token, {
        tokenOverrides: Object.keys(overrideDraft).length === 0 ? null : overrideDraft,
        additionalCss: additionalCss === '' ? null : additionalCss,
      })
      savedIndicator.show()
      await load()
    } catch (caught) {
      setSaveError(caught instanceof ApiError ? caught.message : t('appearance.saveError'))
    } finally {
      setSaving(false)
    }
  }

  async function reset(): Promise<void> {
    if (token === null) return
    await clearThemeOverrides(token)
    setOverrideDraft({})
    setAdditionalCss('')
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
  async function switchTheme(name: string | null): Promise<void> {
    if (token === null) return
    setSwitchingTheme(name ?? '')
    setSwitchThemeError(null)
    try {
      await saveThemeOverrides(token, { activeTheme: name })
      await load()
    } catch (caught) {
      setSwitchThemeError(
        caught instanceof ApiError ? caught.message : t('appearance.themeSwitchError'),
      )
    } finally {
      setSwitchingTheme(null)
    }
  }

  async function generate(): Promise<void> {
    if (token === null || description.trim() === '') return
    setGenerating(true)
    setGenerateError(null)
    try {
      const result = await generateSkinCandidates(token, description)
      setCandidates(result.candidates)
    } catch (caught) {
      setGenerateError(caught instanceof ApiError ? caught.message : t('appearance.generateError'))
    } finally {
      setGenerating(false)
    }
  }

  function applyCandidate(candidate: SkinCandidate): void {
    // R6: nothing is applied automatically. Choosing a candidate loads it
    // into the draft the "Save" button above still has to be pressed for.
    setOverrideDraft(candidate.tokens as TokenOverrides)
    setCandidates(null)
    savedIndicator.hide()
  }

  async function exportToFile(): Promise<void> {
    if (token === null) return
    await exportThemeToFile(token)
    await load()
  }

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
  const [identitySaving, setIdentitySaving] = useState(false)
  const [identityError, setIdentityError] = useState<string | null>(null)

  type IdentityField = 'logoMediaId' | 'logoDarkMediaId' | 'faviconMediaId' | 'shareImageMediaId'

  function identityValue(field: IdentityField): string | null {
    if (field in identityDraft) return identityDraft[field] ?? null
    return theme?.overrides[field] ?? null
  }

  async function handleIdentityChange(field: IdentityField, value: string | null): Promise<void> {
    if (!autosaveEnabled) {
      setIdentityDraft((previous) => ({ ...previous, [field]: value }))
      return
    }
    if (token === null) return
    await saveThemeOverrides(token, { [field]: value })
    await load()
    identityIndicator.show()
  }

  async function flushIdentity(): Promise<void> {
    if (token === null || Object.keys(identityDraft).length === 0) return
    setIdentitySaving(true)
    setIdentityError(null)
    try {
      await saveThemeOverrides(token, identityDraft)
      setIdentityDraft({})
      await load()
      identityIndicator.show()
    } catch (caught) {
      setIdentityError(caught instanceof ApiError ? caught.message : t('appearance.saveError'))
    } finally {
      setIdentitySaving(false)
    }
  }

  const iframe = useRef<HTMLIFrameElement | null>(null)

  if (!isAdmin) {
    return (
      <section aria-labelledby="appearance-heading">
        <h1 id="appearance-heading">{t('appearance.heading')}</h1>
        <p role="alert">{t('appearance.adminOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="appearance-heading" className="flex flex-col gap-6">
      <div>
        <h1 id="appearance-heading" className="m-0 text-2xl leading-tight font-bold tracking-tight">
          {t('appearance.heading')}
        </h1>
        <p className="text-muted-foreground text-sm">{t('appearance.description')}</p>
      </div>

      {loadError !== null && (
        <Notice tone="danger" live="assertive">
          <p>{loadError}</p>
        </Notice>
      )}

      {theme !== null && (
        <>
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
                          {candidate.description}
                        </span>
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
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant={active ? 'secondary' : 'primary'}
                            size="sm"
                            disabled={active || switchingTheme !== null}
                            onClick={() => void switchTheme(candidate.name)}
                          >
                            {switchingTheme === candidate.name
                              ? t('appearance.themeSwitching')
                              : t('appearance.themeSelectAction')}
                          </Button>
                          {active && (
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              onClick={() => setView('customize')}
                            >
                              {t('appearance.themePersonalizeAction')}
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="ghost" onClick={() => setView('gallery')}>
                  {t('appearance.customizeBackAction')}
                </Button>
                <h2 className="m-0 text-lg leading-6 font-semibold text-foreground">
                  {t('appearance.customizeHeading')}
                </h2>
              </div>

              <Notice tone="info">
                <p>
                  {Object.keys(overrideDraft).length === 0 && additionalCss === ''
                    ? t('appearance.provenanceFileOnly')
                    : t('appearance.provenanceOverridden')}
                </p>
              </Notice>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="flex flex-col gap-4">
                  {TOKEN_GROUPS.map((group) => (
                    <Card key={group} aria-labelledby={`appearance-group-${group}`}>
                      <CardHeader>
                        <CardTitle>
                          <h2 id={`appearance-group-${group}`}>{t(`appearance.group.${group}`)}</h2>
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
                  ))}

                  {contrastWarnings.length > 0 && (
                    <Notice tone="warning" live="polite">
                      <p className="m-0 font-medium">{t('appearance.contrastWarningHeading')}</p>
                      <ul className="m-0 mt-1 list-disc pl-5">
                        {contrastWarnings.map((warning) => (
                          <li key={`${warning.foreground}-${warning.background}`}>
                            {t('appearance.contrastWarningLine', {
                              foreground: warning.foreground,
                              background: warning.background,
                              ratio: warning.ratio.toFixed(2),
                              required: warning.required.toFixed(1),
                            })}
                          </li>
                        ))}
                      </ul>
                    </Notice>
                  )}

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
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="appearance-logo">{t('appearance.logoLabel')}</Label>
                        <MediaPicker
                          id="appearance-logo"
                          token={token ?? ''}
                          accept={['image']}
                          many={false}
                          value={
                            identityValue('logoMediaId') === null
                              ? []
                              : [identityValue('logoMediaId') as string]
                          }
                          onChange={(ids) =>
                            void handleIdentityChange('logoMediaId', ids[0] ?? null)
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="appearance-logo-dark">
                          {t('appearance.logoDarkLabel')}
                        </Label>
                        <MediaPicker
                          id="appearance-logo-dark"
                          token={token ?? ''}
                          accept={['image']}
                          many={false}
                          value={
                            identityValue('logoDarkMediaId') === null
                              ? []
                              : [identityValue('logoDarkMediaId') as string]
                          }
                          onChange={(ids) =>
                            void handleIdentityChange('logoDarkMediaId', ids[0] ?? null)
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="appearance-favicon">{t('appearance.faviconLabel')}</Label>
                        <MediaPicker
                          id="appearance-favicon"
                          token={token ?? ''}
                          accept={['image']}
                          many={false}
                          value={
                            identityValue('faviconMediaId') === null
                              ? []
                              : [identityValue('faviconMediaId') as string]
                          }
                          onChange={(ids) =>
                            void handleIdentityChange('faviconMediaId', ids[0] ?? null)
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="appearance-share-image">
                          {t('appearance.shareImageLabel')}
                        </Label>
                        <MediaPicker
                          id="appearance-share-image"
                          token={token ?? ''}
                          accept={['image']}
                          many={false}
                          value={
                            identityValue('shareImageMediaId') === null
                              ? []
                              : [identityValue('shareImageMediaId') as string]
                          }
                          onChange={(ids) =>
                            void handleIdentityChange('shareImageMediaId', ids[0] ?? null)
                          }
                        />
                      </div>
                    </CardBody>
                    <CardFooter>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        loading={identitySaving}
                        disabled={Object.keys(identityDraft).length === 0}
                        onClick={() => void flushIdentity()}
                      >
                        {t('appearance.identitySaveAction')}
                      </Button>
                      <SavedIndicator
                        visible={identityIndicator.visible}
                        label={t('appearance.saved')}
                      />
                    </CardFooter>
                    {identityError !== null && (
                      <div className="px-5 pb-4">
                        <Notice tone="danger" live="assertive">
                          <p>{identityError}</p>
                        </Notice>
                      </div>
                    )}
                  </Card>

                  <BrandingCard token={token ?? ''} autosaveEnabled={autosaveEnabled} />

                  <Card aria-labelledby="appearance-gallery-heading">
                    <CardHeader>
                      <CardTitle>
                        <h2 id="appearance-gallery-heading">{t('appearance.galleryHeading')}</h2>
                      </CardTitle>
                    </CardHeader>
                    <CardBody className="flex flex-col gap-2">
                      {theme.skins.length === 0 ? (
                        <p className="m-0 text-sm text-muted-foreground">
                          {t('appearance.galleryEmpty')}
                        </p>
                      ) : (
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
                      )}
                    </CardBody>
                  </Card>

                  {theme.aiAvailable && (
                    <Card aria-labelledby="appearance-ai-heading">
                      <CardHeader>
                        <CardTitle>
                          <h2 id="appearance-ai-heading">{t('appearance.aiHeading')}</h2>
                        </CardTitle>
                      </CardHeader>
                      <CardBody className="flex flex-col gap-2">
                        <Field label={t('appearance.aiDescriptionLabel')}>
                          {(control) => (
                            <Input
                              {...control}
                              type="text"
                              value={description}
                              onChange={(event) => setDescription(event.target.value)}
                              placeholder={t('appearance.aiDescriptionPlaceholder')}
                            />
                          )}
                        </Field>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={generating || description.trim() === ''}
                          onClick={() => void generate()}
                        >
                          {generating
                            ? t('appearance.aiGenerating')
                            : t('appearance.aiGenerateAction')}
                        </Button>
                        {generateError !== null && (
                          <Notice tone="danger" live="assertive">
                            <p>{generateError}</p>
                          </Notice>
                        )}
                        {candidates !== null && (
                          <ul className="m-0 flex flex-col gap-2 p-0">
                            {candidates.map((candidate) => (
                              <li
                                key={candidate.id}
                                className="flex items-center justify-between gap-2 rounded-md border border-border p-2"
                              >
                                <span>
                                  <strong>{candidate.label}</strong>
                                  <br />
                                  <span className="text-xs text-muted-foreground">
                                    {candidate.rationale}
                                  </span>
                                </span>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => applyCandidate(candidate)}
                                >
                                  {t('appearance.chooseAction')}
                                </Button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </CardBody>
                    </Card>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" onClick={() => void save()} disabled={saving}>
                      {saving ? t('appearance.saving') : t('appearance.saveAction')}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => void reset()}>
                      {t('appearance.resetAction')}
                    </Button>
                    {theme.exportAvailable && (
                      <Button type="button" variant="secondary" onClick={() => void exportToFile()}>
                        {t('appearance.exportAction')}
                      </Button>
                    )}
                    <SavedIndicator
                      visible={savedIndicator.visible}
                      label={t('appearance.saved')}
                    />
                  </div>
                  {saveError !== null && (
                    <Notice tone="danger" live="assertive">
                      <p>{saveError}</p>
                    </Notice>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <h2 className="m-0 text-sm font-semibold text-foreground">
                    {t('appearance.previewHeading')}
                  </h2>
                  {previewError !== null && (
                    <Notice tone="danger" live="assertive">
                      <p>{previewError}</p>
                    </Notice>
                  )}
                  <div className="overflow-hidden rounded-lg border border-border bg-muted">
                    <iframe
                      ref={iframe}
                      title={t('appearance.previewHeading')}
                      srcDoc={previewHtml ?? ''}
                      className="h-[70vh] w-full border-0 bg-white"
                    />
                    {previewHtml === null && (
                      <p className="sr-only">{t('appearance.previewLoading')}</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
