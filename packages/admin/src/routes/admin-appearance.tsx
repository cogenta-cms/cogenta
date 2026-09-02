import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import {
  ADMIN_THEME_FONTS,
  type AdminThemeOverrides,
  setAdminTheme,
} from '../api/admin-theme-client.js'
import { ApiError } from '../api/client.js'
import { useAuth } from '../auth/auth-context.js'
import { MediaPicker } from '../fields/media-picker.js'
import { useAdminTheme } from '../theme/admin-theme-context.js'
import { AdminThemePreview } from '../theme/admin-theme-preview.js'
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
 * "Apparence de l'admin" (L21 task 2, restructured fiche 49) — the runtime
 * template + personalisation screen for the admin's *own* interface.
 *
 * Deliberately not the same screen as `AppearanceRoute` (`/appearance`,
 * fiche 14): that page themes the public site an install serves to its
 * visitors, through contract D's token vocabulary and `theme.tokens.json`.
 * This one themes the tool the editorial team is looking at right now,
 * through `AdminThemeProvider`'s own, much smaller vocabulary — two
 * built-in templates and a handful of personalisation levers, never merged
 * with the site's own gallery.
 *
 * Fiche 49 split what used to be one screen mixing a gallery and a
 * personalisation form into two views (`'gallery' | 'customize'`), the same
 * gesture as fiche 48 task 5 for the site's own "Apparence": a gallery card
 * now shows a real preview (`AdminThemePreview`, task 2) instead of four flat
 * colour swatches, and the personalisation view feeds the very same
 * component with the pending, not-yet-saved form state so an edit is visible
 * before Save (task 3) — never by touching `<head>`, only the scoped preview
 * panel.
 */

type View = 'gallery' | 'customize'

export function AdminAppearanceRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const { state, refresh } = useAdminTheme()

  // Fiche 71: derived from `?view=`, the same pattern `seo.tsx` proved for
  // its own tabs — previously a plain `useState`, so an F5 or a shared link
  // always landed back on the gallery, never on whichever view was open.
  const [searchParams, setSearchParams] = useSearchParams()
  const view: View = searchParams.get('view') === 'customize' ? 'customize' : 'gallery'
  const setView = (next: View) => {
    const params = new URLSearchParams(searchParams)
    params.set('view', next)
    setSearchParams(params)
  }
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [overrides, setOverrides] = useState<AdminThemeOverrides>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (state === null) return
    setTemplateId(state.active.templateId)
    setOverrides(state.active.overrides)
  }, [state])

  const setOverride = useCallback(
    <K extends keyof AdminThemeOverrides>(key: K, value: AdminThemeOverrides[K] | undefined) => {
      setOverrides((previous) => {
        const next = { ...previous }
        if (value === undefined) {
          delete next[key]
        } else {
          next[key] = value
        }
        return next
      })
      setSaved(false)
    },
    [],
  )

  const save = useCallback(async () => {
    if (token === null || templateId === null) return
    setSaving(true)
    setSaveError(null)
    try {
      await setAdminTheme(token, templateId, overrides)
      await refresh()
      setSaved(true)
    } catch (caught) {
      setSaveError(caught instanceof ApiError ? caught.message : t('adminAppearance.saveError'))
    } finally {
      setSaving(false)
    }
  }, [token, templateId, overrides, refresh, t])

  if (!isAdmin) {
    return (
      <section aria-labelledby="admin-appearance-heading">
        <h1 id="admin-appearance-heading">{t('adminAppearance.heading')}</h1>
        <p role="alert">{t('adminAppearance.adminOnly')}</p>
      </section>
    )
  }

  const activeTemplate =
    state?.templates.find((template) => template.id === templateId) ?? state?.templates[0] ?? null

  return (
    <section aria-labelledby="admin-appearance-heading" className="flex flex-col gap-6">
      <div>
        <h1
          id="admin-appearance-heading"
          className="m-0 text-2xl leading-tight font-bold tracking-tight"
        >
          {t('adminAppearance.heading')}
        </h1>
        <p className="text-muted-foreground text-sm">{t('adminAppearance.description')}</p>
      </div>

      {state === null && (
        <Notice tone="danger" live="assertive">
          <p>{t('adminAppearance.loadError')}</p>
        </Notice>
      )}

      {saveError !== null && (
        <Notice tone="danger" live="assertive">
          <p>{saveError}</p>
        </Notice>
      )}

      {saved && (
        <Notice tone="success">
          <p>{t('adminAppearance.saved')}</p>
        </Notice>
      )}

      {state !== null && view === 'gallery' && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 id="admin-appearance-gallery-heading">{t('adminAppearance.galleryHeading')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {state.templates.map((template) => {
              // Tied to the *persisted* active template, never to the
              // pending local selection — a template picked but not yet
              // saved must not show as "Active" here.
              const active = template.id === state.active.templateId
              return (
                <div
                  key={template.id}
                  className="flex flex-col gap-3 rounded-lg border border-input p-4"
                >
                  <AdminThemePreview template={template} />
                  <div>
                    <h3 className="m-0 text-sm font-semibold">{template.name}</h3>
                    <p className="text-muted-foreground text-xs">{template.description}</p>
                  </div>
                  {active ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-primary text-xs font-medium">
                        {t('adminAppearance.activeLabel')}
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          // Start the edit from the persisted truth, not from
                          // an abandoned pending switch to a different,
                          // unsaved template.
                          setTemplateId(state.active.templateId)
                          setOverrides(state.active.overrides)
                          setSaved(false)
                          setView('customize')
                        }}
                      >
                        {t('adminAppearance.customizeAction')}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setTemplateId(template.id)
                        setSaved(false)
                        setView('customize')
                      }}
                    >
                      {t('adminAppearance.chooseAction')}
                    </Button>
                  )}
                </div>
              )
            })}
          </CardBody>
        </Card>
      )}

      {state !== null && view === 'customize' && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>
              <h2 id="admin-appearance-customize-heading">
                {t('adminAppearance.customizeHeading')}
              </h2>
            </CardTitle>
            <Button type="button" variant="ghost" onClick={() => setView('gallery')}>
              {t('adminAppearance.backToGalleryAction')}
            </Button>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <p className="text-muted-foreground text-sm">
              {t('adminAppearance.customizeDescription')}
            </p>

            {activeTemplate !== null && (
              <div className="max-w-xs">
                <AdminThemePreview template={activeTemplate} overrides={overrides} />
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label={t('adminAppearance.primaryColorLabel')}>
                {(control) => (
                  <div className="flex items-center gap-2">
                    <Input
                      {...control}
                      type="color"
                      className="h-9 w-12 shrink-0 p-1"
                      value={overrides.primaryColor ?? activeTemplate?.light.primary ?? '#000000'}
                      onChange={(event) => setOverride('primaryColor', event.target.value)}
                    />
                    {overrides.primaryColor !== undefined && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setOverride('primaryColor', undefined)}
                      >
                        {t('adminAppearance.resetFieldAction')}
                      </Button>
                    )}
                  </div>
                )}
              </Field>

              <Field label={t('adminAppearance.backgroundColorLabel')}>
                {(control) => (
                  <div className="flex items-center gap-2">
                    <Input
                      {...control}
                      type="color"
                      className="h-9 w-12 shrink-0 p-1"
                      value={
                        overrides.backgroundColor ?? activeTemplate?.light.background ?? '#ffffff'
                      }
                      onChange={(event) => setOverride('backgroundColor', event.target.value)}
                    />
                    {overrides.backgroundColor !== undefined && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setOverride('backgroundColor', undefined)}
                      >
                        {t('adminAppearance.resetFieldAction')}
                      </Button>
                    )}
                  </div>
                )}
              </Field>

              <Field label={t('adminAppearance.textColorLabel')}>
                {(control) => (
                  <div className="flex items-center gap-2">
                    <Input
                      {...control}
                      type="color"
                      className="h-9 w-12 shrink-0 p-1"
                      value={overrides.textColor ?? activeTemplate?.light.foreground ?? '#000000'}
                      onChange={(event) => setOverride('textColor', event.target.value)}
                    />
                    {overrides.textColor !== undefined && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setOverride('textColor', undefined)}
                      >
                        {t('adminAppearance.resetFieldAction')}
                      </Button>
                    )}
                  </div>
                )}
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label={t('adminAppearance.displayFontLabel')}>
                {(control) => (
                  <Select
                    {...control}
                    value={overrides.fontDisplay ?? ''}
                    onChange={(event) =>
                      setOverride(
                        'fontDisplay',
                        event.target.value === '' ? undefined : event.target.value,
                      )
                    }
                  >
                    <option value="">
                      {activeTemplate === null
                        ? ''
                        : (ADMIN_THEME_FONTS.find((f) => f.id === activeTemplate.fontDisplay)
                            ?.label ?? activeTemplate.fontDisplay)}
                    </option>
                    {ADMIN_THEME_FONTS.map((font) => (
                      <option key={font.id} value={font.id}>
                        {font.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label={t('adminAppearance.bodyFontLabel')}>
                {(control) => (
                  <Select
                    {...control}
                    value={overrides.fontBody ?? ''}
                    onChange={(event) =>
                      setOverride(
                        'fontBody',
                        event.target.value === '' ? undefined : event.target.value,
                      )
                    }
                  >
                    <option value="">
                      {activeTemplate === null
                        ? ''
                        : (ADMIN_THEME_FONTS.find((f) => f.id === activeTemplate.fontBody)?.label ??
                          activeTemplate.fontBody)}
                    </option>
                    {ADMIN_THEME_FONTS.map((font) => (
                      <option key={font.id} value={font.id}>
                        {font.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label={t('adminAppearance.radiusLabel')}>
                {(control) => (
                  <div className="flex items-center gap-2">
                    <Input
                      {...control}
                      type="number"
                      step="0.05"
                      min="0"
                      max="2"
                      value={
                        overrides.radius ?? Number.parseFloat(activeTemplate?.radius.md ?? '0')
                      }
                      onChange={(event) => setOverride('radius', Number(event.target.value))}
                    />
                    {overrides.radius !== undefined && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setOverride('radius', undefined)}
                      >
                        {t('adminAppearance.resetFieldAction')}
                      </Button>
                    )}
                  </div>
                )}
              </Field>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="admin-appearance-logo">{t('adminAppearance.logoLabel')}</Label>
              <MediaPicker
                id="admin-appearance-logo"
                token={token ?? ''}
                accept={['image']}
                many={false}
                value={
                  overrides.logoMediaId === undefined || overrides.logoMediaId === null
                    ? []
                    : [overrides.logoMediaId]
                }
                onChange={(ids) => setOverride('logoMediaId', ids[0] ?? null)}
              />
            </div>

            <p className="text-muted-foreground text-xs">{t('adminAppearance.previewNote')}</p>

            <div>
              <Button type="button" onClick={() => void save()} disabled={saving}>
                {saving ? t('adminAppearance.saving') : t('adminAppearance.saveAction')}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </section>
  )
}
