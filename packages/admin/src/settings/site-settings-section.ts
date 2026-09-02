import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Draft-then-flush for a `<Card>` full of `SiteSettingsField`s, once the
 * "Enregistrer automatiquement" preference (`autosave-prefs.ts`) is off.
 *
 * `SiteSettingsField.commit` already refuses to call `onSave` itself while
 * `autosave` is `false` — instead it calls `onDraftChange`, this hook's own
 * per-field wiring below, so pending edits collect here, keyed by setting
 * key, until the section's own explicit "Enregistrer" button flushes them
 * through the very `onSave` a field would otherwise have called on its own.
 *
 * Deliberately section-local (one `<Card>` = one instance = one pending map),
 * not a screen-wide dirty tracker — each tab of "Réglages" and each card of
 * "Apparence" flushes only its own fields, which is also why `hasPending`
 * stays `false` whenever autosave is on: nothing is ever queued here in that
 * case, so a caller can disable its "Enregistrer" button on `!hasPending`
 * alone without asking the toggle's own state — including the one edge case
 * that matters: a person turns autosave off, edits a field, then turns it
 * back on before saving — `hasPending` still remembers that orphaned edit,
 * so the button stays live until it is actually flushed instead of quietly
 * losing it.
 */

interface DraftEntry {
  readonly value: unknown
  readonly locale: string | null
}

export interface SectionAutosave {
  readonly saving: boolean
  readonly error: string | null
  readonly hasPending: boolean
  /** Props to spread onto one `SiteSettingsField` of this section. */
  fieldFor(
    key: string,
    locale: string | null,
  ): { readonly autosave: boolean; readonly onDraftChange: (value: unknown) => void }
  /** Flushes every pending draft through `onSave`, one write per changed key. */
  flush(): Promise<void>
}

export function useSectionAutosave(
  autosaveEnabled: boolean,
  onSave: (key: string, value: unknown, locale: string | null) => Promise<void>,
): SectionAutosave {
  const { t } = useTranslation()
  const draftRef = useRef<Map<string, DraftEntry>>(new Map())
  const [hasPending, setHasPending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fieldFor = useCallback(
    (key: string, locale: string | null) => ({
      autosave: autosaveEnabled,
      onDraftChange: (value: unknown) => {
        draftRef.current.set(key, { value, locale })
        setHasPending(true)
      },
    }),
    [autosaveEnabled],
  )

  const flush = useCallback(async (): Promise<void> => {
    if (draftRef.current.size === 0) return
    setSaving(true)
    setError(null)
    try {
      const entries = [...draftRef.current.entries()]
      for (const [key, entry] of entries) {
        await onSave(key, entry.value, entry.locale)
      }
      draftRef.current.clear()
      setHasPending(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('settings.saveError'))
    } finally {
      setSaving(false)
    }
  }, [onSave, t])

  return { saving, error, hasPending, fieldFor, flush }
}
