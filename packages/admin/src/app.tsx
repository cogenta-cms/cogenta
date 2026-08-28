import type { JSX } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/auth-context.js'
import { RequireAuth } from './auth/require-auth.js'
import './i18n/index.js'
import { AdminAppearanceRoute } from './routes/admin-appearance.js'
import { AgentDetailRoute } from './routes/agent-detail.js'
import { AgentSkillsRoute } from './routes/agent-skills.js'
import { AgentsRoute } from './routes/agents.js'
import { AnalyticsRoute } from './routes/analytics.js'
import { ApiKeysRoute } from './routes/api-keys.js'
import { AppearanceRoute } from './routes/appearance.js'
import { AssistantRoute } from './routes/assistant.js'
import { AuditRoute } from './routes/audit.js'
import { ChannelsRoute } from './routes/channels.js'
import { CollectionListRoute } from './routes/collection-list.js'
import { CollectionsRoute } from './routes/collections.js'
import { CommentsRoute } from './routes/comments.js'
import { CommerceCouponsRoute } from './routes/commerce-coupons.js'
import { CommerceCustomerRoute } from './routes/commerce-customer-detail.js'
import { CommerceCustomersRoute } from './routes/commerce-customers.js'
import { CommerceOrderRoute } from './routes/commerce-order-detail.js'
import { CommerceOrdersRoute } from './routes/commerce-orders.js'
import { CommercePaymentRoute } from './routes/commerce-payment.js'
import { CommerceProductsRoute } from './routes/commerce-products.js'
import { CommerceSettingsRoute } from './routes/commerce-settings.js'
import { CommerceShippingRoute } from './routes/commerce-shipping.js'
import { CommerceSubscriptionDetailRoute } from './routes/commerce-subscription-detail.js'
import { CommerceSubscriptionsRoute } from './routes/commerce-subscriptions.js'
import { CommerceTaxRoute } from './routes/commerce-tax.js'
import { DashboardRoute } from './routes/dashboard.js'
import { DocumentationRoute } from './routes/documentation.js'
import { DocumentationDocsRoute } from './routes/documentation-docs.js'
import { EntryEditRoute } from './routes/entry-edit.js'
import { ForgotPasswordRoute } from './routes/forgot-password.js'
import { FormSubmissionsRoute } from './routes/form-submissions.js'
import { FormsRoute } from './routes/forms.js'
import { HealthRoute } from './routes/health.js'
import { ImportRoute } from './routes/import.js'
import { LoginRoute } from './routes/login.js'
import { MarketplaceRoute } from './routes/marketplace.js'
import { McpRoute } from './routes/mcp.js'
import { McpClientsRoute } from './routes/mcp-clients.js'
import { MediaRoute } from './routes/media.js'
import { MenusRoute } from './routes/menus.js'
import { NotFoundRoute } from './routes/not-found.js'
import { ObservabilityRoute } from './routes/observability.js'
import { OpsSettingsRoute } from './routes/ops-settings.js'
import { ProfileRoute } from './routes/profile.js'
import { PromptSettingsRoute } from './routes/prompt-settings.js'
import { ProvidersRoute } from './routes/providers.js'
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
import { AdminThemeProvider } from './theme/admin-theme-context.js'
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
      <AdminThemeProvider>
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
                <Route path="commerce/customers" element={<CommerceCustomersRoute />} />
                <Route path="commerce/customers/:id" element={<CommerceCustomerRoute />} />
                <Route path="commerce/coupons" element={<CommerceCouponsRoute />} />
                <Route path="commerce/subscriptions" element={<CommerceSubscriptionsRoute />} />
                <Route
                  path="commerce/subscriptions/:id"
                  element={<CommerceSubscriptionDetailRoute />}
                />
                <Route path="commerce/settings" element={<CommerceSettingsRoute />} />
                <Route path="commerce/tax" element={<CommerceTaxRoute />} />
                <Route path="commerce/shipping" element={<CommerceShippingRoute />} />
                <Route path="commerce/payment" element={<CommercePaymentRoute />} />
                <Route path="appearance" element={<AppearanceRoute />} />
                <Route path="admin-appearance" element={<AdminAppearanceRoute />} />
                {/* Merged into `/seo`'s "Redirections" tab (fiche 21 task 3) — an old bookmark or link still lands somewhere real. */}
                <Route path="redirects" element={<Navigate to="/seo?tab=redirects" replace />} />
                <Route path="seo" element={<SeoRoute />} />
                <Route path="translations" element={<TranslationsRoute />} />
                <Route path="search" element={<SearchRoute />} />
                <Route path="review" element={<ReviewRoute />} />
                <Route path="ops-settings" element={<OpsSettingsRoute />} />
                <Route path="health" element={<HealthRoute />} />
                <Route path="observability" element={<ObservabilityRoute />} />
                <Route path="tools" element={<ToolsRoute />} />
                <Route path="scheduled" element={<ScheduledRoute />} />
                <Route path="trash" element={<TrashRoute />} />
                <Route path="assistant" element={<AssistantRoute />} />
                <Route path="media" element={<MediaRoute />} />
                <Route path="import" element={<ImportRoute />} />
                <Route path="audit" element={<AuditRoute />} />
                <Route path="analytics" element={<AnalyticsRoute />} />
                <Route path="agents" element={<AgentsRoute />} />
                <Route path="agents/:name" element={<AgentDetailRoute />} />
                <Route path="providers" element={<ProvidersRoute />} />
                <Route path="agent-skills" element={<AgentSkillsRoute />} />
                <Route path="prompt-settings" element={<PromptSettingsRoute />} />
                <Route path="mcp" element={<McpRoute />} />
                <Route path="mcp-clients" element={<McpClientsRoute />} />
                <Route path="channels" element={<ChannelsRoute />} />
                <Route path="users" element={<UsersRoute />} />
                <Route path="api-keys" element={<ApiKeysRoute />} />
                <Route path="roles" element={<RolesRoute />} />
                <Route path="comments" element={<CommentsRoute />} />
                <Route path="forms" element={<FormsRoute />} />
                <Route path="form-submissions" element={<FormSubmissionsRoute />} />
                <Route path="profile" element={<ProfileRoute />} />
                <Route path="settings" element={<SettingsRoute />} />
                <Route path="documentation" element={<DocumentationRoute />} />
                <Route path="documentation/docs" element={<DocumentationDocsRoute />} />
                <Route path="documentation/docs/:tree" element={<DocumentationDocsRoute />} />
                <Route path="documentation/docs/:tree/:slug" element={<DocumentationDocsRoute />} />
                <Route path="create-site" element={<SitePlanRoute />} />
                {/* Old path (fiche 21, task 1 renamed it) — a bookmark or a link elsewhere in the app still lands somewhere real. */}
                <Route path="site-plan" element={<Navigate to="/create-site" replace />} />
                <Route path="marketplace" element={<MarketplaceRoute />} />
                <Route path="*" element={<NotFoundRoute />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </AdminThemeProvider>
    </ThemeProvider>
  )
}
