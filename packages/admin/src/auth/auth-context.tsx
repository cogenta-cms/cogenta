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
import * as api from '../api/client.js'

/**
 * Where the bearer token lives between page loads.
 *
 * The server issues an opaque token in the login response body, not a
 * cookie — `localStorage` is the client-side counterpart of that choice, not
 * an independent one. Revocation is real either way: `logout()` calls
 * `DELETE /api/auth/session`, which the server answers by deleting the row a
 * database read for that token would need.
 */
const TOKEN_STORAGE_KEY = 'cogenta.session.token'

export interface AuthUser {
  readonly id: string
  readonly email: string
  readonly roles: readonly string[]
}

export type AuthState =
  | { readonly status: 'loading' }
  | { readonly status: 'anonymous' }
  | { readonly status: 'authenticated'; readonly token: string; readonly user: AuthUser }

export interface AuthContextValue {
  readonly state: AuthState
  login(email: string, password: string): Promise<api.LoginResult>
  completeTotp(ticket: string, token: string): Promise<api.LoginResult>
  beginTotpSetup(ticket: string): Promise<api.TotpSetup>
  confirmTotpSetup(ticket: string, token: string): Promise<api.LoginResult>
  logout(): Promise<void>
}

/**
 * A real, harmless default rather than `null` plus a "you forgot the
 * provider" guard: `App` always renders `AuthProvider` at the root, so that
 * guard would only ever fire on a genuine coding mistake, and a default that
 * quietly reports "loading forever" is easier to spot in the UI than a thrown
 * error is to spot in a stack trace nobody reads until it matters.
 */
const DEFAULT_CONTEXT: AuthContextValue = {
  state: { status: 'loading' },
  login: () => Promise.reject(new Error('AuthProvider is not mounted')),
  completeTotp: () => Promise.reject(new Error('AuthProvider is not mounted')),
  beginTotpSetup: () => Promise.reject(new Error('AuthProvider is not mounted')),
  confirmTotpSetup: () => Promise.reject(new Error('AuthProvider is not mounted')),
  logout: () => Promise.reject(new Error('AuthProvider is not mounted')),
}

const AuthContext = createContext<AuthContextValue>(DEFAULT_CONTEXT)

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY)
    if (token === null) {
      setState({ status: 'anonymous' })
      return
    }
    api.currentSession(token).then(
      (user) => setState({ status: 'authenticated', token, user }),
      () => {
        localStorage.removeItem(TOKEN_STORAGE_KEY)
        setState({ status: 'anonymous' })
      },
    )
  }, [])

  const applyResult = useCallback((result: api.LoginResult): api.LoginResult => {
    if (result.status === 'session') {
      localStorage.setItem(TOKEN_STORAGE_KEY, result.session.token)
      setState({ status: 'authenticated', token: result.session.token, user: result.user })
    }
    return result
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      login: (email, password) => api.login(email, password).then(applyResult),
      completeTotp: (ticket, token) => api.completeTotp(ticket, token).then(applyResult),
      beginTotpSetup: (ticket) => api.beginTotpSetup(ticket),
      confirmTotpSetup: (ticket, token) => api.confirmTotpSetup(ticket, token).then(applyResult),
      logout: async () => {
        if (state.status === 'authenticated') {
          await api.logout(state.token).catch(() => undefined)
        }
        localStorage.removeItem(TOKEN_STORAGE_KEY)
        setState({ status: 'anonymous' })
      },
    }),
    [state, applyResult],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
