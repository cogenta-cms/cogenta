import {
  createContext,
  type JSX,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { getAssistCapabilities } from '../api/assist-client.js'
import { getShellStatus, type ShellStatus } from '../api/shell-status-client.js'
import { useAuth } from '../auth/auth-context.js'

/**
 * The two reads the sidebar needs beyond the schema it already has
 * (fiche 35 tasks 1 and 3): `/api/shell-status` (badges, whether the shop
 * has ever sold anything) and `/api/assistant` (which tools, if any, an AI
 * provider actually offers — reused as-is, the same route
 * `assistant-chat.tsx`/`duplicates.tsx` already call for themselves).
 *
 * Fetched once per session and held, the same shape `SchemaProvider` and
 * `SiteSettingsProvider` already use and for the same reason: this state
 * does not change while the admin is open, and re-fetching it per screen
 * would be exactly the "one request per badge" the fiche's own pitfall
 * warns against.
 */
export interface ChromeStatus {
  readonly shellStatus: ShellStatus
  /** Tool names an AI provider currently offers. Empty when none is configured. */
  readonly assistantTools: readonly string[]
}

export type ChromeStatusState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly chrome: ChromeStatus }
  | { readonly status: 'error' }

const FALLBACK: ChromeStatus = {
  shellStatus: {
    trash: 0,
    commerceOrdersPending: null,
    commerceActive: false,
    marketplaceUpdates: null,
    reviewPending: null,
    commentsPending: null,
    formSubmissionsUnread: null,
  },
  assistantTools: [],
}

const ChromeStatusContext = createContext<ChromeStatusState>({ status: 'loading' })

/**
 * L20 audit point 15: a no-op default so any caller outside
 * `ChromeStatusProvider` (a unit test rendering a screen in isolation, say)
 * can still invoke `refresh()` without a null check — it simply does
 * nothing, the same "no crash, no effect" contract the rest of this module
 * already keeps for a failed read.
 */
const ChromeStatusRefreshContext = createContext<() => void>(() => undefined)

export function useChromeStatus(): ChromeStatusState {
  return useContext(ChromeStatusContext)
}

/**
 * Re-runs the sidebar's status fetch outside its own once-per-session
 * effect. `/api/shell-status`'s counts change from actions this admin takes
 * in the same session — approving a comment, restoring or purging trash,
 * marking a form submission read — and without this the badge only ever
 * caught up on the next full page load or the next `token` change.
 */
export function useRefreshChromeStatus(): () => void {
  return useContext(ChromeStatusRefreshContext)
}

/** The same fallback a failed or not-yet-loaded read uses — hiding everything gated on it, never showing it by mistake. */
export function chromeStatusOrFallback(state: ChromeStatusState): ChromeStatus {
  return state.status === 'ready' ? state.chrome : FALLBACK
}

export function ChromeStatusProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const [state, setState] = useState<ChromeStatusState>({ status: 'loading' })
  /** `load` reads this instead of closing over `token` directly, so `refresh` below stays one stable function identity per token rather than a new one on every render. */
  const tokenRef = useRef(token)
  tokenRef.current = token

  const load = useCallback(async (): Promise<void> => {
    const current = tokenRef.current
    if (current === null) return
    try {
      const [shellStatus, capabilities] = await Promise.all([
        getShellStatus(current),
        getAssistCapabilities(current),
      ])
      setState({
        status: 'ready',
        chrome: {
          shellStatus,
          assistantTools: capabilities.available ? capabilities.tools.map((tool) => tool.tool) : [],
        },
      })
    } catch {
      setState({ status: 'error' })
    }
  }, [])

  useEffect(() => {
    if (token === null) return
    void load()
  }, [token, load])

  const refresh = useCallback(() => {
    void load()
  }, [load])

  return (
    <ChromeStatusContext.Provider value={state}>
      <ChromeStatusRefreshContext.Provider value={refresh}>
        {children}
      </ChromeStatusRefreshContext.Provider>
    </ChromeStatusContext.Provider>
  )
}
