import { type JSX, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SiteSetting } from '../api/settings-client.js'
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
 * `settings.field.<key>.label`/`.help` (falling back to the raw key when
 * even that is missing, never to a blank or a crash).
 *
 * Each field saves itself: text-like fields on blur (so a partial edit is
 * never sent mid-keystroke), boolean/select-like fields immediately on
 * change — the same split WordPress and Strapi both use, and the one that
 * needs no separate "Save" button people can forget to press.
 */

const TEXTAREA_CLASSES =
  'w-full appearance-none rounded-md border border-input bg-card px-3 py-2 font-sans text-sm ' +
  'leading-5 text-card-foreground shadow-card transition-colors placeholder:text-muted-foreground ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ' +
  'disabled:cursor-default disabled:opacity-60'

const DATE_TIME_STYLES = ['full', 'long', 'medium', 'short'] as const

export interface SiteSettingsFieldProps {
  readonly setting: SiteSetting
  /** Disabled entirely for a non-admin — this screen still shows the value, just never lets it be edited. */
  readonly canEdit: boolean
  readonly onSave: (value: unknown) => Promise<void>
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

  const label = t(`settings.field.${setting.key}.label`, { defaultValue: setting.key })
  const help = t(`settings.field.${setting.key}.help`, { defaultValue: '' })
  const provenance = canEdit ? t('settings.provenanceEditable') : t('settings.provenanceReadOnly')
  const description = [help, provenance].filter((part) => part !== '').join(' — ')

  async function commit(next: unknown): Promise<void> {
    if (!canEdit) return
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

export function SiteSettingsField({
  setting,
  canEdit,
  onSave,
}: SiteSettingsFieldProps): JSX.Element {
  const { t } = useTranslation()
  const { value, saving, saved, error, commit, label, description } = useSiteSettingField(
    setting,
    canEdit,
    onSave,
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
                  {t(`settings.dateTimeStyle.${style}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
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
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {error === null && <FieldStatus saving={saving} saved={saved} />}
      </div>
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

  // 'string' | 'email' | 'path' | 'timeZone': a single-line text input,
  // typed only for the browser's own hinting (`type="email"`).
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
