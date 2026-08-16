import {
  createContext,
  type JSX,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

/**
 * The admin's colour scheme switch.
 *
 * `theme.css` already carries a full dark palette, applied so far only through
 * `prefers-color-scheme` — this adds the third option, an explicit override
 * that wins over the system preference in both directions, and a control to
 * set it. `"system"` is the default, so an install that never touches the
 * toggle keeps behaving exactly as it did before this existed.
 *
 * The mechanism is a single attribute on `<html>`, `data-theme="light"` or
 * `data-theme="dark"` — absent for `"system"` — never a class, and never mixed
 * with the `prefers-color-scheme` mechanism: `theme.css` guards its media
 * query with `:root:not([data-theme="light"])` and adds a
 * `:root[data-theme="dark"]` block that wins in both directions, so the two
 * mechanisms compose instead of racing each other.
 */

export type ThemeMode = 'light' | 'dark' | 'system'

const THEME_STORAGE_KEY = 'cogenta.admin.theme'
const DEFAULT_MODE: ThemeMode = 'system'

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system'
}

function readStoredMode(): ThemeMode {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  return isThemeMode(stored) ? stored : DEFAULT_MODE
}

// jsdom (the admin's test environment) does not implement `matchMedia`
// unless a test stubs it, and neither does every real embedded webview this
// SPA might one day run in — a missing API degrades to "assume light" rather
// than crashing the whole shell.
function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

function applyMode(mode: ThemeMode): void {
  const root = document.documentElement
  if (mode === 'system') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', mode)
  }
}

export interface ThemeContextValue {
  readonly mode: ThemeMode
  /** The scheme actually painted right now — `mode` resolved against the system preference when it is `"system"`. */
  readonly resolved: 'light' | 'dark'
  setMode(mode: ThemeMode): void
}

/**
 * A real, harmless default rather than `null` plus a "you forgot the
 * provider" guard, matching `auth-context.tsx`: `App` always mounts
 * `ThemeProvider` at the root, so this only ever fires on a genuine coding
 * mistake, and it renders as "the light theme, stuck" rather than a thrown
 * error nobody sees until it matters.
 */
const DEFAULT_CONTEXT: ThemeContextValue = {
  mode: DEFAULT_MODE,
  resolved: 'light',
  setMode: () => undefined,
}

const ThemeContext = createContext<ThemeContextValue>(DEFAULT_CONTEXT)

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode())
  const [systemDark, setSystemDark] = useState<boolean>(() => systemPrefersDark())

  // Applied on every mode change. It also runs once on mount (effects always
  // do), which is what puts the attribute in place before anything below this
  // provider needs to read it.
  useEffect(() => {
    applyMode(mode)
  }, [mode])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    let media: MediaQueryList
    try {
      media = window.matchMedia('(prefers-color-scheme: dark)')
    } catch {
      return undefined
    }
    const onChange = (): void => setSystemDark(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const setMode = useCallback((next: ThemeMode) => {
    localStorage.setItem(THEME_STORAGE_KEY, next)
    setModeState(next)
  }, [])

  const resolved: 'light' | 'dark' = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolved, setMode }),
    [mode, resolved, setMode],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
