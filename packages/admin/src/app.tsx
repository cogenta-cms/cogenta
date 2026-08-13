import type { JSX } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { AuditRoute } from './routes/audit.js'
import { CollectionsRoute } from './routes/collections.js'
import { DashboardRoute } from './routes/dashboard.js'
import { MediaRoute } from './routes/media.js'
import { AppShell } from './shell/app-shell.js'

/**
 * Routing skeleton for L2 task 1. Every route below `AppShell` is a
 * placeholder until its own task in `docs/lots/L2-admin.md` lands; auth
 * (task 2) will wrap this in a route guard once there is a session to check.
 */
export function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardRoute />} />
          <Route path="collections" element={<CollectionsRoute />} />
          <Route path="media" element={<MediaRoute />} />
          <Route path="audit" element={<AuditRoute />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
