import type { JSX } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/auth-context.js'
import { RequireAuth } from './auth/require-auth.js'
import './i18n/index.js'
import { AgentsRoute } from './routes/agents.js'
import { AnalyticsRoute } from './routes/analytics.js'
import { ApiKeysRoute } from './routes/api-keys.js'
import { AppearanceRoute } from './routes/appearance.js'
import { AssistantRoute } from './routes/assistant.js'
import { AuditRoute } from './routes/audit.js'
import { CollectionListRoute } from './routes/collection-list.js'
import { CollectionsRoute } from './routes/collections.js'
import { CommentsRoute } from './routes/comments.js'
import { CommerceCouponsRoute } from './routes/commerce-coupons.js'
import { CommerceOrderRoute } from './routes/commerce-order-detail.js'
import { CommerceOrdersRoute } from './routes/commerce-orders.js'
import { CommercePaymentRoute } from './routes/commerce-payment.js'
import { CommerceProductsRoute } from './routes/commerce-products.js'
import { CommerceSettingsRoute } from './routes/commerce-settings.js'
import { CommerceShippingRoute } from './routes/commerce-shipping.js'
import { CommerceSubscriptionsRoute } from './routes/commerce-subscriptions.js'
import { CommerceTaxRoute } from './routes/commerce-tax.js'
import { DashboardRoute } from './routes/dashboard.js'
import { EntryEditRoute } from './routes/entry-edit.js'
import { ForgotPasswordRoute } from './routes/forgot-password.js'
import { HealthRoute } from './routes/health.js'
import { ImportRoute } from './routes/import.js'
import { LoginRoute } from './routes/login.js'
import { MarketplaceRoute } from './routes/marketplace.js'
import { MediaRoute } from './routes/media.js'
import { MenusRoute } from './routes/menus.js'
import { OpsSettingsRoute } from './routes/ops-settings.js'
import { ProfileRoute } from './routes/profile.js'
import { RedirectsRoute } from './routes/redirects.js'
import { ResetPasswordRoute } from './routes/reset-password.js'
import { ReviewRoute } from './routes/review.js'
import { RolesRoute } from './routes/roles.js'
import { ScheduledRoute } from './routes/scheduled.js'
import { SearchRoute } from './routes/search.js'
import { SeoRoute } from './routes/seo.js'
import { SettingsRoute } from './routes/settings.js'
import { SitePlanRoute } from './routes/site-plan.js'
import { TaxonomiesRoute } from './routes/taxonomies.js'
import { ToolsRoute } from './routes/tools.js'
import { TranslationsRoute } from './routes/translations.js'
import { TrashRoute } from './routes/trash.js'
import { UsersRoute } from './routes/users.js'
import { SchemaProvider } from './schema/schema-context.js'
import { SiteSettingsProvider } from './settings/site-settings-context.js'
import { AppShell } from './shell/app-shell.js'
import { ChromeStatusProvider } from './shell/shell-status-context.js'
import { ThemeProvider } from './theme/theme-context.js'

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
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter basename={ROUTER_BASENAME}>
          <Routes>
            <Route path="login" element={<LoginRoute />} />
            <Route path="forgot-password" element={<ForgotPasswordRoute />} />
            <Route path="reset-password" element={<ResetPasswordRoute />} />
            <Route
              element={
                <RequireAuth>
                  <SchemaProvider>
                    <SiteSettingsProvider>
                      <ChromeStatusProvider>
                        <AppShell />
                      </ChromeStatusProvider>
                    </SiteSettingsProvider>
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
              <Route path="menus" element={<MenusRoute />} />
              <Route path="commerce/products" element={<CommerceProductsRoute />} />
              <Route path="commerce/orders" element={<CommerceOrdersRoute />} />
              <Route path="commerce/orders/:id" element={<CommerceOrderRoute />} />
              <Route path="commerce/coupons" element={<CommerceCouponsRoute />} />
              <Route path="commerce/subscriptions" element={<CommerceSubscriptionsRoute />} />
              <Route path="commerce/settings" element={<CommerceSettingsRoute />} />
              <Route path="commerce/tax" element={<CommerceTaxRoute />} />
              <Route path="commerce/shipping" element={<CommerceShippingRoute />} />
              <Route path="commerce/payment" element={<CommercePaymentRoute />} />
              <Route path="appearance" element={<AppearanceRoute />} />
              <Route path="redirects" element={<RedirectsRoute />} />
              <Route path="seo" element={<SeoRoute />} />
              <Route path="translations" element={<TranslationsRoute />} />
              <Route path="search" element={<SearchRoute />} />
              <Route path="review" element={<ReviewRoute />} />
              <Route path="ops-settings" element={<OpsSettingsRoute />} />
              <Route path="health" element={<HealthRoute />} />
              <Route path="tools" element={<ToolsRoute />} />
              <Route path="scheduled" element={<ScheduledRoute />} />
              <Route path="trash" element={<TrashRoute />} />
              <Route path="assistant" element={<AssistantRoute />} />
              <Route path="media" element={<MediaRoute />} />
              <Route path="import" element={<ImportRoute />} />
              <Route path="audit" element={<AuditRoute />} />
              <Route path="analytics" element={<AnalyticsRoute />} />
              <Route path="agents" element={<AgentsRoute />} />
              <Route path="users" element={<UsersRoute />} />
              <Route path="api-keys" element={<ApiKeysRoute />} />
              <Route path="roles" element={<RolesRoute />} />
              <Route path="comments" element={<CommentsRoute />} />
              <Route path="profile" element={<ProfileRoute />} />
              <Route path="settings" element={<SettingsRoute />} />
              <Route path="site-plan" element={<SitePlanRoute />} />
              <Route path="marketplace" element={<MarketplaceRoute />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
