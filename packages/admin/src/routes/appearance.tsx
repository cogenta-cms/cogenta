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
import { ApiError } from '../api/client.js'
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
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Label,
  Notice,
  Select,
} from '../ui/index.js'

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

  const [theme, setTheme] = useState<ThemeState | null>(null)
  const [overrideDraft, setOverrideDraft] = useState<TokenOverrides>({})
  const [additionalCss, setAdditionalCss] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [candidates, setCandidates] = useState<readonly SkinCandidate[] | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

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
    setSaved(false)
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
      setSaved(true)
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
    setSaved(false)
  }

  async function exportToFile(): Promise<void> {
    if (token === null) return
    await exportThemeToFile(token)
    await load()
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
        <h1 id="appearance-heading" className="m-0 text-xl leading-7 font-semibold">
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
                          setSaved(false)
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
                        theme.overrides.logoMediaId === null ? [] : [theme.overrides.logoMediaId]
                      }
                      onChange={(ids) =>
                        void (
                          token !== null &&
                          saveThemeOverrides(token, { logoMediaId: ids[0] ?? null }).then(load)
                        )
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="appearance-logo-dark">{t('appearance.logoDarkLabel')}</Label>
                    <MediaPicker
                      id="appearance-logo-dark"
                      token={token ?? ''}
                      accept={['image']}
                      many={false}
                      value={
                        theme.overrides.logoDarkMediaId === null
                          ? []
                          : [theme.overrides.logoDarkMediaId]
                      }
                      onChange={(ids) =>
                        void (
                          token !== null &&
                          saveThemeOverrides(token, { logoDarkMediaId: ids[0] ?? null }).then(load)
                        )
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
                        theme.overrides.faviconMediaId === null
                          ? []
                          : [theme.overrides.faviconMediaId]
                      }
                      onChange={(ids) =>
                        void (
                          token !== null &&
                          saveThemeOverrides(token, { faviconMediaId: ids[0] ?? null }).then(load)
                        )
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
                        theme.overrides.shareImageMediaId === null
                          ? []
                          : [theme.overrides.shareImageMediaId]
                      }
                      onChange={(ids) =>
                        void (
                          token !== null &&
                          saveThemeOverrides(token, { shareImageMediaId: ids[0] ?? null }).then(
                            load,
                          )
                        )
                      }
                    />
                  </div>
                </CardBody>
              </Card>

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
                                    (skin.tokens['color'] as Record<string, unknown> | undefined)?.[
                                      'accent'
                                    ] ?? 'transparent',
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
                      {generating ? t('appearance.aiGenerating') : t('appearance.aiGenerateAction')}
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
                {saved && (
                  <span className="text-sm text-muted-foreground">{t('appearance.saved')}</span>
                )}
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
    </section>
  )
}
