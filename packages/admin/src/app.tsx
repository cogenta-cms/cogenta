import type { JSX } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/auth-context.js'
import { RequireAuth } from './auth/require-auth.js'
import './i18n/index.js'
import { AgentsRoute } from './routes/agents.js'
import { AssistantChatRoute } from './routes/assistant-chat.js'
import { AuditRoute } from './routes/audit.js'
import { CollectionListRoute } from './routes/collection-list.js'
import { CollectionsRoute } from './routes/collections.js'
import { DashboardRoute } from './routes/dashboard.js'
import { DuplicatesRoute } from './routes/duplicates.js'
import { EntryEditRoute } from './routes/entry-edit.js'
import { LoginRoute } from './routes/login.js'
import { MediaRoute } from './routes/media.js'
import { ProfileRoute } from './routes/profile.js'
import { SettingsRoute } from './routes/settings.js'
import { SitePlanRoute } from './routes/site-plan.js'
import { TaxonomiesRoute } from './routes/taxonomies.js'
import { TrashRoute } from './routes/trash.js'
import { UsersRoute } from './routes/users.js'
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
// Vite always trails `BASE_URL` with `/` ("/admin/", or "/" in dev) — but
// react-router's `basename` match is a literal string prefix, so a request
// for exactly `/admin` (no trailing slash, the URL a real user actually
// types or clicks) does not start with "/admin/" and the router silently
// renders nothing. Stripping the trailing slash makes "/admin" itself match
// too, while "/admin/collections" still does (it still starts with "/admin").
const ROUTER_BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '')

export function App(): JSX.Element {
  return (
    <AuthProvider>
      <BrowserRouter basename={ROUTER_BASENAME}>
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
            <Route path="taxonomies" element={<TaxonomiesRoute />} />
            <Route path="trash" element={<TrashRoute />} />
            <Route path="assistant-chat" element={<AssistantChatRoute />} />
            <Route path="duplicates" element={<DuplicatesRoute />} />
            <Route path="media" element={<MediaRoute />} />
            <Route path="audit" element={<AuditRoute />} />
            <Route path="agents" element={<AgentsRoute />} />
            <Route path="users" element={<UsersRoute />} />
            <Route path="profile" element={<ProfileRoute />} />
            <Route path="settings" element={<SettingsRoute />} />
            <Route path="site-plan" element={<SitePlanRoute />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
