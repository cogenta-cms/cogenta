import { createContext, type JSX, type ReactNode, useContext, useEffect, useState } from 'react'
import { listSettings, type SiteSetting } from '../api/settings-client.js'
import type { DateStyle, TimeStyle } from '../lib/format.js'

/**
 * Fetches `GET /api/settings` once and holds it for the session — the same
 * shape as `SchemaProvider` (`/api/schema`), and for the same reason: every
 * screen that formats a date needs the site's `general.timeZone` /
 * `dateStyle` / `timeStyle`, and re-fetching per screen would be one more
 * network round trip for a value that does not change while the admin is
 * open.
 *
 * A stale copy after another tab changes a setting is an accepted trade —
 * the same one `SchemaProvider` already makes for the collection list, and
 * for the same reason: refetching on every render would be worse than a
 * page reload occasionally being needed to see someone else's change.
 */

export type SiteSettingsState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly settings: readonly SiteSetting[] }
  | { readonly status: 'error'; readonly message: string }

const SiteSettingsContext = createContext<SiteSettingsState>({ status: 'loading' })

export function useSiteSettingsState(): SiteSettingsState {
  return useContext(SiteSettingsContext)
}

/** Formatting-relevant defaults, read straight off the registry's own (`site-settings-registry.ts`'s) defaults — kept in sync by hand, checked by `format.test.ts`'s callers rather than a shared import (the admin never imports `@cogenta/schema`, a Node package — `schema-context.tsx`'s documented reason). */
const DEFAULT_TIME_ZONE = ''
const DEFAULT_DATE_STYLE: DateStyle = 'medium'
const DEFAULT_TIME_STYLE: TimeStyle = 'short'

export interface FormattingSettings {
  /** Empty means "no site time zone configured" — every formatter already treats that as "use the browser's own zone". */
  readonly timeZone: string
  readonly dateStyle: DateStyle
  readonly timeStyle: TimeStyle
}

/** The three formatting-relevant settings, with their registry defaults when the provider is still loading or a request failed — a screen must never block on this to render a date. */
export function useFormattingSettings(): FormattingSettings {
  const state = useSiteSettingsState()
  if (state.status !== 'ready') {
    return {
      timeZone: DEFAULT_TIME_ZONE,
      dateStyle: DEFAULT_DATE_STYLE,
      timeStyle: DEFAULT_TIME_STYLE,
    }
  }
  const byKey = new Map(state.settings.map((setting) => [setting.key, setting.value]))
  const timeZone = byKey.get('general.timeZone')
  const dateStyle = byKey.get('general.dateStyle')
  const timeStyle = byKey.get('general.timeStyle')
  return {
    timeZone: typeof timeZone === 'string' ? timeZone : DEFAULT_TIME_ZONE,
    dateStyle: typeof dateStyle === 'string' ? (dateStyle as DateStyle) : DEFAULT_DATE_STYLE,
    timeStyle: typeof timeStyle === 'string' ? (timeStyle as TimeStyle) : DEFAULT_TIME_STYLE,
  }
}

export function SiteSettingsProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const [state, setState] = useState<SiteSettingsState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      try {
        const settings = await listSettings()
        if (!cancelled) setState({ status: 'ready', settings })
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Could not load site settings.',
          })
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return <SiteSettingsContext.Provider value={state}>{children}</SiteSettingsContext.Provider>
}
