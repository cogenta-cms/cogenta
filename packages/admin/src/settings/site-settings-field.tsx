import { type JSX, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SiteSetting } from '../api/settings-client.js'
import { useAuth } from '../auth/auth-context.js'
import { MediaPicker } from '../fields/media-picker.js'
import { formatDate, formatDateTime, formatTimeOnly } from '../lib/format.js'
import { cn } from '../ui/cn.js'
import { Field, Input, Select } from '../ui/index.js'

/**
 * Renders one editorial site setting, generically, from its `uiType`
 * (fiche 23 task 1's acceptance test: "ajouter un réglage nouveau = une
 * ligne de déclaration, et il apparaît à l'écran sans code d'interface
 * supplémentaire"). Nothing here switches on a setting's *key* — only on
 * the small, closed set of `uiType`s the registry declares — so a new
 * registry entry with an existing `uiType` needs no change to this file at
 * all, only a translation for its label under
 * `<translationNamespace>.field.<key>.label`/`.help` (falling back to the raw
 * key when even that is missing, never to a blank or a crash) —
 * `translationNamespace` defaults to `'settings'`, the "Réglages" screen's own
 * namespace; `appearance.tsx` passes `'appearance'` for the "Marque" card it
 * renders (fiche 68 task 5), so a label lives under the screen that actually
 * shows it rather than under the screen "Marque" moved away from. A `select`
 * option's own label follows the same convention one level deeper,
 * `<translationNamespace>.field.<key>.options.<value>`, falling back to the
 * registry's own (English) `option.label` — the registry lives in
 * `@cogenta/schema`, which has no i18n of its own, so an option nobody has
 * translated yet still shows something instead of a blank row.
 *
 * Each field saves itself: text-like fields on blur (so a partial edit is
 * never sent mid-keystroke), boolean/select-like fields immediately on
 * change — the same split WordPress and Strapi both use, and the one that
 * needs no separate "Save" button people can forget to press.
 *
 * That's the default (`autosave: true`, unchanged for every existing
 * caller). When a screen's own "Enregistrer automatiquement" preference
 * (`autosave-prefs.ts`) is off, `autosave={false}` turns `commit` into a
 * pure local-state update — `onSave` is never called, `onDraftChange` is,
 * and it is the caller's job (see `site-settings-section.ts`) to actually
 * persist the draft later, typically from an explicit "Enregistrer" button.
 */

const TEXTAREA_CLASSES =
  'w-full appearance-none rounded-md border border-input bg-card px-3 py-2 font-sans text-sm ' +
  'leading-5 text-card-foreground shadow-card transition-colors placeholder:text-muted-foreground ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ' +
  'disabled:cursor-default disabled:opacity-60'

interface LinkListEntry {
  readonly label: string
  readonly url: string
}

function isLinkListEntry(value: unknown): value is LinkListEntry {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { readonly label?: unknown; readonly url?: unknown }
  return typeof candidate.label === 'string' && typeof candidate.url === 'string'
}

/** The JSON value `uiType: 'linkList'` stores, as one `Label | https://url` line per entry — the textarea encoding of that field. */
function linkListToText(value: unknown): string {
  if (!Array.isArray(value)) return ''
  return value
    .filter(isLinkListEntry)
    .map((entry) => `${entry.label} | ${entry.url}`)
    .join('\n')
}

/**
 * The inverse of `linkListToText`. A blank line is dropped; a line with no
 * `|`, or an empty label/url either side of it, is dropped too rather than
 * guessed at — an admin sees the line they typed vanish on the next load,
 * which is a clearer signal that it did not parse than a silently wrong
 * entry would be.
 */
function textToLinkList(text: string): readonly LinkListEntry[] {
  const entries: LinkListEntry[] = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (line === '') continue
    const separator = line.indexOf('|')
    if (separator === -1) continue
    const label = line.slice(0, separator).trim()
    const url = line.slice(separator + 1).trim()
    if (label === '' || url === '') continue
    entries.push({ label, url })
  }
  return entries
}

const DATE_TIME_STYLES = ['full', 'long', 'medium', 'short'] as const

/**
 * Every IANA zone name this runtime knows (fiche 68 task 1) — computed once,
 * not per render: `Intl.supportedValuesOf` is a real enumeration, not a free
 * call, and the list is static for the life of the process. `try/catch`
 * guards a runtime old enough to lack the method entirely (it shipped in all
 * evergreen browsers and Node 18+, but this is rendered admin-side, in
 * whatever browser an operator happens to have) — an empty list degrades to
 * "only the unset option", never a crash.
 */
const TIME_ZONE_NAMES: readonly string[] = (() => {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return []
  }
})()

export interface SiteSettingsFieldProps {
  readonly setting: SiteSetting
  /** Disabled entirely for a non-admin — this screen still shows the value, just never lets it be edited. */
  readonly canEdit: boolean
  readonly onSave: (value: unknown) => Promise<void>
  /** i18n namespace this field's label/help live under. Defaults to `'settings'`. */
  readonly translationNamespace?: string
  /** `false` defers persistence to the caller (see the doc comment above). Defaults to `true`. */
  readonly autosave?: boolean
  /** Called with the new value instead of `onSave`, while `autosave` is `false`. */
  readonly onDraftChange?: (value: unknown) => void
}

interface UseSiteSettingFieldResult {
  readonly value: unknown
  readonly saving: boolean
  readonly saved: boolean
  readonly error: string | null
  readonly commit: (next: unknown) => Promise<void>
  readonly label: string
  readonly description: string | undefined
}

function useSiteSettingField(
  setting: SiteSetting,
  canEdit: boolean,
  onSave: (value: unknown) => Promise<void>,
  translationNamespace: string,
  autosave: boolean,
  onDraftChange?: (value: unknown) => void,
): UseSiteSettingFieldResult {
  const { t } = useTranslation()
  const [value, setValue] = useState(setting.value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // The list reloads after every write (a locale switch, another field's
  // save) — resync local state so this field never shows a stale value or
  // fights a value it just wrote itself.
  useEffect(() => {
    setValue(setting.value)
  }, [setting.value])

  const label = t(`${translationNamespace}.field.${setting.key}.label`, {
    defaultValue: setting.key,
  })
  const help = t(`${translationNamespace}.field.${setting.key}.help`, { defaultValue: '' })
  const provenance = canEdit ? t('settings.provenanceEditable') : t('settings.provenanceReadOnly')
  const description = [help, provenance].filter((part) => part !== '').join(' — ')

  async function commit(next: unknown): Promise<void> {
    if (!canEdit) return
    if (!autosave) {
      if (next === value) return
      // Deferred: update what's shown, tell the caller a draft is pending,
      // and stop — never call `onSave`, and never claim "saved" for a value
      // that has not actually reached the server yet.
      setValue(next)
      setSaved(false)
      setError(null)
      onDraftChange?.(next)
      return
    }
    if (next === value && saved) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await onSave(next)
      setValue(next)
      setSaved(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('settings.saveError'))
    } finally {
      setSaving(false)
    }
  }

  return {
    value,
    saving,
    saved,
    error,
    commit,
    label,
    description: description === '' ? undefined : description,
  }
}

function FieldStatus({
  saving,
  saved,
}: {
  readonly saving: boolean
  readonly saved: boolean
}): JSX.Element | null {
  const { t } = useTranslation()
  if (saving)
    return <p className="text-xs leading-5 text-muted-foreground">{t('settings.saving')}</p>
  if (saved) return <p className="text-xs leading-5 text-muted-foreground">{t('settings.saved')}</p>
  return null
}

/**
 * `uiType: 'media'` — today only `branding.customLogoMediaId` (fiche L21
 * task 8). Reuses `MediaPicker` exactly as `appearance.tsx` does for the
 * site's own logo/favicon/share-image fields, rather than a bespoke upload
 * widget: single value, images only, saved on the very next pick (a media
 * reference has no "blur" event to save on, unlike a text field).
 *
 * Needs a token `MediaPicker` requires and this generic field otherwise
 * never does — read from `useAuth()` directly rather than threading it
 * through every `SiteSettingsFieldProps` caller for a single `uiType`.
 */
function MediaSettingField({
  setting,
  canEdit,
  value,
  saving,
  saved,
  error,
  label,
  description,
  commit,
}: {
  readonly setting: SiteSetting
  readonly canEdit: boolean
  readonly value: unknown
  readonly saving: boolean
  readonly saved: boolean
  readonly error: string | null
  readonly label: string
  readonly description: string | undefined
  readonly commit: (next: unknown) => Promise<void>
}): JSX.Element {
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : ''
  const fieldId = `site-setting-${setting.key}`
  const selected = typeof value === 'string' && value !== '' ? [value] : []

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="font-sans text-sm font-medium text-foreground">
        {label}
      </label>
      <MediaPicker
        id={fieldId}
        token={token}
        accept={['image']}
        many={false}
        value={selected}
        disabled={!canEdit || saving}
        onChange={(ids) => void commit(ids[0] ?? '')}
      />
      {description !== undefined && (
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      )}
      {error !== null ? (
        <p role="alert" className="text-xs leading-5 font-medium text-destructive">
          {error}
        </p>
      ) : (
        <FieldStatus saving={saving} saved={saved} />
      )}
    </div>
  )
}

export function SiteSettingsField({
  setting,
  canEdit,
  onSave,
  translationNamespace = 'settings',
  autosave = true,
  onDraftChange,
}: SiteSettingsFieldProps): JSX.Element {
  const { t } = useTranslation()
  const { value, saving, saved, error, commit, label, description } = useSiteSettingField(
    setting,
    canEdit,
    onSave,
    translationNamespace,
    autosave,
    onDraftChange,
  )
  const fieldId = `site-setting-${setting.key}`

  if (setting.uiType === 'boolean') {
    return (
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={fieldId}
          className="flex items-center gap-2 font-sans text-sm font-medium text-foreground"
        >
          <input
            id={fieldId}
            type="checkbox"
            disabled={!canEdit || saving}
            checked={value === true}
            onChange={(event) => void commit(event.target.checked)}
          />
          {label}
        </label>
        {description !== undefined && (
          <p className="text-xs leading-5 text-muted-foreground">{description}</p>
        )}
        {error !== null ? (
          <p role="alert" className="text-xs leading-5 font-medium text-destructive">
            {error}
          </p>
        ) : (
          <FieldStatus saving={saving} saved={saved} />
        )}
      </div>
    )
  }

  if (setting.uiType === 'dateStyle' || setting.uiType === 'timeStyle') {
    // Fiche 68 task 2 — every option carries its own live example, computed
    // fresh on each render (a fresh `Date.now()`, never a value cached at
    // mount), so comparing "Long" against "Court" never requires actually
    // selecting each one first. `dateStyle` formats a date, `timeStyle` a
    // time — the two never share a preview because they format different
    // things, even though both drive the very same `<select>` shape.
    const now = new Date().toISOString()
    const exampleFor = (style: (typeof DATE_TIME_STYLES)[number]): string =>
      setting.uiType === 'dateStyle'
        ? formatDate(now, { dateStyle: style })
        : formatTimeOnly(now, { timeStyle: style })
    const currentExample =
      typeof value === 'string' && (DATE_TIME_STYLES as readonly string[]).includes(value)
        ? exampleFor(value as (typeof DATE_TIME_STYLES)[number])
        : null
    return (
      <div className="flex flex-col gap-1">
        <Field label={label} description={description} error={error}>
          {(control) => (
            <Select
              {...control}
              disabled={!canEdit || saving}
              value={typeof value === 'string' ? value : ''}
              onChange={(event) => void commit(event.target.value)}
            >
              {DATE_TIME_STYLES.map((style) => (
                <option key={style} value={style}>
                  {t(`settings.dateTimeStyle.${style}`)} — {exampleFor(style)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {currentExample !== null && (
          <p className="text-xs leading-5 text-muted-foreground">
            {t('settings.dateTimeExampleLabel', { example: currentExample })}
          </p>
        )}
        {error === null && <FieldStatus saving={saving} saved={saved} />}
      </div>
    )
  }

  if (setting.uiType === 'timeZone') {
    // Fiche 68 task 1 — a real `<select>` over every IANA zone name this
    // runtime knows, so an invalid name simply cannot be typed (the fiche's
    // own acceptance test), plus the current time in whichever zone is
    // selected, so a change is legible before it is ever saved — the piège
    // fiche 23 already named: a silent mismatch here mis-schedules a
    // publication.
    const zone = typeof value === 'string' ? value : ''
    const preview = formatDateTime(new Date().toISOString(), {
      dateStyle: 'full',
      timeStyle: 'medium',
      ...(zone === '' ? {} : { timeZone: zone }),
    })
    return (
      <div className="flex flex-col gap-1">
        <Field label={label} description={description} error={error}>
          {(control) => (
            <Select
              {...control}
              disabled={!canEdit || saving}
              value={zone}
              onChange={(event) => void commit(event.target.value)}
            >
              <option value="">{t('settings.timeZoneUnset')}</option>
              {TIME_ZONE_NAMES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <p className="text-xs leading-5 text-muted-foreground">
          {t('settings.timeZonePreview', { time: preview })}
        </p>
        {error === null && <FieldStatus saving={saving} saved={saved} />}
      </div>
    )
  }

  if (setting.uiType === 'select') {
    return (
      <div className="flex flex-col gap-1">
        <Field label={label} description={description} error={error}>
          {(control) => (
            <Select
              {...control}
              disabled={!canEdit || saving}
              value={typeof value === 'string' ? value : ''}
              onChange={(event) => void commit(event.target.value)}
            >
              {(setting.options ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {t(`settings.field.${setting.key}.options.${option.value}`, {
                    defaultValue: option.label,
                  })}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {error === null && <FieldStatus saving={saving} saved={saved} />}
      </div>
    )
  }

  if (setting.uiType === 'media') {
    return (
      <MediaSettingField
        setting={setting}
        canEdit={canEdit}
        value={value}
        saving={saving}
        saved={saved}
        error={error}
        label={label}
        description={description}
        commit={commit}
      />
    )
  }

  if (setting.uiType === 'number') {
    return (
      <div className="flex flex-col gap-1">
        <Field label={label} description={description} error={error}>
          {(control) => (
            <Input
              {...control}
              type="number"
              disabled={!canEdit || saving}
              defaultValue={typeof value === 'number' ? value : 0}
              onBlur={(event) => {
                const next = Number(event.target.value)
                if (!Number.isNaN(next)) void commit(next)
              }}
            />
          )}
        </Field>
        {error === null && <FieldStatus saving={saving} saved={saved} />}
      </div>
    )
  }

  if (setting.uiType === 'text') {
    return (
      <div className="flex flex-col gap-1">
        <Field label={label} description={description} error={error}>
          {(control) => (
            <textarea
              {...control}
              className={cn(TEXTAREA_CLASSES)}
              rows={3}
              disabled={!canEdit || saving}
              defaultValue={typeof value === 'string' ? value : ''}
              onBlur={(event) => void commit(event.target.value)}
            />
          )}
        </Field>
        {error === null && <FieldStatus saving={saving} saved={saved} />}
      </div>
    )
  }

  // `uiType: 'linkList'` — today only `general.socialLinks` (fiche L25 D2):
  // an ordered list of `{label, url}` the registry stores as JSON, edited
  // here as one `Label | https://url` line per entry rather than a raw JSON
  // textarea, which is what `SITE_SETTINGS_REGISTRY`'s own comment on this
  // `uiType` promises ("un éditeur générique, pas un espace réservé pour un
  // écran sur mesure"). A future setting of the same shape needs no change
  // here, only a new registry entry with this same `uiType`.
  if (setting.uiType === 'linkList') {
    return (
      <div className="flex flex-col gap-1">
        <Field label={label} description={description} error={error}>
          {(control) => (
            <textarea
              {...control}
              className={cn(TEXTAREA_CLASSES)}
              rows={4}
              placeholder="X | https://x.com/yoursite"
              disabled={!canEdit || saving}
              defaultValue={linkListToText(value)}
              onBlur={(event) => void commit(textToLinkList(event.target.value))}
            />
          )}
        </Field>
        {error === null && <FieldStatus saving={saving} saved={saved} />}
      </div>
    )
  }

  // 'string' | 'email' | 'path': a single-line text input, typed only for
  // the browser's own hinting (`type="email"`).
  const inputType = setting.uiType === 'email' ? 'email' : 'text'
  return (
    <div className="flex flex-col gap-1">
      <Field label={label} description={description} error={error}>
        {(control) => (
          <Input
            {...control}
            type={inputType}
            disabled={!canEdit || saving}
            defaultValue={typeof value === 'string' ? value : ''}
            onBlur={(event) => void commit(event.target.value)}
          />
        )}
      </Field>
      {error === null && <FieldStatus saving={saving} saved={saved} />}
    </div>
  )
}
