import type { JSX, ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from './auth-context.js'

/**
 * Wraps every route that needs a signed-in user.
 *
 * `loading` renders nothing rather than flashing the login page first —
 * `AuthProvider` is still checking `localStorage`'s token against the
 * server, and redirecting before that answer arrives would bounce someone
 * with a perfectly valid session to `/login` on every page refresh.
 */
export function RequireAuth({ children }: { readonly children: ReactNode }): JSX.Element | null {
  const { state } = useAuth()
  const location = useLocation()

  if (state.status === 'loading') return null

  if (state.status === 'anonymous') {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
