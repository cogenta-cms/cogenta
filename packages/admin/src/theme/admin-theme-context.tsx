import {
  createContext,
  type JSX,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { type AdminThemeState, getAdminTheme } from '../api/admin-theme-client.js'
import { buildAdminThemeCss } from './admin-theme-css.js'

/**
 * The admin's own runtime template + personalisation (L21 task 2) — the
 * counterpart to `ThemeProvider` (light/dark) and to `theme-client.ts` (the
 * public **site's** own theming, contract D, a distinct surface on purpose).
 *
 * Mounted at the very root of `App` — above `/login`, not only inside the
 * authenticated shell — because the login screen has to paint in whatever
 * template an install picked before a session exists, exactly the reason
 * `GET /api/admin-theme` needs no token.
 *
 * The mechanism is one `<style id="cogenta-admin-theme-overrides">` tag,
 * injected into `<head>` and rewritten in place whenever the active theme
 * changes — never a rewrite of `theme.css` itself, per the task's own rule
 * that personalising must never touch a built-in template's own file.
 */

const STYLE_ELEMENT_ID = 'cogenta-admin-theme-overrides'

function applyStyle(css: string): void {
  if (typeof document === 'undefined') return
  let element = document.getElementById(STYLE_ELEMENT_ID)
  if (element === null) {
    element = document.createElement('style')
    element.id = STYLE_ELEMENT_ID
    document.head.appendChild(element)
  }
  element.textContent = css
}

export interface AdminThemeContextValue {
  readonly state: AdminThemeState | null
  readonly loading: boolean
  /** Re-fetches `/api/admin-theme` — called after a save on the settings screen so the running page picks up the new choice immediately. */
  refresh(): Promise<void>
}

const DEFAULT_CONTEXT: AdminThemeContextValue = {
  state: null,
  loading: true,
  refresh: async () => undefined,
}

const AdminThemeContext = createContext<AdminThemeContextValue>(DEFAULT_CONTEXT)

export function useAdminTheme(): AdminThemeContextValue {
  return useContext(AdminThemeContext)
}

export function AdminThemeProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const [state, setState] = useState<AdminThemeState | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const fetched = await getAdminTheme()
      setState(fetched)
      applyStyle(buildAdminThemeCss(fetched))
    } catch {
      // No admin theme yet reachable (offline shell, a server still
      // starting) — `theme.css`'s own hard-coded defaults keep painting the
      // page, exactly what happens before this feature existed at all.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <AdminThemeContext.Provider value={{ state, loading, refresh: load }}>
      {children}
    </AdminThemeContext.Provider>
  )
}
