import { useCallback, useState } from 'react'

/**
 * "Enregistrer automatiquement" — a personal, per-browser preference
 * (ADR-0025's third category: never a server-side site setting, since it
 * changes nothing about what gets saved, only *when*), the same
 * `localStorage` boundary `dashboard-prefs.ts` already draws for "which
 * widgets do I see". A `try`/`catch` around every access, because a browser
 * with storage denied (private mode, a locked-down profile) must still get a
 * working "Réglages"/"Apparence" screen — just always autosaving rather than
 * remembering a preference to turn it off.
 *
 * On by default: today's behaviour, unchanged for anyone who never opens
 * this toggle.
 */

const STORAGE_KEY = 'cogenta.admin.autosaveEnabled'

export function loadAutosaveEnabled(): boolean {
  let raw: string | null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return true
  }
  if (raw === null) return true
  return raw === 'true'
}

export function saveAutosaveEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled))
  } catch {
    // Storage denied: the choice still applies to this render, it just will
    // not survive a reload — the same trade-off `dashboard-prefs.ts` makes.
  }
}

/**
 * `[enabled, setEnabled]` — reads once on mount (so a screen rendered before
 * and after a toggle change in another tab still starts from what storage
 * actually holds) and persists every change immediately, no save button of
 * its own: this is a client-only preference, not a server round trip.
 */
export function useAutosaveEnabled(): readonly [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabledState] = useState(() => loadAutosaveEnabled())
  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next)
    saveAutosaveEnabled(next)
  }, [])
  return [enabled, setEnabled] as const
}
