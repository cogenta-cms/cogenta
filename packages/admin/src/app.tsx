import type { JSX } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/auth-context.js'
import { RequireAuth } from './auth/require-auth.js'
import { AuditRoute } from './routes/audit.js'
import { CollectionListRoute } from './routes/collection-list.js'
import { CollectionsRoute } from './routes/collections.js'
import { DashboardRoute } from './routes/dashboard.js'
import { EntryEditRoute } from './routes/entry-edit.js'
import { LoginRoute } from './routes/login.js'
import { MediaRoute } from './routes/media.js'
import { SettingsRoute } from './routes/settings.js'
import { SchemaProvider } from './schema/schema-context.js'
import { AppShell } from './shell/app-shell.js'

/**
 * Routing skeleton for L2 task 1, now with task 2's password/session guard:
 * `/login` is the only public route, and everything under `AppShell` needs
 * an authenticated session or bounces to it, remembering where it came from.
 *
 * `SchemaProvider` wraps only the authenticated section — `/login` has no
 * use for `/api/schema`, so it does not pay for fetching it.
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
                <SchemaProvider>
                  <AppShell />
                </SchemaProvider>
              </RequireAuth>
            }
          >
            <Route index element={<DashboardRoute />} />
            <Route path="collections" element={<CollectionsRoute />} />
            <Route path="collections/:name" element={<CollectionListRoute />} />
            <Route path="collections/:name/new" element={<EntryEditRoute />} />
            <Route path="collections/:name/:id" element={<EntryEditRoute />} />
            <Route path="media" element={<MediaRoute />} />
            <Route path="audit" element={<AuditRoute />} />
            <Route path="settings" element={<SettingsRoute />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
