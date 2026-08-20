import { createContext, type JSX, type ReactNode, useContext, useEffect, useState } from 'react'
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
  },
  assistantTools: [],
}

const ChromeStatusContext = createContext<ChromeStatusState>({ status: 'loading' })

export function useChromeStatus(): ChromeStatusState {
  return useContext(ChromeStatusContext)
}

/** The same fallback a failed or not-yet-loaded read uses — hiding everything gated on it, never showing it by mistake. */
export function chromeStatusOrFallback(state: ChromeStatusState): ChromeStatus {
  return state.status === 'ready' ? state.chrome : FALLBACK
}

export function ChromeStatusProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const [state, setState] = useState<ChromeStatusState>({ status: 'loading' })

  useEffect(() => {
    if (token === null) return
    let cancelled = false

    async function load(): Promise<void> {
      try {
        const [shellStatus, capabilities] = await Promise.all([
          getShellStatus(token as string),
          getAssistCapabilities(token as string),
        ])
        if (cancelled) return
        setState({
          status: 'ready',
          chrome: {
            shellStatus,
            assistantTools: capabilities.available
              ? capabilities.tools.map((tool) => tool.tool)
              : [],
          },
        })
      } catch {
        if (!cancelled) setState({ status: 'error' })
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [token])

  return <ChromeStatusContext.Provider value={state}>{children}</ChromeStatusContext.Provider>
}
