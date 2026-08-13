import type { JSX } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/auth-context.js'
import { RequireAuth } from './auth/require-auth.js'
import { AuditRoute } from './routes/audit.js'
import { CollectionsRoute } from './routes/collections.js'
import { DashboardRoute } from './routes/dashboard.js'
import { LoginRoute } from './routes/login.js'
import { MediaRoute } from './routes/media.js'
import { AppShell } from './shell/app-shell.js'

/**
 * Routing skeleton for L2 task 1, now with task 2's password/session guard:
 * `/login` is the only public route, and everything under `AppShell` needs
 * an authenticated session or bounces to it, remembering where it came from.
 */
export function App(): JSX.Element {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="login" element={<LoginRoute />} />
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route index element={<DashboardRoute />} />
            <Route path="collections" element={<CollectionsRoute />} />
            <Route path="media" element={<MediaRoute />} />
            <Route path="audit" element={<AuditRoute />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
