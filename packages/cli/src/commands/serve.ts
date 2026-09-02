import { createHash } from 'node:crypto'
import { readFile, stat, statfs } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import {
  createFilePromptTemplateStore,
  ensureBuiltinPromptTemplates,
  type PromptTemplateStore,
} from '@cogenta/agents'
import {
  type AnalyticsStore,
  createAnalyticsStore,
  ensureAnalyticsTables,
} from '@cogenta/analytics'
import {
  type AccessContext,
  type AdminThemeRouter,
  type AgentSkillsRouter,
  type AgentsRouter,
  type AnalyticsRouter,
  type ApiKeysRouter,
  type AssistantRouter,
  type AssistToolsetLike,
  type AuditRouter,
  type AuthRouter,
  buildContentSchema,
  type ConfigStatusInput,
  createAdminThemeRouter,
  createAgentSkillsRouter,
  createAgentsRouter,
  createAnalyticsRouter,
  createApiKeyExpiryNoticeSource,
  createApiKeysRouter,
  createAssistantRouter,
  createAuditIntegritySource,
  createAuditRouter,
  createAuthRouter,
  createContentGateway,
  createContentService,
  createFormsRouter,
  createHealthRouter,
  createImportRouter,
  createMarketplaceRouter,
  createMcpConnectionsRouter,
  createMediaRouter,
  createMenuRouter,
  createMfaRecommendationSource,
  createMonitoringRedirectSuggestionSource,
  createNotFoundRouter,
  createNoticeChannelBridge,
  createNoticeChannelSettingsRouter,
  createNoticeDismissalStore,
  createNoticeHistoryStore,
  createNoticeRouter,
  createObservabilityRouter,
  createOpsStatusRouter,
  createPatternRouter,
  createPendingMigrationsSource,
  createPermissionLayer,
  createPluginDisabledSource,
  createPreviewTokens,
  createPromptTemplatesRouter,
  createProvidersRouter,
  createRecoveryCodeUsedNoticeSource,
  createRedirectRouter,
  createRestRouter,
  createReviewRouter,
  createRolePermissionRouter,
  createScheduledPublishFailedSource,
  createScheduledTasksRouter,
  createSearchConsoleRouter,
  createSearchRouter,
  createSeoRouter,
  createShellStatusRouter,
  createSitePlanRouter,
  createSiteSettingsRouter,
  createSuspiciousActivitySource,
  createTaxonomyRouter,
  createThemeRouter,
  createToolsRouter,
  createUpdateRouter,
  createUsersRouter,
  errorResponse,
  executeGraphQL,
  type ForgotPasswordEvent,
  type FormsRequestContext,
  type FormsRouter,
  type HealthRouter,
  type ImportRouter,
  type InvitedUserEvent,
  isMultipartFormData,
  type MarketplaceRouter,
  type McpConnectionsRouter,
  type MediaImageProcessor,
  type MediaRouter,
  type MenuItemHealth,
  type MenuRouter,
  type NotFoundRouter,
  type NoticeChannelSettingsRouter,
  type NoticeRouter,
  type ObservabilityRouter,
  type OpsStatusRouter,
  type PatternRouter,
  type PermissionLayer,
  type PromptTemplatesRouter,
  type ProvidersRouter,
  parseMultipartFormData,
  type RedirectRouter,
  type RestRequest,
  type RestResponse,
  type RestRouter,
  type ReviewRouter,
  type RolePermissionRouter,
  resolveActor,
  roleState,
  type ScheduledTasksRouter,
  type SearchConsoleRouter,
  type SearchRouter,
  type SeoRouter,
  type ShellStatusRouter,
  type SitePlanRouter,
  type SitePlanRouterOptions,
  type SiteSettingsRouter,
  streamSubmissionsCsv,
  type TaxonomyRouter,
  type ThemeRouter,
  type ThemeRouterOptions,
  type ToolsRouter,
  type TrashStatus,
  type UpdateRouter,
  type UsersRouter,
  variantKeyFor,
} from '@cogenta/api'
import { type AuditLog, type AuthStore, createAuditLog, createAuthStore } from '@cogenta/auth'
import {
  type ChannelRegistry,
  createChannelLinkStore,
  createChannelRegistry,
  createFileEmailTransport,
  createNotificationDispatcher,
  createPreferenceStore,
  type EmailTransport,
  ensureChannelTables,
  ensurePreferenceTables,
} from '@cogenta/channels'
import {
  type CommentSettingsStore,
  type CommentStore,
  type CommentsRequest,
  type CommentsRouter,
  createCommentPermissions,
  createCommentRateLimiter,
  createCommentSettingsStore,
  createCommentStore,
  createCommentsRouter,
  effectiveEnabled,
  ensureCommentsTables,
} from '@cogenta/comments'
import {
  type CommerceAdminRouter,
  type CommerceRequest,
  createCartStore,
  createCatalogStore,
  createCommerceAdminRouter,
  createCommercePermissions,
  createCouponStore,
  createCreditNoteStore,
  createCustomerStore,
  createInvoiceStore,
  createOrderEmailQueue,
  createOrderStore,
  createPaymentRegistry,
  createPaymentStore,
  createShippingStore,
  createSubscriptionStore,
  createTaxStore,
  ensureCommerceTables,
  type OrderEmailQueue,
  type PaymentConfig,
} from '@cogenta/commerce'
import {
  type CogentaConfig,
  CogentaError,
  createCacheRegistry,
  createDatabaseMediaFolderStore,
  createDatabaseMediaStore,
  createDatabaseQueue,
  createDatabaseRegistry,
  createErrorLog,
  createLogger,
  createMemoryRateLimiter,
  createMigrator,
  createRateLimitRegistry,
  createStorageRegistry,
  type DatabaseHandle,
  type ErrorLog,
  getCoreVersion,
  type HealthReport,
  isCogentaError,
  type Logger,
  type LogLevel,
  loadConfig,
  type MediaFolderStore,
  type MediaStore,
  type MigrationStatus,
  type RateLimitDriver,
  type SecretHygieneReport,
  type StorageDriver,
} from '@cogenta/core'
import { createFormStore, ensureFormsTables, type FormStore } from '@cogenta/forms'
import {
  analyzeGeneric,
  analyzeJson,
  analyzeWordPress,
  applyGeneric,
  applyJson,
  createImportTrackingStore,
  csvToRecords,
  type FieldMapping,
  feedToRecords,
  type ImportRun,
  importWordPress,
  parseJsonImport,
  undoImport,
} from '@cogenta/import'
import { createMcpConnectionStore, ensureMcpConnectionTables } from '@cogenta/mcp'
import {
  createObservabilityRuntime,
  type ObservabilityRuntime,
  withRequestTracing,
} from '@cogenta/observability'
import {
  createMarketplaceCatalog,
  createMarketplaceInstaller,
  createPluginDisableStore,
  createPluginGrantStore,
  createPluginUsageStore,
  describeCapability,
  ensureMarketplaceTables,
  ensurePluginTables,
  type MarketplaceCatalogEntry,
} from '@cogenta/plugins'
import type { MediaAsset as RenderMediaAsset } from '@cogenta/render'
import {
  type AdminThemeStore,
  type BlockZones,
  buildPath,
  buildSchemaDocument,
  type CollectionDefinition,
  type ContentLifecycleEvent,
  type ContentStore,
  createAdminThemeStore,
  createContentStore,
  createMaintenanceStore,
  createMenuStore,
  createNotFoundLogStore,
  createPatternStore,
  createRedirectPatternStore,
  createRedirectStore,
  createRolePermissionOverlay,
  createRolePermissionStore,
  createScheduledPublishFailureStore,
  createScheduledTaskRegistry,
  createSchemaTables,
  createSearchConsoleConnectionStore,
  createSearchIndex,
  createSiteSettingsStore,
  createTaxonomyStore,
  DEFAULT_TRASH_RETAIN_DAYS,
  ensureAdminThemeTable,
  ensureMaintenanceTable,
  ensureMenuTables,
  ensurePatternTables,
  ensureSearchConsoleConnectionTable,
  ensureSiteSettingsTables,
  type MaintenanceStore,
  type MenuStore,
  type NotFoundLogStore,
  type PatternStore,
  type RedirectPatternStore,
  type RedirectStore,
  type RolePermissionStore,
  registerScheduledPublishing,
  type ScheduledTaskRegistry,
  type SchemaDocument,
  type SearchConsoleConnectionStore,
  type SearchDriver,
  SITE_SETTINGS_SITE_SCOPE,
  type SiteSettingsStore,
  type TaxonomyDefinition,
  type TaxonomyStore,
  withLifecycleEvents,
  withReadOnlyStore,
  withRedirectTracking,
  withScheduledPublishEnqueue,
  withSearchIndexing,
} from '@cogenta/schema'
import {
  canonicalUrl,
  indexNowKeyFile,
  llmsTxtSectionsFor,
  pingIndexNow,
  renderLlmsTxt,
} from '@cogenta/seo'
import type { PublicComment } from '@cogenta/theme-canonical'
import type { GraphQLSchema } from 'graphql'
import { sendInviteMail } from '../invite-mail.js'
import type { Output, Writer } from '../output.js'
import { sendResetMail } from '../reset-mail.js'
import {
  type ApplyUpdateResult,
  AUTO_UPDATE_POLICIES,
  type AutoUpdatePolicy,
  applyUpdate,
  checkForUpdates,
  listRestorePoints,
  listUpdateHistory,
  policyAllows,
  type RunPackageInstall,
  recordUpdateHistory,
  UPDATE_APPLIED_ACTION,
  UPDATE_APPLY_FAILED_ACTION,
} from '../update/index.js'
import { getCliVersion } from '../version.js'
import { serveAdminAsset } from './admin-assets.js'
import { type AgentRuntimeAssembly, buildAgentRuntime } from './agent-runtime.js'
import { type AssistantAssembly, buildAssistant, withVectorIndexing } from './assistant.js'
import { sendAuditIntegrityAlert } from './audit-integrity-alert.js'
import { createContentWebhookEmitter } from './content-webhooks.js'
import { DEFAULT_LOGO_CONTENT_TYPE, DEFAULT_LOGO_PATH, defaultLogoBytes } from './default-logo.js'
import { runDoctor } from './doctor.js'
import { renderFormNotFoundPage, renderFormPage } from './forms-page.js'
import { applySecurity, type SecurityConfig } from './http-security.js'
import { selectMediaImageProcessor } from './media-images.js'
import { loadMigrations, MIGRATIONS_DIRECTORY } from './migrate.js'
import { renderSearchPage } from './search-page.js'
import { createSecurityAlertWatch, type SecurityAlertWatch } from './security-alerts.js'
import {
  buildSitemapFiles,
  collectRoutedResources,
  readSeoOperationalSettings,
  readSeoRenderDefaults,
  renderRobots,
  seoSiteFor,
} from './seo.js'
import { createSitePlanning } from './site-plan.js'
import { createThemeCssResolver, cssEtag } from './theme-css.js'
import { availableThemes, DEFAULT_THEME_NAME } from './theme-registry.js'
import {
  type BrandingSettings,
  DEFAULT_IMAGE_ENDPOINT,
  entryTitle,
  joinStyles,
  loadSkinCss,
  renderDraftPage,
  renderMaintenancePage,
  renderRequestedPage,
  renderThemeGalleryPreview,
  resolveEntry,
  STYLESHEET_PATH,
} from './theme-render.js'
import { computeEffectiveStyles, computePreviewStyles, createThemeWiring } from './theme-wiring.js'
import { buildToolBodies, createToolRunner, TOOL_DEFINITIONS } from './tools.js'

/** `/sitemap.xml` and the `/sitemap-N.xml` chunks a large site splits into. */
const SITEMAP_PATH = /^\/sitemap(?:-\d+)?\.xml$/u

/** IndexNow's own key-file path — matches `indexNowKeyFile`'s `path` (`@cogenta/seo`) for any hex key, whether or not it is the one currently configured (fiche 50 task 3). */
const INDEXNOW_KEY_FILE_PATTERN = /^\/([a-fA-F0-9]{8,128})\.txt$/u

/** The only `Content-Type` values `/_image` will ever put on the wire. */
const SERVABLE_IMAGE_TYPES: ReadonlySet<string> = new Set([
  'image/avif',
  'image/webp',
  'image/jpeg',
  'image/png',
])

const SCHEMA_FILE_CANDIDATES = [
  'cogenta.schema.ts',
  'cogenta.schema.mts',
  'cogenta.schema.mjs',
  'cogenta.schema.js',
]

/**
 * Loads a project's content model.
 *
 * `cogenta.schema.ts` next to the config file, default-exporting the
 * collections — the same "one file, dynamic-imported, next to the config"
 * convention `migrate.ts` already established for migrations. A project with
 * none is invalid here, unlike a project with no migrations: a site with zero
 * collections has nothing to serve.
 */
export async function loadCollections(
  projectRoot: string,
): Promise<readonly CollectionDefinition[]> {
  return (await loadSchemaModule(projectRoot)).collections
}

/** What a project's schema file declares: collections, and since `schema@2.0` taxonomies. */
export interface LoadedSchema {
  readonly collections: readonly CollectionDefinition[]
  readonly taxonomies: readonly TaxonomyDefinition[]
}

/**
 * The same file, read for both halves of the content model.
 *
 * Taxonomies arrive as a **named** export beside the default one
 * (`export const taxonomies = [...]`), so every schema file written before
 * `schema@2.0` keeps loading unchanged and simply declares none.
 */
export async function loadSchemaModule(projectRoot: string): Promise<LoadedSchema> {
  for (const candidate of SCHEMA_FILE_CANDIDATES) {
    const path = join(projectRoot, candidate)
    let module: { default?: unknown; taxonomies?: unknown }
    try {
      module = (await import(pathToFileURL(path).href)) as {
        default?: unknown
        taxonomies?: unknown
      }
    } catch (error) {
      if (isModuleNotFound(error, path)) continue
      throw new CogentaError({
        code: 'SCHEMA_INVALID',
        message: `Could not load ${path}: ${error instanceof Error ? error.message : String(error)}`,
        hint: 'Check the file for a syntax error, and that every import it uses is installed.',
        cause: error,
      })
    }

    const collections = module.default
    if (!Array.isArray(collections)) {
      throw new CogentaError({
        code: 'SCHEMA_INVALID',
        message: `${path} must default-export an array of collections.`,
        hint: 'Export the array defineCollection() built, the same one passed to createSchemaTables in tests.',
      })
    }

    const taxonomies = module.taxonomies
    if (taxonomies !== undefined && !Array.isArray(taxonomies)) {
      throw new CogentaError({
        code: 'SCHEMA_INVALID',
        message: `${path} exports "taxonomies", but not as an array.`,
        hint: 'Export the array defineTaxonomy() built: export const taxonomies = [category].',
      })
    }

    return {
      collections: collections as CollectionDefinition[],
      taxonomies: (taxonomies ?? []) as TaxonomyDefinition[],
    }
  }

  throw new CogentaError({
    code: 'SCHEMA_INVALID',
    message: `No schema file found next to the configuration (looked for ${SCHEMA_FILE_CANDIDATES.join(', ')}).`,
    hint: 'Create cogenta.schema.ts, default-exporting the array of collections defineCollection() built.',
  })
}

/**
 * The schema file this project actually loads, or `undefined` when it has
 * none.
 *
 * Anything that *writes* the schema back has to target this, not a guessed
 * name: `loadCollections` prefers `cogenta.schema.ts` (the form ADR-0010
 * calls for — TypeScript in git), so a writer that assumed `.mjs` would
 * create tables and then write a file nothing reads, leaving an operator
 * with orphan tables and no collections after the restart it was told to do.
 */
export async function findSchemaFile(projectRoot: string): Promise<string | undefined> {
  for (const candidate of SCHEMA_FILE_CANDIDATES) {
    const path = join(projectRoot, candidate)
    try {
      await stat(path)
      return path
    } catch {
      // Try the next candidate — same order `loadCollections` uses.
    }
  }
  return undefined
}

/**
 * True only when the candidate file itself does not exist — never for a
 * missing import *inside* it, which must surface as a real error rather than
 * silently trying the next candidate filename.
 */
function isModuleNotFound(error: unknown, path: string): boolean {
  if (
    !(
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND'
    )
  ) {
    return false
  }
  // Node's own message embeds the missing specifier either as the file://
  // URL passed to import(), or — observed on Windows — as the raw OS path.
  // Matching only the URL form left every Windows run unable to fall
  // through the candidate list: the first missing extension (typically
  // `.ts`) surfaced as a hard SCHEMA_INVALID instead of trying the next one.
  return error.message.includes(pathToFileURL(path).href) || error.message.includes(path)
}

/**
 * What `/api/assistant` answers with when this process built no assistant at
 * all — a caller that did not ask for one, in a test or an embedding. Exactly
 * what `createAssistToolset` returns with no provider, restated here so
 * `assembleSite` need not construct one to say "off".
 */
const EMPTY_TOOLSET = Object.freeze({
  available: false,
  reason:
    'No AI provider is configured for this site, so the writing assistant is switched off. Everything else in the CMS works exactly the same.',
  tools: Object.freeze([]),
  capabilities: Object.freeze([]),
})

/**
 * What one sweep of the trash auto-purge (fiche 07 task 5) found, one
 * collection at a time. `purgeExpired()` skips a still-`restrict`ed row
 * rather than throwing (see `@cogenta/schema`'s `store.ts`), so this is
 * never partial in a way that needs reporting here — it is simply how many
 * of each collection's expired rows were actually removed.
 */
interface TrashPurgeSummary {
  readonly purged: number
  readonly perCollection: readonly { readonly collection: string; readonly purged: number }[]
}

interface Site {
  readonly db: DatabaseHandle
  readonly auth: AuthStore
  /** `@cogenta/core`'s own package version (fiche 22 tâche 8, part 4) — the admin footer/topbar and, branding permitting, the public footer. */
  readonly cogentaVersion: string
  readonly restRouter: RestRouter
  readonly authRouter: AuthRouter
  readonly mediaRouter: MediaRouter
  readonly auditRouter: AuditRouter
  /** `GET /api/search` — the full-text index, reachable for the first time (L10 task 3). */
  readonly searchRouter: SearchRouter
  /** `GET /api/review` — the editorial workflow's review queue (`schema@2.1`, ADR-0027). */
  readonly reviewRouter: ReviewRouter
  /**
   * `/api/seo` — fiche 13: the admin's only door onto what `@cogenta/seo`
   * actually computes. `POST .../preview` follows `update` on the named
   * collection; `GET .../diagnostics` is admin-only, same as `redirectRouter`
   * and `opsStatusRouter` above.
   */
  readonly seoRouter: SeoRouter
  /**
   * `/api/seo/search-console` — fiche 70 task 4, ADR-0032: the optional,
   * off-by-default Google Search Console connector. Admin-only except its
   * own `callback` route, which Google's browser redirect reaches with no
   * bearer token at all (see the router's own module comment for why that
   * is still safe).
   */
  readonly searchConsoleRouter: SearchConsoleRouter
  /**
   * Self-hosted, cookie-free page-view analytics (`@cogenta/analytics`).
   *
   * `analyticsStore` is the aggregate/write side used both by `analyticsRouter`
   * (`/api/analytics/beacon` and `/api/analytics/summary`) and directly by the
   * admin dashboard widget's server-rendered data. Always mounted — a site
   * with nobody reading the dashboard still collects nothing more than it
   * would with the feature switched off (R1/R2 spirit: purely additive).
   */
  readonly analyticsStore: AnalyticsStore
  readonly analyticsRouter: AnalyticsRouter
  /**
   * Purges event rows (and their daily salts) past the site's configured
   * retention (fiche 27 task 3) — same shape as `tickScheduledPublishing`,
   * ticked by `runServe` on a `setInterval` rather than called ad hoc. Returns
   * how many event rows were dropped, for a test to assert against without
   * waiting for the real interval.
   */
  readonly tickAnalyticsPurge: () => Promise<number>
  /** `/api/taxonomies/*` — terms, mounted apart from content because a taxonomy is not a collection (`schema@2.0`, ADR-0022). */
  readonly taxonomyRouter: TaxonomyRouter
  /** `/api/marketplace/*` — L17's local plugin/theme/skin catalog, reusing `@cogenta/plugins`' real Ed25519 verification unchanged. Always mounted; the catalog is empty until a site configures one. */
  readonly marketplaceRouter: MarketplaceRouter
  /** `/api/menus/*` — navigation menus. Not schema-declared like a taxonomy: created and edited entirely at runtime, so this is always mounted, empty until the admin (or the API) creates the first one. */
  readonly menuRouter: MenuRouter
  /**
   * `/api/patterns/*` — the page builder's motif/model library (fiche 43
   * sub-chantier A). Not schema-declared either: one fixed table, the same
   * one-fixed-table treatment as `menuRouter` above, always mounted and
   * empty until an editor saves the first selection as a pattern.
   */
  readonly patternRouter: PatternRouter
  /**
   * `/api/commerce/*` — contract E's back office (ADR-0024), mounted for the
   * first time. `@cogenta/commerce`'s tables are only created and this
   * router is only present once a site actually reaches this point — a site
   * that never sells anything never pays for it (mirrors the taxonomy story).
   */
  readonly commerceRouter: CommerceAdminRouter
  /**
   * Contract F's own router (ADR-0025) — moderation queue AND the CMS's
   * first public write route, `POST /api/comments`, both dispatched from
   * one mount the way `commerceRouter` above already is.
   */
  readonly commentsRouter: CommentsRouter
  /** Exposed directly, the same way `siteSettingsStore` is, so `theme-render.ts` can read the public thread for a page without an in-process HTTP round trip. */
  readonly commentsStore: CommentStore
  readonly commentsSettingsStore: CommentSettingsStore
  /** `/api/redirects` — admin-only management of the redirect table `cogenta serve` already applies to every public GET (audit follow-up to L10 task 2; extended by fiche 12 with editing, search, patterns and CSV import/export). */
  readonly redirectRouter: RedirectRouter
  /**
   * Prefix redirects (`/blog/*` to `/actualites/*`, fiche 12 task 4) — a
   * second, deliberately simpler table beside `redirects`, checked only when
   * the exact-match table finds nothing. Never a regular expression: see
   * `@cogenta/schema`'s `redirect-patterns.ts` for why that is structural,
   * not a convention someone could accidentally violate.
   */
  readonly redirectPatterns: RedirectPatternStore
  /**
   * Fiche 63, ADR-0028 — the database-backed override layer of a role's
   * permissions. Exposed so `cogenta roles export` and the admin route below
   * share the exact same store a running `cogenta serve` reads, never a
   * second connection to the same table.
   */
  readonly rolePermissionStore: RolePermissionStore
  /**
   * `/api/role-permissions` — admin-only reads and writes of the override
   * table above; a write calls the overlay's `refresh()` before answering,
   * which is what makes the very next request already see it.
   */
  readonly rolePermissionRouter: RolePermissionRouter
  /**
   * The log of public URLs that answered a 404 (fiche 12 task 1). Written on
   * the public GET path in this file's own request handler, read and
   * dismissed through `notFoundRouter` below.
   */
  readonly notFoundLog: NotFoundLogStore
  readonly notFoundLogEnabled: boolean
  /** `/api/not-found` — admin-only reads of `notFoundLog`. Never writes: the log fills itself. */
  readonly notFoundRouter: NotFoundRouter
  /** Drains rows of `notFoundLog` older than its configured retention. Ticked by `runServe`, exposed so a test can call it directly instead of waiting a day. */
  readonly tickNotFoundPurge: () => Promise<number>
  /** `GET /api/security-status` and `GET /api/webhooks-status` — read-only mirrors of the site's configuration file, admin-only (audit follow-up to L10 task 6 / L14 task 1). */
  readonly opsStatusRouter: OpsStatusRouter
  /**
   * `GET|PATCH /api/settings` — the editorial site settings a rédacteur can
   * change without a terminal (fiche 23, ADR-0025's third category: not
   * infrastructure like `opsStatusRouter` above, not a personal preference
   * like the admin's interface language, but a site property stored in the
   * database precisely so it can change without a redeploy).
   */
  readonly siteSettingsRouter: SiteSettingsRouter
  /**
   * The same store `siteSettingsRouter` writes through, exposed directly so
   * an internal caller — `theme-render.ts`'s `homePath` accessor — can read
   * a live value without an in-process HTTP round trip to itself.
   */
  readonly siteSettingsStore: SiteSettingsStore
  /**
   * `GET|PUT /api/admin-theme` — the admin's own runtime template +
   * personalisation (L21 task 2), never the public site's (`themeRouter`,
   * contract D — a distinct surface on purpose, see `admin-theme-router.ts`).
   * Read is public (the login screen needs it before a session exists);
   * write is `admin`-only, checked by the router itself.
   */
  readonly adminThemeRouter: AdminThemeRouter
  /**
   * `GET /api/shell-status` — fiche 35 task 3: one aggregated read for
   * every badge and feature flag the admin's chrome draws (trash count,
   * pending orders, whether the shop has ever sold anything, marketplace
   * updates), so a navigation never fires one request per badge.
   */
  readonly shellStatusRouter: ShellStatusRouter
  /** ADR-0021's half that replaces the MFA sign-in gate: recommendations the admin shows, never a block. */
  readonly noticeRouter: NoticeRouter
  /** `/api/notices/channels/*` — fiche 38 tasks 3-4: linking a channel and its notification preferences. Always mounted; empty until an account links one. */
  readonly noticeChannelSettingsRouter: NoticeChannelSettingsRouter
  /** Refused sign-ins, watched for a run worth alerting on (L14 task 4). `null` when nothing is configured to receive one. */
  readonly securityAlerts: SecurityAlertWatch | null
  /** Account management from the admin instead of `cogenta users create` on a terminal (L11 task 3). */
  readonly usersRouter: UsersRouter
  /** `/api/api-keys` — machine-to-machine bearer credentials, admin-only (L13 task 8). */
  readonly apiKeysRouter: ApiKeysRouter
  /**
   * Per-API-key request quota, checked once by `resolveActor` for every
   * request (fiche 20 task 3, R1). `undefined` only in a test harness that
   * builds a `Site` without going through `runServe` — every real server
   * gets one, selected by `createRateLimitRegistry`, Redis when configured
   * and available, an in-process counter otherwise.
   */
  readonly requestQuota?: RateLimitDriver
  /**
   * `/api/agents` — L22 task 1: a real, persistent `AgentRegistry` this site
   * actually runs (superagent + two example built-ins, seeded on first
   * boot), not the pre-L22 read-only wrapper over a fixed declaration
   * array. Set only when a caller passes `agentsRuntimeConfig` into
   * `assembleSite` — a bare `Site` built by hand (tests included) goes on
   * working unchanged with this omitted.
   */
  readonly agentsRouter?: AgentsRouter
  /** `/api/providers` — L22 task 1bis: which LLM providers this site has enabled, with a masked key. Same optionality as `agentsRouter`, built alongside it from the same `agentsRuntimeConfig`. */
  readonly providersRouter?: ProvidersRouter
  /** `/api/agent-skills` — L22 task 1bis: named instruction text an agent loads into its context. Same optionality as `agentsRouter`. */
  readonly agentSkillsRouter?: AgentSkillsRouter
  /** `/api/prompt-templates` — fiche 45's shared prompt library. Same optionality as `agentsRouter`, built alongside it from the same `agentsRuntimeConfig`. */
  readonly promptTemplatesRouter?: PromptTemplatesRouter
  /**
   * `/api/mcp-connections` — fiche 58 tasks 2/3: external MCP servers this
   * site's own agents may consume. Unlike `agentsRouter`/`providersRouter`/
   * `agentSkillsRouter` above, this one is **not** gated on
   * `agentsRuntimeConfig` — the registry (add/test/expose-tools) is useful
   * on its own, and `assembleSite` always builds the underlying store (see
   * `mcpConnections` near the top of this function).
   */
  readonly mcpConnectionsRouter?: McpConnectionsRouter
  /**
   * `/api/site-plans` — L19 task 7's document-driven planning on a live site.
   *
   * Always mounted, even with no LLM provider: the drafts an installer left
   * behind must still be readable, and the router itself answers
   * `SITE_PLAN_NO_PROVIDER` for the routes that would need a model.
   */
  readonly sitePlanRouter?: SitePlanRouter
  /**
   * `/api/updates` — L22 task 9: checking npm for a newer
   * `@cogenta/core`/`@cogenta/cli`, applying one with a mandatory restore
   * point first. Always mounted — checking and reviewing need no external
   * provider, only outbound network access to registry.npmjs.org, which
   * degrades to an honest per-package `checkError` rather than a broken
   * screen when unavailable (same shape as `sitePlanRouter`'s `SITE_PLAN_NO_PROVIDER`).
   */
  readonly updatesRouter: UpdateRouter
  /**
   * `/api/import` — the admin's counterpart to `cogenta import wordpress` on
   * a terminal. Always mounted: unlike the site planner it needs no external
   * provider, only this site's own database and storage, which `assembleSite`
   * already has in scope.
   */
  readonly importRouter: ImportRouter
  /**
   * `/api/assistant` — L18. Always mounted, even on a site with no AI provider:
   * it is the route that *answers* `{available: false}`, which is what lets the
   * admin panel disappear instead of erroring.
   */
  readonly assistantRouter: AssistantRouter
  /**
   * Contract G (ADR-0026, fiche 16) — form definitions and submissions.
   * Always mounted: a site that never builds a form still creates these
   * tables (unlike commerce, which is opt-in), because the tables are
   * cheap and the alternative — deciding at startup whether to mount a
   * route — is the kind of conditional wiring this file already avoids
   * everywhere else it can.
   */
  readonly formStore: FormStore
  /** `/api/forms/*` — admin CRUD on definitions/submissions, plus the public `POST .../submit`. */
  readonly formsRouter: FormsRouter
  /** Purges submissions past each form's own `retainDays` (fiche 16 task 7's GDPR retention, ADR-0022's `purgeExpired` model). Ticked by `runServe` on a `setInterval`. */
  readonly tickFormsPurge: () => Promise<number>
  /**
   * Sends whatever queued order confirmation/shipment e-mail is due, retrying
   * a transient failure on the next tick (fiche 52 task 2, "file avec
   * reprise"). `null` on a site with no e-mail transport configured — ticked
   * by `runServe` the same way `tickFormsPurge` is.
   */
  readonly tickCommerceEmails:
    | (() => Promise<{
        readonly sent: number
        readonly failed: number
      }>)
    | null
  /** Not routed through `mediaRouter`: serving a binary body is outside the JSON-only `RestResponse` shape, so the file route is handled directly (same treatment `/api/schema` already gets). */
  readonly mediaStore: MediaStore
  readonly storage: StorageDriver
  /** `null` when no image driver loaded — `/_image` then serves originals only. */
  readonly images: MediaImageProcessor | null
  readonly graphqlSchema: GraphQLSchema
  readonly gateway: ReturnType<typeof createContentGateway>
  /**
   * The same layer the gateway and the REST service already ask. Held here so
   * the routes this file serves itself — the page builder's draft render — can
   * ask the one authority too, rather than re-deciding who may edit (R4).
   */
  readonly permissions: PermissionLayer
  /** `.cogenta/schema.json`'s in-memory twin — the admin's only view of the collections (never the schema modules themselves, which are Node code). */
  readonly schemaDocument: SchemaDocument
  /**
   * The redirect table, applied to *every* GET before routing (L10 task 2).
   *
   * It was already reachable through `/api/content/-/by-path`, which only the
   * API's own clients call — a browser asking for a renamed URL never went
   * near it and got a 404 instead of the 301 the rename created.
   */
  readonly redirects: RedirectStore
  readonly collections: readonly CollectionDefinition[]
  readonly taxonomies: readonly TaxonomyDefinition[]
  readonly site: {
    readonly name: string
    readonly url: string
    readonly locales: readonly string[]
    readonly defaultLocale: string
    /** Which page answers an unmatched URL (L14 task 2). `/404` by default. */
    readonly notFoundPath: string
  }
  /** The skin's custom properties plus the theme's own stylesheet, minified into one, as computed once at startup. `null` when neither could be loaded — the theme-render fallback serves unstyled HTML rather than refusing. Kept for callers with no theme wiring; a live request should call `resolveStyles()` instead — see its own comment for why. */
  readonly styles: string | null
  /**
   * The live stylesheet (fiche 14): `theme.tokens.json` overlaid with
   * whatever an `admin` saved from the appearance screen, recomputed on
   * every call rather than cached at startup — this is what makes a saved
   * override show up on the very next page view without a restart. Falls
   * back to the static `styles` above when this instance built no theme
   * wiring (`options.theme` absent — only test harnesses that do not care
   * about appearance omit it).
   */
  readonly resolveStyles: () => Promise<string | null>
  /**
   * The appearance screen's live preview (fiche 14 task 2): renders the
   * given token/CSS candidate without saving it. Absent under the same
   * condition as `themeRouter`.
   */
  readonly previewStyles?: (candidate: {
    readonly tokens?: Record<string, unknown>
    readonly additionalCss?: string
  }) => Promise<string | null>
  /** `/api/theme` (fiche 14). Absent only when this instance built no theme wiring — see `resolveStyles`. */
  readonly themeRouter?: ThemeRouter
  /**
   * The appearance screen's theme *gallery* preview (fiche L24 task 5): the
   * combined skin + stylesheet for an arbitrary theme package **by name**,
   * never just the currently active one — `resolveStyles`/`previewStyles`
   * above both resolve against the active theme only, which is exactly the
   * wrong resolution for "show me what theme X would look like without
   * switching to it". Absent under the same condition every other theme
   * field here is (`options.theme` absent — a test harness with no theme
   * wiring).
   */
  readonly themeGalleryStyles?: (themeName: string) => Promise<string | null>
  /**
   * The active theme *package* name (fiche L23) — `null` for the built-in
   * default. Read live off the same theme-overrides row `resolveStyles`
   * already reads, so a switch made from the appearance screen renders on
   * the very next page view, no restart. `undefined` (not a function at all)
   * under the same condition `themeRouter` is absent — a test harness with
   * no theme wiring renders with the default theme, exactly as before this
   * field existed.
   */
  readonly activeTheme?: () => Promise<string | null>
  /** CORS, security headers and cache-control, applied to every response (L10 task 6). */
  readonly security: SecurityConfig
  /** Live, not cached: a driver that just went down must show as down the next time this is called, not until the process restarts. */
  readonly health: () => Promise<{
    readonly database: HealthReport
    readonly storage: HealthReport
  }>
  /**
   * Drains one batch of due scheduled-publication jobs. `runServe` calls this
   * on a `setInterval` for as long as the process runs — see its comment for
   * why a fixed period is the honest, R1-compliant substitute for a real
   * worker. Exposed so a test can call it directly instead of waiting.
   */
  readonly tickScheduledPublishing: () => Promise<number>
  /**
   * Runs one scheduled audit-integrity check (fiche 21 task 3) and sends the
   * outbound alert when this run is what first finds the chain broken.
   * `runServe` calls this on its own `setInterval`, daily by default; exposed
   * so a test can call it directly instead of waiting a day.
   */
  readonly checkAuditIntegrity: () => Promise<void>
  /**
   * Purges audit-log entries older than `security.audit.retainDays`
   * (T09-01) — `AuditLog.prune()` has existed since fiche 21 task 5 with no
   * caller anywhere in the codebase. A no-op returning `{ pruned: 0 }` when
   * `retainDays` is absent or `0` (never configured, or explicitly "never
   * purge") — the silent "grows without bound" default stays exactly that,
   * silent, unless a site opts in. `runServe` calls this on its own
   * `setInterval`, daily by default; exposed so a test can call it directly
   * instead of waiting a day.
   */
  readonly tickAuditPrune: () => Promise<{ readonly pruned: number }>
  /**
   * Sweeps every collection's trash past its `retainDays` (fiche 07 task 5).
   * `purgeExpired()` has existed on every `ContentStore` since ADR-0022;
   * nothing ever called it, so a site's trash grew forever despite the admin
   * being about to say otherwise. `runServe` calls this on its own
   * `setInterval`, the same shape as `tickScheduledPublishing`. Exposed so a
   * test can call it directly instead of waiting a day.
   */
  readonly tickTrashPurge: () => Promise<TrashPurgeSummary>
  /**
   * Flushes whatever channel notifications fiche 38's notice-to-channel
   * bridge queued for grouping or quiet hours (`@cogenta/channels`'
   * `NotificationDispatcher.flushDue`, unchanged since L6). `runServe` calls
   * this on its own `setInterval`, same shape as `tickScheduledPublishing`.
   */
  readonly tickChannelNotifications: () => Promise<readonly string[]>
  dispose(): Promise<void>
}

/** `relyingPartyId` is the bare host: WebAuthn ties a passkey to a domain, not a URL. */
function webauthnConfigFor(site: { readonly name: string; readonly url: string }) {
  const host = new URL(site.url).hostname
  return { relyingPartyName: site.name, relyingPartyId: host, origin: site.url }
}

interface AssembleSiteOptions {
  readonly db: DatabaseHandle
  readonly collections: readonly CollectionDefinition[]
  /** Declared taxonomies (`schema@2.0`). A site with none passes nothing. */
  readonly taxonomies?: readonly TaxonomyDefinition[]
  readonly signingKey: string
  readonly site: {
    readonly name: string
    readonly url: string
    readonly locales: readonly string[]
    readonly defaultLocale: string
    /** Which page answers an unmatched URL (L14 task 2). `/404` by default. */
    readonly notFoundPath: string
  }
  readonly storage: StorageDriver
  readonly logger: Logger
  readonly health: () => Promise<{
    readonly database: HealthReport
    readonly storage: HealthReport
  }>
  /**
   * L22 task 1/1bis. Absent in a test that does not care — `agentsRouter`/
   * `providersRouter`/`agentSkillsRouter` are then simply not mounted on the
   * returned `Site`, same posture as every other optional router here.
   * `runServe` always passes one, so a real `cogenta serve` always has a
   * live, persistent agent registry from its very first boot.
   */
  readonly agentsRuntimeConfig?: {
    /** Where the three file stores (agent declarations, agent skills, provider config) live — `.cogenta/agents-runtime` under the project root, by convention. */
    readonly dataDir: string
    /** For `deps.scan`, which reads this site's own `package.json`. */
    readonly projectRoot: string
  }
  /** L19 task 7. Absent in a test that does not care; `runServe` always passes one. */
  readonly sitePlans?: SitePlanRouterOptions
  /**
   * Fiche 70 task 4, ADR-0032. Absent means no
   * `COGENTA_SEARCH_CONSOLE_CLIENT_ID`/`_CLIENT_SECRET` is set — the
   * connector is then simply not offered (R1/R2: every other SEO feature is
   * unaffected). The redirect URI is derived from `site.url`, never passed
   * in, so it can never point somewhere this server does not actually serve.
   */
  readonly searchConsole?: {
    readonly clientId: string
    readonly clientSecret: string
  }
  /**
   * `/api/updates` (L22 task 9) — already built by `runServe`, which has the
   * filesystem/network ingredients (`projectRoot`, `env`, npm access) this
   * function itself has no reason to know about. Unlike `sitePlans` above,
   * this is never optional: every real site can check npm for an update
   * even with no LLM provider configured, so there is no "not configured"
   * state for this router to represent.
   */
  readonly updatesRouter: UpdateRouter
  /**
   * L18's toolset, vector store and semantic search.
   *
   * Absent means "this caller did not build one", which is treated exactly like
   * "no AI provider configured": an empty toolset, a route that says so, and no
   * vector indexing on the content stores.
   */
  readonly assistant?: AssistantAssembly
  /** The full-text index, when the caller already built one. Created here otherwise. */
  readonly searchIndex?: SearchDriver
  /**
   * L17's local marketplace catalog. Absent means an empty catalog: the
   * router still mounts and answers, it simply has nothing to list — no
   * caller today configures a distant registry (L13's API keys, which the
   * lot names as that dependency, were never built).
   */
  readonly marketplace?: {
    readonly catalog?: readonly MarketplaceCatalogEntry[]
    readonly trustedPublicKeys?: readonly string[]
  }
  /**
   * "Commencer par une démo en lecture seule" (L9 tâche 12, playground). Every
   * write REST or GraphQL could attempt refuses with `CONTENT_READ_ONLY`
   * instead of landing — wrapped once here, at the one place both transports'
   * stores are actually constructed, so neither can bypass it.
   */
  readonly readOnly?: boolean
  /** `null` when neither the skin nor the theme stylesheet could be loaded — see `joinStyles`. */
  readonly styles?: string | null
  /**
   * `theme.tokens.json`'s directory-independent CSS — the *default* theme
   * package's own stylesheet, loaded once at startup. Used as-is by a caller
   * that passes no `themeCssFor` (a test harness, mainly); a real `cogenta
   * serve` boot passes both, and `resolveStyles()` prefers `themeCssFor` so a
   * switched active theme's stylesheet is what actually gets served.
   */
  readonly themeCss?: string | null
  /**
   * Resolves any installed theme package's own stylesheet by name, memoised
   * per name (`theme-css.ts`'s `createThemeCssResolver`) — what lets
   * `resolveStyles()` serve the *currently active* theme's CSS rather than
   * always the one `themeCss` above snapshot at startup (fiche L23).
   */
  readonly themeCssFor?: (themeName: string) => Promise<string | null>
  /** Fiche 14. Absent only in a test that does not care about appearance. */
  readonly theme?: ThemeRouterOptions
  /**
   * Resizes and re-encodes images at upload (L10 task 5).
   *
   * `null` when no image driver loads on this host: uploads still work and
   * originals are still served, they simply carry no dimensions and no
   * variants. Absent, not broken.
   */
  readonly images?: MediaImageProcessor | null
  /** CORS, security headers and cache-control. */
  readonly security: SecurityConfig
  /**
   * The log of public URLs that answered a 404 (fiche 12 task 1) — on by
   * default, bounded by `maxPaths`, purged past `retainDays`. `enabled:
   * false` stops new entries being recorded; existing ones are still
   * readable and dismissible from the admin screen either way.
   */
  readonly notFoundLog: CogentaConfig['notFoundLog']
  /**
   * The site's outbound webhook configuration, read-only mirrored at
   * `GET /api/webhooks-status` (audit follow-up to L14 task 1). Distinct from
   * `onContentEvent` below: this is the *configuration*, that is the sender
   * built from it.
   */
  readonly webhooks: CogentaConfig['webhooks']
  /**
   * Publishes a content lifecycle event to the site's configured outbound
   * webhooks (L14 task 1). Absent — the default — means the site sends none.
   */
  readonly onContentEvent?: ((event: ContentLifecycleEvent) => Promise<void>) | null
  /**
   * Delivers a non-content event — today only the suspicious-activity alert of
   * L14 task 4 — through the same signed channel as `onContentEvent`. The watch
   * itself is built here, because the rate limiter it reads is constructed
   * here. Absent means the alert is computed for the admin screen but never
   * leaves the site.
   */
  readonly onSecurityEvent?:
    | ((event: string, data: Readonly<Record<string, unknown>>) => Promise<void>)
    | null
  /**
   * Delivers the token `POST /api/auth/forgot-password` issues (L11's
   * forgot-password screen). Absent means the token is issued and thrown
   * away unsent — the route's response is identical either way, since it
   * must never depend on whether the mail could actually go out.
   */
  readonly onForgotPassword?: ((event: ForgotPasswordEvent) => Promise<void>) | null
  /**
   * Delivers the invitation `POST /api/users` (`invite: true`) or its resend
   * route issues (fiche 17 task 1). Absent is the **mandatory R1 fallback**:
   * `createUsersRouter` then falls back to the pre-fiche-17 behaviour — a
   * generated password, shown once — rather than creating an account nobody
   * can ever accept.
   */
  readonly onInvite?: ((event: InvitedUserEvent) => Promise<void>) | null
  /**
   * "Une migration en attente n'est pas signalée" (fiche 24 task 2). Absent
   * means no such notice — every existing test that builds a `Site` without
   * a migrator keeps working, and a site whose migrations were already
   * applied gets an empty list from these callbacks anyway.
   */
  readonly pendingMigrations?: {
    readonly countPending: () => Promise<number>
    readonly hasDestructive: () => Promise<boolean>
  }
  /**
   * The seller's legal identity (contract E, ADR-0024). `undefined` — the
   * default, until a site fills in `billing` in its config — means the
   * invoice route stays unreachable rather than issuing a document with a
   * made-up seller address.
   */
  readonly billing?: CogentaConfig['billing']
  /**
   * Contract E's payment gateway choice (fiche 34 task 3), always resolved
   * (`CogentaConfig['payment']` is never absent, unlike `billing`) — a shop
   * with no key still takes bank transfers (R1/R2). Only a test harness that
   * does not care about the payment-drivers screen omits this, and
   * `assembleSite` then falls back to bank transfer with nothing configured.
   */
  readonly payment?: CogentaConfig['payment']
  /** See `Site.requestQuota` (fiche 20 task 3). Absent means no quota is enforced — only test harnesses omit it. */
  readonly requestQuota?: RateLimitDriver
  /**
   * `GET /api/config-status`'s answer (fiche 23 task 5) — the sections of
   * `cogenta.config.mjs` `ops-settings.tsx` never showed (database driver,
   * cache/queue/storage drivers, LLM/embeddings/image/vector providers) plus
   * the two secret-hygiene warnings (`SecretHygieneReport`). Built once in
   * `runServe` from the same `loadConfig()` result everything else here
   * already reads.
   */
  readonly configStatus: ConfigStatusInput
  /**
   * Live channel adapters for fiche 38's notice-to-channel bridge — the
   * platform clients a deployer built with real credentials (a Telegram bot
   * token, a Slack app token, …), the same way `options.onSecurityEvent` is
   * this file's seam for an already-built sender rather than a place that
   * constructs one. Absent means an empty `ChannelRegistry`: linking a
   * channel and setting preferences on it still works (they only need the
   * database); an actual send then fails with `CHANNEL_UNKNOWN`, which the
   * bridge (`channel-bridge.ts`) always catches — a request never errors
   * because of it, a message is simply never delivered (R1: no channel
   * configured, no notification, never a broken CMS).
   */
  readonly channels?: { readonly registry?: ChannelRegistry }
  /**
   * Events-table retention (fiche 27 task 3). Absent falls back to the
   * schema's own default (400 days) — every real caller passes
   * `loaded.config.analytics`, this only saves a test harness from repeating it.
   */
  readonly analytics?: CogentaConfig['analytics']
  /**
   * Forms notifications (fiche 16 task 5) — the same `FileEmailTransport`
   * already built for account invitations, never a second transport of this
   * file's own. Absent only in a test harness that does not care: the
   * submission still stores, notifications are simply skipped (R1/R2).
   */
  readonly emailTransport?: EmailTransport
}

/**
 * The active theme's own stylesheet, resolved live (fiche L23): reads the
 * currently saved `activeTheme` off the same overrides row `resolveStyles`
 * already reads, then resolves that theme's CSS through the memoised
 * `themeCssFor` (real file I/O happens at most once per theme name, not per
 * request). Falls back to the static `themeCss` snapshot when this instance
 * built no `themeCssFor` — a test harness that only ever renders the default
 * theme, mainly.
 */
async function themeCssForActive(options: AssembleSiteOptions): Promise<string | null> {
  if (options.themeCssFor === undefined) return options.themeCss ?? null
  const overrides = await (options.theme as ThemeRouterOptions).store.get()
  return options.themeCssFor(overrides.activeTheme ?? DEFAULT_THEME_NAME)
}

async function assembleSite(options: AssembleSiteOptions): Promise<Site> {
  const { db, collections, site, storage, logger } = options
  const readOnly = options.readOnly ?? false
  const styles = options.styles ?? null
  const taxonomies = options.taxonomies ?? []
  // Fiche 22 tâche 8, part 4: the one version number shown in the admin
  // footer/topbar and, if branding stays on, the public site footer.
  // Resolved once per site assembly (cached after the first real read across
  // every site a multi-site process serves) and never allowed to fail
  // startup over a cosmetic label — a broken resolution falls back to an
  // honest placeholder instead of refusing to serve the site at all.
  let cogentaVersion: string
  try {
    cogentaVersion = getCoreVersion()
  } catch {
    cogentaVersion = '0.0.0'
  }
  // Taxonomies first: a `f.taxonomy()` field carries a real foreign key into
  // the terms table, which therefore has to exist before the collection does.
  await createSchemaTables(db, collections, taxonomies)

  // Full-text search, connected for the first time (L10 task 3). The index is
  // derived data and creates its own physical table, so a fresh install can
  // index its first entry without a migration having run.
  //
  // Accepted from the caller when there is one: `runServe` builds it before the
  // assistant so the semantic half can be fused with *this* index rather than
  // with a second one over the same table.
  const searchIndex = options.searchIndex ?? (await createSearchIndex({ db }))

  // Scheduled publication (L1's `schedulePublication`/`registerScheduledPublishing`,
  // written and tested from the start but never wired to anything — the admin
  // showed "Scheduled" as a read-only badge). The `database` queue driver is
  // the R1-honest choice: no Redis, no external worker, just a table in the
  // site's own database, drained by `runServe`'s own `setInterval` tick — see
  // the comment there for the lateness this trades for not requiring a
  // persistent process.
  const scheduledPublishQueue = createDatabaseQueue({ db, logger })

  // Built before `storeFor` below so a collection's store can be wrapped with
  // `withRedirectTracking` (fiche 12 task 3): renaming the slug of a
  // published entry must write its 301 in the very same place every other
  // derived write — the search index, the vector index — already happens.
  const redirects = createRedirectStore({ db })
  await redirects.ensureTable()

  // Prefix redirects (fiche 12 task 4) — a second, simpler table checked
  // only when `redirects.resolve()` finds nothing. See `@cogenta/schema`'s
  // `redirect-patterns.ts` for why this is not a merged into `redirects`.
  const redirectPatterns = createRedirectPatternStore({ db })
  await redirectPatterns.ensureTable()

  // Fiche 47 task 4 — moved ahead of its previous position (originally built
  // alongside the notice-to-channel bridge, further down this function) so
  // the forms router below can reuse the very same registry rather than a
  // second one: one live Slack/Discord/Telegram/webhook adapter set per
  // site, not two independently configured ones for two different features.
  const channelRegistry = options.channels?.registry ?? createChannelRegistry([])

  // Forms (contract G, ADR-0026 + fiche 47). Always mounted — see `Site.formStore`'s
  // own comment for why this, unlike commerce, is not opt-in.
  await ensureFormsTables(db)
  const formStore = createFormStore(db)
  // Derived, never the raw signing key itself — same discipline
  // `commentsIpHashSecret` already follows a little further down this
  // function: a leak of this one purpose-specific value must not also be a
  // leak of the JWT signing key. Found necessary by a security review of
  // fiche 47 task 2/3: a `file` field's value carried across a multi-step
  // form's pages must be signed, or a client could forge one (claim any
  // `storageKey` exists) without ever uploading a real byte.
  const formFileSigningSecret = createHash('sha256')
    .update(`${options.signingKey}:form-file-token`)
    .digest('hex')
  const formsRouter = createFormsRouter({
    forms: formStore,
    // Falls back to an in-process limiter rather than leaving the public
    // submit route unprotected when no shared driver was configured (R1) —
    // the same fallback `resolveActor`'s own `requestQuota` parameter takes.
    rateLimit: options.requestQuota ?? createMemoryRateLimiter(),
    ...(options.emailTransport === undefined ? {} : { emailTransport: options.emailTransport }),
    // Fiche 47 task 3 — the same storage driver media uploads already use;
    // a `file` field answers `FORM_FILE_REJECTED` rather than silently
    // accepting bytes when a site somehow has none (never true in practice,
    // `storage` is always resolved by `runServe`, but the router itself
    // stays honest about the dependency rather than assuming it).
    storage,
    fileSigningSecret: formFileSigningSecret,
    // Fiche 47 task 4 — absent channels simply mean no `notifyChannels`
    // entry ever fires (R1), the same shape `emailTransport` already has.
    channelRegistry,
    adminUrl: new URL('/admin', site.url).toString(),
  })

  // The 404 log (fiche 12 task 1) — bounded and purged, never carrying an
  // IP or a user agent. See `@cogenta/schema`'s `not-found-log.ts` for the
  // anti-abuse reasoning `maxPaths` exists for.
  const notFoundLog = createNotFoundLogStore({ db, maxPaths: options.notFoundLog.maxPaths })
  await notFoundLog.ensureTable()

  // Fiche 38 task 1's last named source: a scheduled publication that throws
  // (the handler below) is recorded here rather than only living in the
  // queue driver's own retry bookkeeping, which nothing surfaces to an
  // admin (`ScheduledPublishFailureStore`'s own doc comment says why).
  const scheduledPublishFailures = createScheduledPublishFailureStore(db)
  await scheduledPublishFailures.ensureTable()

  const stores = new Map<string, ContentStore>()
  const storeFor = (collection: CollectionDefinition): ContentStore => {
    const existing = stores.get(collection.name)
    if (existing !== undefined) return existing
    // `siblings` is what lets `delete()` enforce `restrict` in application
    // code (ADR-0022): trashing is an UPDATE, so the foreign key has nothing
    // left to refuse at that moment.
    const created = createContentStore({ db, collection, siblings: collections })
    const guarded = readOnly ? withReadOnlyStore(created) : created
    // Writes the redirect a slug rename on a *published* entry owes (fiche 12
    // task 3). Placed right after the read-only guard, for the same reason
    // scheduling is: a write the guard refused must never leave a redirect
    // behind either.
    const tracked = withRedirectTracking(guarded, {
      collection,
      redirects,
      onError: (error) =>
        logger.error('redirect tracking failed', {
          collection: collection.name,
          error: String(error),
        }),
    })
    // Queues the real publish job for a save that lands as `status:
    // 'scheduled'`. Placed right after the read-only guard so a write that
    // guard refused never reaches the queue either.
    const schedulable = withScheduledPublishEnqueue(tracked, {
      collection,
      queue: scheduledPublishQueue,
      onError: (error) =>
        logger.error('scheduled publish enqueue failed', {
          collection: collection.name,
          error: String(error),
        }),
    })
    // Outermost, so a read-only refusal happens *before* anything is indexed:
    // a write that never landed must not change the index either.
    const indexed = withSearchIndexing(schedulable, {
      collection,
      index: searchIndex,
      onError: (error) =>
        logger.error('search index write failed', {
          collection: collection.name,
          error: String(error),
        }),
    })
    // The semantic half, wrapped the same way and for the same reason (L18
    // task 5): REST and GraphQL are handed the same store instances, so one
    // wrap covers both and neither can write content the index never hears
    // about. Absent entirely when no embedder is available.
    const stored =
      options.assistant?.vectors === undefined
        ? indexed
        : withVectorIndexing(indexed, {
            collection,
            siteId: site.url,
            store: options.assistant.vectors.store,
            embeddings: options.assistant.vectors.embeddings,
            // L22 task 4's per-collection toggle, read live on every write.
            isEnabled: options.assistant.vectors.isEnabled,
            onError: (error) =>
              logger.error('vector index write failed', {
                collection: collection.name,
                error: String(error),
              }),
            onIndexed: () => options.assistant?.vectorInfo?.noteIndexed(),
          })
    // Outermost of all: an event must describe a write that really landed, so
    // it fires after the read-only guard has had its chance to refuse and
    // after the index has been brought back in step. A receiver that rebuilt a
    // page from an event the store then rejected would serve a page that never
    // existed.
    const observed =
      options.onContentEvent == null
        ? stored
        : withLifecycleEvents(stored, {
            collection,
            emit: options.onContentEvent,
            onError: (error) =>
              logger.error('content webhook emit failed', {
                collection: collection.name,
                error: String(error),
              }),
          })
    stores.set(collection.name, observed)
    return observed
  }
  // The gateway (below) reads `stores` directly rather than through
  // `storeFor` — REST's own lazy population left it empty for any
  // collection no REST request had touched yet, which the theme-render
  // fallback (an early GraphQL-gateway caller, not a REST one) hit on its
  // very first request. Populating eagerly here means both callers see the
  // same, already-complete map.
  for (const collection of collections) storeFor(collection)

  // Trash auto-purge (fiche 07 task 5): the collections that actually have a
  // trash, and the window each one keeps it for — computed once, since
  // `collection.trash` cannot change without a restart.
  const trashRetainDaysByCollection: Record<string, number> = {}
  for (const collection of collections) {
    if (collection.trash === false) continue
    trashRetainDaysByCollection[collection.name] =
      collection.trash?.retainDays ?? DEFAULT_TRASH_RETAIN_DAYS
  }
  // `null` until the first tick completes — see `TrashStatus` for why that is
  // the honest answer for the brief window right after startup, rather than
  // claiming a sweep that has not run yet.
  let lastTrashPurgeAt: string | null = null
  let lastTrashPurgeCount: number | null = null

  const tickTrashPurge = async (): Promise<TrashPurgeSummary> => {
    const perCollection: { collection: string; purged: number }[] = []
    for (const collection of collections) {
      if (collection.trash === false) continue
      try {
        const report = await storeFor(collection).purgeExpired()
        perCollection.push({ collection: collection.name, purged: report.purged })
      } catch (error) {
        // One collection's sweep failing (a database hiccup, not the
        // `restrict` case `purgeExpired()` already swallows per row) must
        // not stop the rest of the site's collections from being swept.
        logger.error('trash purge failed', { collection: collection.name, error: String(error) })
      }
    }
    const purged = perCollection.reduce((sum, entry) => sum + entry.purged, 0)
    lastTrashPurgeAt = new Date().toISOString()
    lastTrashPurgeCount = purged
    return { purged, perCollection }
  }

  // ---- Import: preview/apply/status/undo (fiche 25) ---------------------
  //
  // `storeFor` above is reused unchanged: an imported entry goes through the
  // exact same read-only guard, search index and lifecycle event wiring as
  // one typed by hand in the admin. `importTracking` owns two tables of its
  // own (`cogenta_import_runs`/`cogenta_import_items`, never a field on
  // contract A — see `@cogenta/import`'s `tracking.ts`), which is what makes
  // a resumed `apply` skip what an earlier, interrupted attempt already
  // wrote, and what `undoImport` reads to trash exactly what one run
  // created.
  const importTracking = createImportTrackingStore({ db })

  /** The raw uploaded text, kept in the site's own storage driver (never the database — a WXR export can be tens of megabytes, well past what a portable `text` column promises across all three dialects) so `apply` can read it back after `analyze`, possibly in a different request. */
  async function storeImportSource(runId: string, text: string): Promise<void> {
    await storage.put(`imports/${runId}/source.txt`, Buffer.from(text, 'utf8'), {
      contentType: 'text/plain; charset=utf-8',
    })
  }

  async function readImportSource(runId: string): Promise<string> {
    const stream = await storage.get(`imports/${runId}/source.txt`)
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    return Buffer.concat(chunks).toString('utf8')
  }

  function storeForName(name: string): ContentStore | undefined {
    const collection = collections.find((c) => c.name === name)
    return collection === undefined ? undefined : storeFor(collection)
  }

  async function analyzeImportSource(input: {
    readonly source: 'wordpress' | 'csv' | 'json' | 'rss'
    readonly text: string
    readonly createdBy: string | null
    readonly targetCollection?: string
  }): Promise<ImportRun> {
    if (input.source === 'wordpress') {
      const analysis = analyzeWordPress(input.text)
      const run = await importTracking.createRun({
        source: 'wordpress',
        createdBy: input.createdBy,
        analysis,
      })
      await storeImportSource(run.id, input.text)
      return run
    }

    if (input.source === 'json') {
      const records = parseJsonImport(input.text)
      const analysis = analyzeJson(records, collections)
      const run = await importTracking.createRun({
        source: 'json',
        createdBy: input.createdBy,
        analysis,
        total: records.length,
      })
      await storeImportSource(run.id, input.text)
      return run
    }

    // CSV and RSS/Atom share the generic engine and need one target
    // collection to propose a mapping against — the caller's choice if
    // given, the site's first declared collection otherwise, so a preview
    // is never blocked on a decision the mapping screen can still change.
    const target =
      (input.targetCollection === undefined
        ? undefined
        : collections.find((c) => c.name === input.targetCollection)) ?? collections[0]
    if (target === undefined) {
      throw new CogentaError({
        code: 'IMPORT_MAPPING_INVALID',
        message: 'This site declares no collection to import into.',
        hint: 'Add a collection to the schema before importing.',
      })
    }
    const records = input.source === 'csv' ? csvToRecords(input.text) : feedToRecords(input.text)
    const analysis = analyzeGeneric(records, target)
    const run = await importTracking.createRun({
      source: input.source,
      createdBy: input.createdBy,
      analysis,
      mapping: analysis.proposedMapping,
      total: records.length,
    })
    await storeImportSource(run.id, input.text)
    return run
  }

  async function applyImportRun(input: {
    readonly runId: string
    readonly mapping?: unknown
  }): Promise<ImportRun> {
    const run = await importTracking.getRun(input.runId)
    if (run === null) {
      throw new CogentaError({
        code: 'IMPORT_RUN_NOT_FOUND',
        message: `No import run "${input.runId}" exists.`,
        hint: 'Analyze a source first — the response names the runId to apply.',
        details: { id: input.runId },
      })
    }

    const text = await readImportSource(input.runId)
    await importTracking.updateRun(input.runId, { status: 'running' })

    try {
      if (run.source === 'wordpress') {
        const report = await importWordPress(text, {
          db,
          storage,
          tracking: importTracking,
          runId: input.runId,
          // Contract F (ADR-0025) — real status and threading, on posts and
          // pages alike, the same store `/api/comments` itself writes
          // through.
          comments: commentsStore,
        })
        return await importTracking.updateRun(input.runId, {
          status: 'done',
          report,
          progress: { processed: run.progress.total, total: run.progress.total },
        })
      }

      if (run.source === 'json') {
        const records = parseJsonImport(text)
        const report = await applyJson({
          records,
          collections,
          storeFor: (collection) => storeFor(collection),
          tracking: importTracking,
          runId: input.runId,
          createdBy: run.createdBy,
        })
        return await importTracking.updateRun(input.runId, {
          status: 'done',
          report,
          progress: { processed: report.imported + report.resumedSkips, total: run.progress.total },
        })
      }

      // csv / rss
      const records = run.source === 'csv' ? csvToRecords(text) : feedToRecords(text)
      const mapping = (input.mapping ?? run.mapping) as FieldMapping | null
      if (mapping === null) {
        throw new CogentaError({
          code: 'IMPORT_MAPPING_INVALID',
          message:
            'This run has no field mapping — analyze proposed one, but it was never confirmed.',
          hint: 'Send { "mapping": { "targetCollection": "...", "fields": { ... } } } to apply.',
        })
      }
      const report = await applyGeneric({
        records,
        mapping,
        collections,
        storeFor: (collection) => storeFor(collection),
        tracking: importTracking,
        runId: input.runId,
        createdBy: run.createdBy,
      })
      return await importTracking.updateRun(input.runId, {
        status: 'done',
        report,
        mapping,
        progress: { processed: report.imported + report.resumedSkips, total: run.progress.total },
      })
    } catch (error) {
      await importTracking.updateRun(input.runId, {
        status: 'failed',
        error: isCogentaError(error) ? error.message : String(error),
      })
      throw error
    }
  }

  async function cancelImportRun(runId: string): Promise<ImportRun> {
    await undoImport({ tracking: importTracking, runId, storeFor: storeForName })
    const run = await importTracking.getRun(runId)
    if (run === null) {
      throw new CogentaError({
        code: 'IMPORT_RUN_NOT_FOUND',
        message: `No import run "${runId}" exists.`,
        hint: 'Only a run that has been analyzed can be cancelled.',
        details: { id: runId },
      })
    }
    return run
  }

  // The publish half of scheduling: re-reads the entry before acting, so an
  // entry edited back to `draft` — or already published by hand — before its
  // hour comes is left alone rather than redone by a job still sitting in
  // the queue (see `withScheduledPublishEnqueue`, which enqueues again on
  // every save rather than tracking a previous job id).
  registerScheduledPublishing(
    scheduledPublishQueue,
    async (publication) => {
      try {
        const target = stores.get(publication.collection)
        if (target === undefined) return
        const entry = await target.read(publication.entryId, { state: 'working' })
        if (entry?.status === 'scheduled') await target.publish(publication.entryId)
        // A retry that finally lands must make the earlier attempts' failure
        // disappear the same way a fixed migration or a re-enabled plugin
        // does for their own notices — nothing left over to dismiss by hand.
        await scheduledPublishFailures.clear(
          publication.collection,
          publication.entryId,
          publication.locale,
        )
      } catch (error) {
        // Recorded, then re-thrown: the queue's own retry/backoff (up to
        // `maxAttempts`) must still run exactly as before — this notice
        // source is a second, admin-visible witness of the same failure,
        // never a replacement for the queue's own bookkeeping.
        await scheduledPublishFailures
          .record({
            collection: publication.collection,
            entryId: publication.entryId,
            locale: publication.locale,
            error: error instanceof Error ? error.message : String(error),
          })
          .catch((recordError: unknown) =>
            logger.error('failed to record a scheduled-publish failure', {
              error: String(recordError),
            }),
          )
        throw error
      }
    },
    { logger },
  )

  // Fiche 63, ADR-0028: a role's grant on a collection or taxonomy action can
  // live in the database, checked by `PermissionLayer` *before* falling back
  // to this site's `cogenta.schema.*` — never the other way around. The
  // overlay's first `list()` happens here, once, before the layer that
  // consults it is ever built; `rolePermissionRouter` (mounted below) calls
  // `refresh()` after every write so the very next request already sees it,
  // with no restart.
  const rolePermissionStore = createRolePermissionStore({ db, collections, taxonomies })
  const rolePermissionOverlay = await createRolePermissionOverlay(rolePermissionStore)

  const permissions = createPermissionLayer({
    collections,
    rolePermissionOverrides: rolePermissionOverlay,
  })
  const service = createContentService({
    collections,
    permissions,
    storeFor,
    routing: { locales: site.locales, defaultLocale: site.defaultLocale, redirects },
  })

  const auth = await createAuthStore({
    db,
    signingKey: options.signingKey,
    collections,
    issuer: site.name,
    webauthn: webauthnConfigFor(site),
  })

  // One store per taxonomy, made once: a term store holds no state beyond its
  // table, but re-deriving it per request would re-resolve every identifier.
  const taxonomyStores = new Map<string, TaxonomyStore>()
  const taxonomyStoreFor = (taxonomy: TaxonomyDefinition): TaxonomyStore => {
    const existing = taxonomyStores.get(taxonomy.name)
    if (existing !== undefined) return existing
    const created = createTaxonomyStore({ db, taxonomy })
    taxonomyStores.set(taxonomy.name, created)
    return created
  }

  const mediaStore = createDatabaseMediaStore({ db })

  // Fiche 46: the media library's folder tree. Bootstraps a default
  // `contents` root once, idempotently — a fresh site gets it on its very
  // first `cogenta serve`, and an already-provisioned one no-ops here on
  // every subsequent restart (`ensureRoot` finds the existing row rather
  // than creating a second one). Nothing here ever files a pre-existing
  // asset into it: `folder_id` stays `null` (unclassified) for everything
  // uploaded before this fiche, exactly as `MediaAsset.folderId`'s own doc
  // comment promises.
  const mediaFolderStore: MediaFolderStore = createDatabaseMediaFolderStore({ db })
  await mediaFolderStore.ensureRoot('contents')

  // Fiche 58 tasks 2/3/4 — the external MCP connection registry. Table and
  // store exist unconditionally (an admin can wire up a connection and
  // check its tools regardless of whether `agentsRuntimeConfig` is set,
  // same posture as `apiKeysRouter`), but the connections only ever become
  // real `ToolDefinition`s an agent can call when `agentsRuntime` itself is
  // built below — see `mcpConnections` passed into `buildAgentRuntime`.
  await ensureMcpConnectionTables(db)
  const mcpConnections = createMcpConnectionStore(db, { signingKey: options.signingKey })

  // L22 task 1/1bis: the real agent runtime, built here — the one place
  // `service` (this site's real `ContentService`) and `mediaStore` are both
  // already in scope, exactly the way `content.*`/`media.*` contract-C
  // tools need them (mirrors `packages/cli/src/commands/mcp.ts`'s own
  // `buildSiteManifest`). `agentsRuntimeConfig` is optional so a caller
  // that builds a bare `Site` by hand (tests included) is unaffected —
  // `runServe` always supplies it.
  const agentsRuntime: AgentRuntimeAssembly | undefined =
    options.agentsRuntimeConfig === undefined
      ? undefined
      : await buildAgentRuntime({
          dataDir: options.agentsRuntimeConfig.dataDir,
          projectRoot: options.agentsRuntimeConfig.projectRoot,
          // Fiche 58 task 4 — every enabled connection's checked tools are
          // merged into this site's real tool registry, wrapped by the same
          // sandboxed `McpClient` a "test connection" probe uses
          // (`@cogenta/mcp`'s `buildMcpToolDefinitions`, called inside
          // `buildAgentRuntime`'s own `buildToolRegistry`).
          mcpConnections,
          signingKey: options.signingKey,
          site: {
            name: site.name,
            url: site.url,
            locales: site.locales,
            defaultLocale: site.defaultLocale,
          },
          contentService: service,
          mediaStore,
          auditLog: auth.audit,
          logger,
          // L22 task 3: the Site Monitor's own tools — the same `redirects`/
          // `notFoundLog` stores and `collections` this function already
          // built above, never a second instance.
          collections,
          notFoundLog,
          redirects,
        })
  if (agentsRuntime !== undefined) logger.info(agentsRuntime.summary)

  const noticeDismissals = createNoticeDismissalStore(db)
  await noticeDismissals.ensureTable()

  // L17: a local/embedded catalog, not a distant service — L13's API keys,
  // which the lot names as that dependency, were never built. Empty until a
  // site configures one; a marketplace router that always answers is what
  // lets the admin screen render instead of guessing whether one exists.
  await ensurePluginTables(db)
  await ensureMarketplaceTables(db)
  const marketplaceGrants = createPluginGrantStore(db)
  // `ensurePluginTables` above already creates the disabled-plugins table —
  // this is the first thing that ever reads it back (fiche 38 task 1's
  // `plugin-disabled` notice source).
  const pluginDisabled = createPluginDisableStore(db)
  // Fiche 29 task 3 — accumulated real per-run duration/outcome. Nothing in
  // `cogenta serve` actually calls `runPlugin` yet (no live `AgentRegistry`
  // exists anywhere in this repo, the same R2-honest gap already noted for
  // L5/L7/L9/L8) — this store exists and is wired into the marketplace
  // router regardless, so the "installed extensions" screen has a real,
  // testable place to read from the moment a real execution pipeline lands,
  // rather than a second wiring pass.
  const pluginUsage = createPluginUsageStore(db)
  const marketplaceCatalog = createMarketplaceCatalog(options.marketplace?.catalog ?? [])
  const marketplaceInstaller = createMarketplaceInstaller(db, {
    grantStore: marketplaceGrants,
    disableStore: pluginDisabled,
    usageStore: pluginUsage,
    ...(options.marketplace?.trustedPublicKeys === undefined
      ? {}
      : { trustedPublicKeys: options.marketplace.trustedPublicKeys }),
  })

  // Fiche 38 task 2: what has ever been shown to each person, resolved or
  // not — the half of the notice mechanism `NoticeDismissalStore` was never
  // meant to be.
  const noticeHistory = createNoticeHistoryStore(db)
  await noticeHistory.ensureTable()

  // Fiche 38 tasks 3-4: linking a channel to receive notices, and
  // per-(person, channel) preferences. Both tables are database-only — they
  // work with zero live channel adapters configured, which is the R1-honest
  // default (`options.channels?.registry` is where a deployer plugs real
  // ones in).
  await ensureChannelTables(db)
  await ensurePreferenceTables(db)
  const channelLinks = createChannelLinkStore(db)
  const channelPreferences = createPreferenceStore(db)
  // `channelRegistry` itself is built earlier in this function, right before
  // the forms router, and reused here rather than rebuilt.
  const channelDispatcher = createNotificationDispatcher({
    db,
    registry: channelRegistry,
    linkStore: channelLinks,
    preferenceStore: channelPreferences,
    buildAdminUrl: () => `${site.url}/admin/notifications`,
  })
  const noticeChannelBridge = createNoticeChannelBridge({
    dispatcher: channelDispatcher,
    linkedChannelNames: async (userId) =>
      (await channelLinks.listLinkedChannels(userId)).map((link) => link.channelName),
    // Server-side wording for a channel message. The on-screen board
    // translates the same `code`/`params` through i18next (ADR-0019); a
    // channel message has no browser locale to read, so it renders in
    // English — the same honest simplification `formats/report.ts`'s own
    // callers already accept for anything built off-screen.
    render: (entry) => ({
      title: entry.code,
      summary:
        Object.keys(entry.params).length === 0
          ? entry.code
          : `${entry.code} (${Object.entries(entry.params)
              .map(([key, value]) => `${key}: ${value}`)
              .join(', ')})`,
    }),
  })

  // Menus (navigation). Not schema-declared, so one fixed pair of tables
  // rather than one per taxonomy — see `menu-tables.ts`.
  await ensureMenuTables(db)
  const menuStore: MenuStore = createMenuStore({ db })

  // The page builder's motif/model library (fiche 43 sub-chantier A). Same
  // one-fixed-table treatment as menus — a pattern is not schema-declared
  // content either.
  await ensurePatternTables(db)
  const patternStore: PatternStore = createPatternStore({ db })

  // Google Search Console's one stored connection (fiche 70 task 4,
  // ADR-0032) — same one-fixed-table treatment, and the table is always
  // created regardless of whether an OAuth app is configured, so enabling
  // the connector later needs no migration.
  await ensureSearchConsoleConnectionTable(db)
  const searchConsoleStore: SearchConsoleConnectionStore = createSearchConsoleConnectionStore({
    db,
    signingKey: options.signingKey,
  })

  // Editorial site settings (fiche 23, ADR-0025): not schema-declared either
  // — a rédacteur's tagline or homepage choice is not part of the content
  // model — so this gets the same one-fixed-table treatment as menus.
  await ensureSiteSettingsTables(db)
  const siteSettingsStore: SiteSettingsStore = createSiteSettingsStore({ db })

  // The admin's own runtime theme (L21 task 2) — same one-fixed-table
  // treatment, admin-role-only to write, public to read (the login screen
  // needs it before a session exists).
  await ensureAdminThemeTable(db)
  const adminThemeStore: AdminThemeStore = createAdminThemeStore({ db })

  const gateway = createContentGateway({ collections, stores, permissions })

  // Resolves an `entry`-kind menu item to a display label, public route and
  // — for an actor entitled to see it — a health status (fiche 09, task 4).
  //
  // The label/route half always reads through the same permission-checked
  // gateway everything else reads through, as `ANONYMOUS`: a menu is public
  // navigation, so an item's *link* is only ever resolved to what an
  // anonymous visitor could also reach — an unpublished target resolves to
  // `null` rather than leaking a draft's title into a public nav response.
  //
  // `health` is the one piece computed differently, and only sometimes: it
  // is read straight from the collection's own store (bypassing the
  // gateway's published-only default, `trashed: 'include'` so a trashed
  // target reads back rather than looking merely deleted) — but only for an
  // actor whose *role* already has draft access to this collection, the
  // same `roleState` gate every other read of unpublished content goes
  // through (`draft-access.ts`). A public visitor, or an actor without that
  // role, gets exactly the pre-task-4 behaviour: an unresolved item, never a
  // status field announcing that a draft exists.
  const resolveMenuEntry = async (
    collectionName: string,
    entryId: string,
    context: AccessContext,
  ): Promise<{
    readonly label: string
    readonly route: string | null
    readonly health?: MenuItemHealth
  } | null> => {
    const collection = collections.find((candidate) => candidate.name === collectionName)
    if (collection === undefined) return null

    const canSeeDrafts = roleState(permissions, collection, context) === 'working'
    const collectionStore = stores.get(collectionName)
    const privileged =
      canSeeDrafts && collectionStore !== undefined
        ? await collectionStore.read(entryId, { state: 'working', trashed: 'include' })
        : null

    const entry =
      privileged ??
      (await gateway.read(collectionName, entryId, { actor: { id: null, roles: ['public'] } }))
    if (entry === null) return null

    const stringValues = Object.fromEntries(
      Object.entries(entry.values).filter(
        (pair): pair is [string, string] => typeof pair[1] === 'string',
      ),
    )
    const label =
      typeof entry.values.title === 'string'
        ? entry.values.title
        : typeof entry.values.name === 'string'
          ? entry.values.name
          : entryId
    let route: string | null = null
    if (collection.routing !== undefined) {
      try {
        route = buildPath(collection, stringValues, entry.locale ?? undefined)
      } catch {
        // A route field is missing on this entry (e.g. an empty slug on a
        // draft). The item still resolves — with a label, no link — rather
        // than failing the whole menu response over one broken reference.
        route = null
      }
    }

    return {
      label,
      route,
      ...(privileged === null
        ? {}
        : { health: privileged.deletedAt !== null ? 'trashed' : privileged.status }),
    }
  }

  // Resolves a `taxonomy`-kind menu item to a display label (fiche 09, task
  // 4). `route` stays `null`: no site in this codebase renders a taxonomy
  // archive page yet, so there is honestly nowhere for the link to point —
  // adding that route is future work, not a gap this resolver should paper
  // over with a guessed URL. The label picks the site's default locale
  // rather than the visiting locale, since a term's labels carry no request
  // context of their own the way an entry's own `locale` field does.
  const resolveMenuTerm = async (
    taxonomyName: string,
    termId: string,
  ): Promise<{ readonly label: string; readonly route: string | null } | null> => {
    const taxonomy = taxonomies.find((candidate) => candidate.name === taxonomyName)
    if (taxonomy === undefined) return null

    const term = await taxonomyStoreFor(taxonomy).read(termId)
    if (term === null) return null

    const label = term.labels[site.defaultLocale] ?? Object.values(term.labels)[0] ?? term.slug
    return { label, route: null }
  }

  // Contract E (ADR-0024): a whole separate domain, wired the same way the
  // taxonomy tables are — created idempotently, once, here, so a site that
  // never sells anything pays nothing beyond a handful of `create table if
  // not exists` statements it never queries.
  await ensureCommerceTables(db)
  const commerceCatalog = createCatalogStore(db)
  const commerceCustomers = createCustomerStore(db)
  const commerceTax = createTaxStore(db)
  const commerceShipping = createShippingStore(db)
  const commerceCoupons = createCouponStore(db)
  const commerceCarts = createCartStore(db, {
    catalog: commerceCatalog,
    tax: commerceTax,
    shipping: commerceShipping,
    coupons: commerceCoupons,
  })
  const commerceOrders = createOrderStore(db, {
    catalog: commerceCatalog,
    carts: commerceCarts,
    customers: commerceCustomers,
    coupons: commerceCoupons,
  })
  // Contract E's payment gateway (fiche 34 task 3) — the same registry
  // pattern as cache/queue/storage (R1): Stripe and PayPal are both `optimal`
  // and answer only with real credentials the gateway itself accepts, bank
  // transfer is `degraded` and always answers, so a shop is sellable before
  // anyone configures either. `select()` never throws here (`payment.driver`
  // defaults to `'auto'`, and the degraded driver always resolves), unlike
  // database or storage where a named-but-unreachable driver is fatal on
  // purpose.
  const paymentConfig: PaymentConfig = {
    driver: options.payment?.driver ?? 'auto',
    ...(options.payment?.stripeSecretKey === undefined
      ? {}
      : { secretKey: options.payment.stripeSecretKey }),
    ...(options.payment?.stripeWebhookSecret === undefined
      ? {}
      : { webhookSecret: options.payment.stripeWebhookSecret }),
    ...(options.payment?.paypalClientId === undefined
      ? {}
      : { clientId: options.payment.paypalClientId }),
    ...(options.payment?.paypalClientSecret === undefined
      ? {}
      : { clientSecret: options.payment.paypalClientSecret }),
    ...(options.payment?.paypalWebhookId === undefined
      ? {}
      : { webhookId: options.payment.paypalWebhookId }),
    ...(options.payment?.manualInstructions === undefined
      ? {}
      : { transferInstructions: options.payment.manualInstructions }),
  }
  const paymentRegistry = createPaymentRegistry({ logger })
  const paymentSelection = await paymentRegistry.select(paymentConfig)
  const commercePayments = createPaymentStore(db, {
    gateway: paymentSelection.instance,
    orders: commerceOrders,
  })
  const commercePermissions = createCommercePermissions()
  const commerceSubscriptions = createSubscriptionStore(db, {
    catalog: commerceCatalog,
    customers: commerceCustomers,
    orders: commerceOrders,
    payments: commercePayments,
  })
  // Absent until the site fills in `billing` (contract E, ADR-0024): an
  // invoice with a made-up seller address is worse than no invoicing at all,
  // so the route stays unreachable rather than issuing one anyway.
  const billing = options.billing
  const commerceSeller =
    billing === undefined
      ? undefined
      : {
          address: [billing.legalName, ...billing.address],
          ...(() => {
            const footer = [billing.taxId, billing.footer]
              .filter((part): part is string => part !== undefined)
              .join(' — ')
            return footer === '' ? {} : { footer }
          })(),
        }
  const commerceInvoices =
    commerceSeller === undefined
      ? undefined
      : createInvoiceStore(db, { orders: commerceOrders, seller: commerceSeller })
  // A credit note per refund (fiche 52 task 6) needs the same seller details
  // as an invoice — the same gate, deliberately: a credit note without a
  // real seller address is not a usable accounting document either.
  const commerceCreditNotes =
    commerceSeller === undefined
      ? undefined
      : createCreditNoteStore(db, { orders: commerceOrders, seller: commerceSeller })
  // Transactional order e-mails (fiche 52 task 2) — the same degraded-by-default
  // `EmailTransport` every other transactional sender in this file reuses
  // (R1/R2): absent, orders still place and ship, nobody is ever notified.
  const commerceOrderEmails: OrderEmailQueue | undefined =
    options.emailTransport === undefined
      ? undefined
      : createOrderEmailQueue(db, { orders: commerceOrders, transport: options.emailTransport })

  // Contract F (ADR-0025) — a comment is not a collection entry, so its
  // tables are created idempotently here the same way commerce's are above:
  // a site that never receives a comment never pays for them.
  await ensureCommentsTables(db)
  const commentsStore = createCommentStore({ db })
  const commentsSettingsStore = createCommentSettingsStore(db)
  const commentsRateLimiter = createCommentRateLimiter(db)
  const commentsPermissions = createCommentPermissions()
  // Derived, never the raw signing key itself: `hashIp` mixes this secret
  // into every hash, and a comment's IP hash living in the database is a
  // different exposure than the JWT signing key living in the process
  // environment — deriving keeps a leak of one from being a leak of both
  // (R7: read once here, never re-read from the environment by the library).
  const commentsIpHashSecret = createHash('sha256')
    .update(`${options.signingKey}:comments-ip-hash`)
    .digest('hex')
  const commentsRouter = createCommentsRouter({
    store: commentsStore,
    settings: commentsSettingsStore,
    rateLimiter: commentsRateLimiter,
    permissions: commentsPermissions,
    ipHashSecret: commentsIpHashSecret,
    siteDefaults: async () => {
      const [enabledSetting, moderationSetting] = await Promise.all([
        siteSettingsStore.get('discussion.enabled', SITE_SETTINGS_SITE_SCOPE),
        siteSettingsStore.get('discussion.moderationRequired', SITE_SETTINGS_SITE_SCOPE),
      ])
      return {
        enabled: typeof enabledSetting?.value === 'boolean' ? enabledSetting.value : true,
        moderationRequired:
          typeof moderationSetting?.value === 'boolean' ? moderationSetting.value : true,
      }
    },
  })

  await ensureAnalyticsTables(db)
  const analyticsStore = createAnalyticsStore(db)
  const siteHost = new URL(site.url).hostname
  // Mirrors `@cogenta/core`'s `analyticsSchema` default: every real caller
  // passes `loaded.config.analytics`, this only covers a test harness that
  // builds a `Site` directly without going through config resolution.
  const analyticsRetainDays = options.analytics?.retainDays ?? 400

  /**
   * Resolves a stored analytics path to the entry that lives there (fiche 27
   * task 1) — the seam `analytics-router.ts` documents: `@cogenta/analytics`
   * itself knows nothing about collections or routes, so this is where a
   * bare path becomes a title and an admin link, through the exact same
   * `resolveEntry`/permission-checked `gateway` the public page render uses.
   * `undefined` for "no route matches" or "nothing published there any
   * more" — the top-pages table then falls back to the bare path.
   */
  async function resolveAnalyticsPage(
    path: string,
    actor: AccessContext['actor'],
  ): Promise<{ readonly title: string; readonly editHref: string } | undefined> {
    const resolved = await resolveEntry(path, { collections, gateway, site, styles }, { actor })
    if (resolved === null) return undefined
    return {
      title: entryTitle(resolved.entry),
      editHref: `/admin/collections/${encodeURIComponent(resolved.collection.name)}/${encodeURIComponent(resolved.entry.id)}`,
    }
  }

  const reviewRouter = createReviewRouter({ collections, permissions, storeFor })

  return {
    db,
    auth,
    cogentaVersion,
    restRouter: createRestRouter({ service, siteUrl: site.url }),
    authRouter: createAuthRouter({
      auth,
      ...(options.onForgotPassword == null ? {} : { onForgotPassword: options.onForgotPassword }),
    }),
    analyticsStore,
    analyticsRouter: createAnalyticsRouter({
      store: analyticsStore,
      siteHost,
      resolvePage: resolveAnalyticsPage,
      retainDays: analyticsRetainDays,
    }),
    tickAnalyticsPurge: async () => {
      const purged = await analyticsStore.purgeEvents(analyticsRetainDays)
      // Not load-bearing for the purge count a test asserts against — see
      // `AnalyticsStore.purgeSalts`'s own doc — so its own count is not
      // reported here.
      await analyticsStore.purgeSalts(analyticsRetainDays)
      return purged
    },
    mediaRouter: createMediaRouter({
      store: mediaStore,
      storage,
      folders: mediaFolderStore,
      ...(options.images === undefined || options.images === null
        ? {}
        : { images: options.images }),
      // Fiche 46 task 7's own critère ("panneau détail enrichi... usage,
      // déjà en API") needs this real: `findMediaUsage` (fiche 11 task 3)
      // was written and tested but never actually wired here, so
      // `GET /api/media/{id}/usage` always answered "nothing found" on a
      // real server — a gap fiche 46's own admin work would otherwise have
      // silently reproduced (an always-empty usage panel next to a real
      // scan nobody ever asked for). `storeFor`/`collections` are the exact
      // instances every other reader (REST, GraphQL, theme rendering)
      // already shares.
      usage: { collections, storeFor },
      // fiche 23 task 2's "Médias" tab — read fresh on every upload so a
      // changed ceiling applies immediately, no restart needed.
      maxUploadBytes: async () => {
        const setting = await siteSettingsStore.get(
          'media.maxUploadSizeMb',
          SITE_SETTINGS_SITE_SCOPE,
        )
        const mb = typeof setting?.value === 'number' ? setting.value : 15
        return mb * 1024 * 1024
      },
    }),
    auditRouter: createAuditRouter({
      audit: auth.audit,
      // Reuses `ContentService.diff` — the same function
      // `GET /{collection}/{id}/diff` already calls — rather than the audit
      // router re-deriving a structural diff of its own (fiche 21 task 1).
      diff: (actor, name, id, from, to) => service.diff({ actor }, name, id, from, to),
      users: auth.users,
      apiKeys: auth.apiKeys,
      integrity: auth.auditIntegrity,
    }),
    taxonomyRouter: createTaxonomyRouter({
      taxonomies,
      permissions,
      storeFor: (taxonomy) => taxonomyStoreFor(taxonomy),
      // Wires `?counts=1`/`?unused=1` (08-taxonomies.md, task 3): every real
      // server has a database and a collection set, so this is never left out
      // here — only the router's own tests exercise the "no usage source"
      // degradation.
      usage: { db, collections },
    }),
    marketplaceRouter: createMarketplaceRouter({
      catalog: marketplaceCatalog,
      installer: marketplaceInstaller,
      disableStore: pluginDisabled,
      usageStore: pluginUsage,
      grantStore: marketplaceGrants,
      describeCapability,
    }),
    menuRouter: createMenuRouter({
      store: menuStore,
      resolveEntry: resolveMenuEntry,
      resolveTerm: resolveMenuTerm,
    }),
    patternRouter: createPatternRouter({ store: patternStore }),
    siteSettingsRouter: createSiteSettingsRouter({
      store: siteSettingsStore,
      defaultLocale: site.defaultLocale,
    }),
    siteSettingsStore,
    adminThemeRouter: createAdminThemeRouter({ store: adminThemeStore }),
    commerceRouter: createCommerceAdminRouter({
      catalog: commerceCatalog,
      orders: commerceOrders,
      customers: commerceCustomers,
      payments: commercePayments,
      coupons: commerceCoupons,
      subscriptions: commerceSubscriptions,
      tax: commerceTax,
      shipping: commerceShipping,
      ...(commerceInvoices === undefined ? {} : { invoices: commerceInvoices }),
      ...(commerceCreditNotes === undefined ? {} : { creditNotes: commerceCreditNotes }),
      ...(commerceOrderEmails === undefined ? {} : { orderEmails: commerceOrderEmails }),
      payment: {
        registry: paymentRegistry,
        config: paymentConfig,
        testMode: options.payment?.testMode ?? true,
        // Informational only — see `router.ts`'s own comment: no inbound
        // route answers this path yet (deferred, `BLOCKERS.md`).
        webhookUrl: `${site.url.replace(/\/+$/u, '')}/api/commerce/payments/webhook`,
      },
      permissions: commercePermissions,
    }),
    commentsRouter,
    commentsStore,
    commentsSettingsStore,
    redirectRouter: createRedirectRouter({ store: redirects, patterns: redirectPatterns }),
    redirectPatterns,
    rolePermissionStore,
    rolePermissionRouter: createRolePermissionRouter({
      store: rolePermissionStore,
      overlay: rolePermissionOverlay,
    }),
    formStore,
    formsRouter,
    tickFormsPurge: async () => (await formStore.submissions.purgeExpired()).purged,
    tickCommerceEmails:
      commerceOrderEmails === undefined ? null : () => commerceOrderEmails.flushDue(),
    notFoundLog,
    notFoundLogEnabled: options.notFoundLog.enabled,
    notFoundRouter: createNotFoundRouter({ store: notFoundLog }),
    tickNotFoundPurge: () => notFoundLog.purge(options.notFoundLog.retainDays),
    opsStatusRouter: createOpsStatusRouter({
      security: options.security,
      webhooks: options.webhooks,
      trash: (): TrashStatus => ({
        retainDaysByCollection: trashRetainDaysByCollection,
        lastRunAt: lastTrashPurgeAt,
        lastPurged: lastTrashPurgeCount,
      }),
      config: options.configStatus,
    }),
    shellStatusRouter: createShellStatusRouter({
      content: service,
      trashableCollections: collections
        .filter((collection) => collection.trash !== false)
        .map((collection) => collection.name),
      commerceOrders,
      commerceCatalog,
      marketplaceCatalog,
      marketplaceInstaller,
      ...(collections.some((collection) => collection.workflow?.enabled === true)
        ? { reviewQueue: reviewRouter }
        : {}),
      comments: commentsStore,
      forms: { countUnread: () => formStore.submissions.unreadCount() },
      cogentaVersion,
    }),
    searchRouter: createSearchRouter({
      index: searchIndex,
      collections,
      permissions,
      defaultLocale: site.defaultLocale,
      // Real excerpts (fiche 36 task 3): the gateway is already built above
      // with the same stores and permissions REST/GraphQL use.
      gateway,
    }),
    seoRouter: createSeoRouter({
      collections,
      gateway,
      permissions,
      site: seoSiteFor(site),
      // Read fresh on every diagnostic scan / preview (fiche 21 task 3) —
      // see `SeoRouterOptions.titleDefaults`'s own doc comment for why this
      // is a getter rather than a value captured once at server startup.
      titleDefaults: async () => {
        const defaults = await readSeoRenderDefaults(siteSettingsStore)
        return {
          titleTemplate: defaults.titleTemplate,
          collectionTitleTemplates: defaults.collectionTitleTemplates,
        }
      },
      // Fiche 50 task 4 — read fresh, same reasoning as `titleDefaults`: the
      // Diagnostics screen's robots.txt preview must show the exact document
      // `/robots.txt` serves, not a stale one from before a custom rule was
      // saved.
      robotsCustomRules: async () =>
        (await readSeoRenderDefaults(siteSettingsStore)).robotsCustomRules,
    }),
    searchConsoleRouter: createSearchConsoleRouter({
      store: searchConsoleStore,
      signingKey: options.signingKey,
      // A URL-prefix property (the form GSC's own UI defaults to) — always
      // exactly one trailing slash, whatever `site.url` was written as.
      siteUrl: `${site.url.replace(/\/+$/u, '')}/`,
      ...(options.searchConsole === undefined
        ? {}
        : {
            oauth: {
              clientId: options.searchConsole.clientId,
              clientSecret: options.searchConsole.clientSecret,
              redirectUri: `${site.url.replace(/\/+$/u, '')}/api/seo/search-console/callback`,
            },
          }),
    }),
    // The review queue (`schema@2.1`, ADR-0027, fiche 37 task 3).
    reviewRouter,
    securityAlerts:
      options.onSecurityEvent == null
        ? null
        : createSecurityAlertWatch({
            rateLimit: auth.rateLimit,
            send: options.onSecurityEvent,
            siteUrl: site.url,
            logger,
          }),
    noticeRouter: createNoticeRouter({
      // The seam is the array (fiche 38 task 1): a new recommendation is one
      // more entry here and nothing else anywhere — the router, the store
      // and the admin board are all unaware how many there are.
      sources: [
        createMfaRecommendationSource({ collections, credentials: auth.credentials }),
        // The failed-sign-in table has been written to since L2 and read by
        // nothing but the limiter's own counter (L14 task 4). One extra source
        // in this array is the whole wiring — the seam the notice mechanism was
        // designed around.
        createSuspiciousActivitySource({ rateLimit: auth.rateLimit }),
        // "Une clé qui expire sans prévenir casse une intégration en
        // production" (fiche 20 task 1) — one more source, no change to the
        // router, the store or the admin's notice board.
        createApiKeyExpiryNoticeSource({ apiKeys: auth.apiKeys, href: '/api-keys' }),
        // Fiche 21 task 3's on-screen half: recomputed from the scheduled
        // check's persisted status on every load, so it disappears on its
        // own once a forced full check reports the chain intact again.
        createAuditIntegritySource({ integrity: auth.auditIntegrity }),
        // Fiche 18 task 1: signing in with a recovery code is exactly what a
        // stolen batch of codes would also produce, so the account that just
        // did it is told, and can look at its own sessions and remaining codes.
        createRecoveryCodeUsedNoticeSource({ audit: auth.audit }),
        // Fiche 24 task 2's second bullet. Absent (a caller with no migrator)
        // means the array simply does not grow.
        ...(options.pendingMigrations === undefined
          ? []
          : [createPendingMigrationsSource(options.pendingMigrations)]),
        // A plugin `@cogenta/plugins` killed for a timeout/memory/crash
        // violation (L7 task 6) stayed disabled with nothing on screen
        // saying so, until fiche 38.
        createPluginDisabledSource({
          listDisabled: () => pluginDisabled.listDisabled(),
          pluginsHref: '/marketplace',
        }),
        // "Contenu programmé dont la publication a échoué" — fiche 38 task 1.
        createScheduledPublishFailedSource({
          listFailed: () => scheduledPublishFailures.list(),
          entryHref: (record) => `/collections/${record.collection}/${record.entryId}`,
        }),
        // L22 task 3: a redirect the Site Monitor agent proposed under
        // `co-pilot` autonomy, still pending — absent (no agent runtime
        // configured) means the array simply does not grow, same as the
        // pending-migrations source above.
        ...(agentsRuntime === undefined
          ? []
          : [
              createMonitoringRedirectSuggestionSource({
                approvalQueue: agentsRuntime.approvalQueue,
                redirects,
              }),
            ]),
      ],
      dismissals: noticeDismissals,
      // Fiche 38 tasks 2-3: history for the notification centre, and the
      // channel bridge that notifies whatever this person has linked —
      // both optional on the router itself, both always supplied here.
      history: noticeHistory,
      channelBridge: noticeChannelBridge,
    }),
    noticeChannelSettingsRouter: createNoticeChannelSettingsRouter({
      linkStore: channelLinks,
      preferenceStore: channelPreferences,
    }),
    usersRouter: createUsersRouter({
      auth,
      collections,
      // T09-04/RGPD: `GET /{id}/personal-data` walks every collection for
      // entries this account authored — the same `storeFor` REST, GraphQL
      // and theme rendering already share.
      storeFor,
      ...(options.onInvite == null ? {} : { onInvite: options.onInvite }),
    }),
    apiKeysRouter: createApiKeysRouter({ auth }),
    ...(options.requestQuota === undefined ? {} : { requestQuota: options.requestQuota }),
    assistantRouter: createAssistantRouter({
      toolset: (options.assistant?.toolset ?? EMPTY_TOOLSET) as AssistToolsetLike,
      collections,
      permissions,
      site,
      logger,
      ...(options.assistant?.vectorInfo === undefined
        ? {}
        : { vectorInfo: options.assistant.vectorInfo }),
      ...(options.assistant?.documents === undefined
        ? {}
        : { documents: options.assistant.documents }),
    }),
    ...(agentsRuntime === undefined
      ? {}
      : {
          agentsRouter: createAgentsRouter({
            agents: agentsRuntime.agentRegistry,
            audit: auth.audit,
            runner: agentsRuntime.agentRunner,
          }),
          providersRouter: createProvidersRouter({ providers: agentsRuntime.providerRegistry }),
          agentSkillsRouter: createAgentSkillsRouter({ skills: agentsRuntime.skillRegistry }),
          promptTemplatesRouter: createPromptTemplatesRouter({
            templates: agentsRuntime.promptTemplateRegistry,
          }),
        }),
    mcpConnectionsRouter: createMcpConnectionsRouter({
      connections: mcpConnections,
      logger,
      // Fiche 58 task 4 — a connection created/tested/toggled/exposed here
      // takes effect on this runtime's very next tool lookup, no restart
      // (see `AgentRuntimeAssembly.refreshMcpTools`'s own comment). A no-op
      // when `agentsRuntimeConfig` was never given (no agent runtime to
      // refresh) — the registry itself still works standalone either way.
      onMutated: async () => {
        await agentsRuntime?.refreshMcpTools()
      },
    }),
    ...(options.sitePlans === undefined
      ? {}
      : { sitePlanRouter: createSitePlanRouter(options.sitePlans) }),
    updatesRouter: options.updatesRouter,
    importRouter: createImportRouter({
      // `db`/`storage` are the very ones already in scope for the rest of
      // this function — `@cogenta/import`'s real importer, unchanged, never
      // reimplemented here (R9: this package gains no dependency on it, only
      // `@cogenta/cli` does, which already had one for the terminal command).
      runWordPressImport: (xml) => importWordPress(xml, { db, storage, comments: commentsStore }),
      analyze: analyzeImportSource,
      apply: applyImportRun,
      getRun: (id) => importTracking.getRun(id),
      listRuns: () => importTracking.listRuns(),
      cancel: cancelImportRun,
    }),
    mediaStore,
    storage,
    images: options.images ?? null,
    graphqlSchema: buildContentSchema({ collections }),
    gateway,
    permissions,
    schemaDocument: buildSchemaDocument(
      collections,
      { locales: site.locales, defaultLocale: site.defaultLocale },
      taxonomies,
    ),
    redirects,
    collections,
    taxonomies,
    site,
    styles,
    resolveStyles:
      options.theme === undefined
        ? async () => styles
        : async () =>
            computeEffectiveStyles(
              options.theme as ThemeRouterOptions,
              await themeCssForActive(options),
            ),
    ...(options.theme === undefined
      ? {}
      : {
          previewStyles: async (candidate: {
            readonly tokens?: Record<string, unknown>
            readonly additionalCss?: string
          }) =>
            computePreviewStyles(
              options.theme as ThemeRouterOptions,
              await themeCssForActive(options),
              candidate,
            ),
        }),
    ...(options.theme === undefined ? {} : { themeRouter: createThemeRouter(options.theme) }),
    ...(options.theme === undefined
      ? {}
      : {
          themeGalleryStyles: async (themeName: string) =>
            computeEffectiveStyles(
              options.theme as ThemeRouterOptions,
              options.themeCssFor === undefined
                ? (options.themeCss ?? null)
                : await options.themeCssFor(themeName),
            ),
        }),
    ...(options.theme === undefined
      ? {}
      : {
          activeTheme: async () =>
            (await (options.theme as ThemeRouterOptions).store.get()).activeTheme,
        }),
    security: options.security,
    health: options.health,
    tickScheduledPublishing: () => scheduledPublishQueue.tick(),
    checkAuditIntegrity: async () => {
      const result = await auth.auditIntegrity.check()
      if (!result.newlyBroken) return
      await sendAuditIntegrityAlert(result.status, {
        send: options.onSecurityEvent ?? null,
        siteUrl: site.url,
        logger,
      })
    },
    tickAuditPrune: async () => {
      const retainDays = options.security.audit.retainDays
      // `undefined` (never configured) and `0` (the explicit "never purge"
      // opt-out) are the same instruction here — see `tickAuditPrune`'s own
      // interface comment and `auditRetentionSchema` (`@cogenta/core`).
      if (retainDays === undefined || retainDays === 0) return { pruned: 0 }
      const cutoff = new Date(Date.now() - retainDays * 24 * 60 * 60 * 1000).toISOString()
      const result = await auth.audit.prune(cutoff)
      // The purge is itself an event the audit log has to carry — the same
      // rule the RGPD export follows (`users-router.ts`'s `personalDataRoute`):
      // a retention sweep that deletes rows without a trace of having run
      // would defeat the very audit trail it is trimming.
      await auth.audit.record({
        actorId: null,
        actorRoles: [],
        action: 'audit.prune',
        diff: { retainDays, cutoff, prunedCount: result.prunedCount },
      })
      return { pruned: result.prunedCount }
    },
    tickTrashPurge,
    tickChannelNotifications: () => channelDispatcher.flushDue(),
    dispose: async () => {
      // Fiche 58 task 4 — kills every spawned MCP server process and
      // removes every sandbox working directory before the database (and
      // everything else) goes away. A no-op when no connection was wired.
      // `.catch()` matches this same function's own posture just below
      // (`site.dispose().catch(...)` at the call site) — a failure tearing
      // down one resource must never skip closing the rest.
      await agentsRuntime?.mcpDispose().catch((error: unknown) => {
        logger.error('mcp dispose failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      })
      await scheduledPublishQueue.close()
      await db.close()
    },
  }
}

/**
 * No route on this server takes a JSON body anywhere near this size — the
 * one exception, `/api/site-plans`, already caps its base64 document
 * payloads at 60 MiB total inside `site-plan-router.ts`. This is a ceiling
 * above that, not a route-specific limit: `readBody` runs for every mutating
 * request, most of them long before any permission check, so an unbounded
 * read here was a way for an anonymous caller to make the server buffer an
 * arbitrarily large body before ever being told no.
 */
const MAX_REQUEST_BODY_BYTES = 64 * 1024 * 1024

async function readRawBodyBuffer(req: IncomingMessage): Promise<Buffer | undefined> {
  const chunks: Buffer[] = []
  let total = 0
  let tooLarge = false
  for await (const chunk of req) {
    const buf = chunk as Buffer
    total += buf.length
    if (total > MAX_REQUEST_BODY_BYTES) {
      // Bound memory by not buffering any more chunks, but keep draining the
      // socket rather than destroying it: a client mid-write over the same
      // TCP connection this response has to go out on can be reset by an
      // early `req.destroy()`, which loses the 413 response along with it.
      // Letting the read finish costs bandwidth, never unbounded memory.
      tooLarge = true
      continue
    }
    chunks.push(buf)
  }
  if (tooLarge) {
    throw new CogentaError({
      code: 'REQUEST_BODY_TOO_LARGE',
      message: `The request body exceeds the ${MAX_REQUEST_BODY_BYTES}-byte limit.`,
      hint: 'Send a smaller payload.',
    })
  }
  if (chunks.length === 0) return undefined
  return Buffer.concat(chunks)
}

/**
 * `application/x-www-form-urlencoded` — the plain no-JS `<form>` shape
 * (public comment form, fiche 15 task 6; public form submissions, fiche 16
 * task 3: "sans JavaScript, le formulaire doit fonctionner") — and, since
 * fiche 47 task 3, real `multipart/form-data` too: the one shape a browser's
 * own `<input type="file">` forces its enclosing `<form>` into, with no
 * JavaScript involved. Parsed with the exact same zero-dependency parser
 * `@cogenta/api`'s media route already relies on
 * (`parseMultipartFormData`/`isMultipartFormData`), read here as raw bytes
 * rather than as UTF-8 text — decoding a binary upload as UTF-8 first would
 * corrupt it before the parser ever saw it. Every other route on this server
 * still only ever sends JSON, so neither branch fires for them. A repeated
 * urlencoded key (a `choiceMulti` field's checkboxes) collects into an array
 * rather than keeping only the last value, which is what a naive
 * `Object.fromEntries` would silently do.
 */
async function readBody(req: IncomingMessage): Promise<unknown> {
  const buffer = await readRawBodyBuffer(req)
  if (buffer === undefined || buffer.length === 0) return undefined

  const contentType = req.headers['content-type'] ?? ''

  if (contentType.includes('multipart/form-data')) {
    return parseMultipartFormData(buffer, contentType)
  }

  const text = buffer.toString('utf8')
  if (text.trim().length === 0) return undefined

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(text)
    const body: Record<string, string | string[]> = {}
    for (const key of params.keys()) {
      const values = params.getAll(key)
      body[key] = values.length > 1 ? values : (values[0] ?? '')
    }
    return body
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: 'The request body is not valid JSON.',
      hint: 'Send a JSON body with a matching Content-Type, or no body at all.',
    })
  }
}

function toRestRequest(req: IncomingMessage, url: URL, body: unknown): RestRequest {
  const query: Record<string, string | readonly string[] | undefined> = {}
  for (const key of url.searchParams.keys()) {
    const values = url.searchParams.getAll(key)
    query[key] = values.length > 1 ? values : values[0]
  }

  const headers: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(req.headers)) {
    headers[key] = Array.isArray(value) ? value.join(', ') : value
  }

  return {
    method: req.method ?? 'GET',
    path: url.pathname,
    query,
    headers,
    ...(body === undefined ? {} : { body }),
  }
}

/**
 * `CommerceRequest`'s `query` is single-valued (contract E has no route that
 * takes a repeated key), unlike `RestRequest`'s — so this is its own small
 * adapter rather than a cast of `toRestRequest`'s output.
 */
function toCommerceRequest(req: IncomingMessage, url: URL, body: unknown): CommerceRequest {
  const query: Record<string, string | undefined> = {}
  for (const key of url.searchParams.keys()) {
    query[key] = url.searchParams.get(key) ?? undefined
  }
  return {
    method: req.method ?? 'GET',
    path: url.pathname,
    query,
    ...(body === undefined ? {} : { body }),
  }
}

/**
 * `CommentsRequest`'s own adapter, carrying the two fields the public write
 * route needs that no other router does: the caller's IP (hashed inside
 * `@cogenta/comments`, never here — R7-adjacent: this layer reads it once
 * off the socket and hands it to the one function allowed to hash it) and
 * the user agent, both purely informational for the moderation queue.
 */
/**
 * The public thread for one entry (fiche 15 task 6) — resolves the same
 * inheritance chain (`effectiveEnabled`) the public POST route enforces, so
 * "may I comment here" never disagrees between the form and the page that
 * renders it.
 */
async function commentsForEntry(
  site: Site,
  collection: string,
  entryId: string,
  // A comment is not localised (ADR-0025) — every comment on an entry shows
  // regardless of which translation a visitor is reading, so this parameter
  // exists only to match `ThemeRenderOptions['comments']['forEntry']`'s
  // signature, not because it is read here.
  _locale: string | null,
): Promise<{ readonly open: boolean; readonly items: readonly PublicComment[] }> {
  const [entrySettings, collectionSettings, enabledSetting, comments] = await Promise.all([
    site.commentsSettingsStore.getEntry(collection, entryId),
    site.commentsSettingsStore.getCollection(collection),
    site.siteSettingsStore.get('discussion.enabled', SITE_SETTINGS_SITE_SCOPE),
    site.commentsStore.listApprovedForEntry(collection, entryId),
  ])
  const siteDefault = typeof enabledSetting?.value === 'boolean' ? enabledSetting.value : true
  const open = effectiveEnabled(entrySettings, collectionSettings, siteDefault)
  return {
    open,
    items: comments.map((comment) => ({
      id: comment.id,
      parentId: comment.parentId,
      authorName: comment.authorName,
      authorUrl: comment.authorUrl,
      body: comment.body,
      createdAt: comment.createdAt,
    })),
  }
}

/**
 * `branding.showCogentaBranding` / `branding.customLogoMediaId` (fiche L21
 * task 8), read live off the same `SiteSettingsStore` every other public
 * settings read already uses — never cached at startup, for the same reason
 * `homePath` above is not: turning Cogenta's credit off has to show up on
 * the very next page view, not the next restart.
 */
async function brandingForSite(site: Site): Promise<BrandingSettings> {
  const [showSetting, logoSetting] = await Promise.all([
    site.siteSettingsStore.get('branding.showCogentaBranding', SITE_SETTINGS_SITE_SCOPE),
    site.siteSettingsStore.get('branding.customLogoMediaId', SITE_SETTINGS_SITE_SCOPE),
  ])
  const showCogentaBranding = typeof showSetting?.value === 'boolean' ? showSetting.value : true
  const customLogoMediaId =
    typeof logoSetting?.value === 'string' && logoSetting.value !== '' ? logoSetting.value : null
  return { showCogentaBranding, customLogoMediaId, cogentaVersion: site.cogentaVersion }
}

/**
 * The active theme *package* name (fiche L23), or `null` for the built-in
 * default — `site.activeTheme` is absent only when this instance built no
 * theme wiring (a test harness that does not care about appearance), which
 * `theme-render.ts`'s own `themeFor` already treats identically to `null`.
 */
async function activeThemeForSite(site: Site): Promise<string | null> {
  return site.activeTheme === undefined ? null : site.activeTheme()
}

function toCommentsRequest(req: IncomingMessage, url: URL, body: unknown): CommentsRequest {
  const query: Record<string, string | undefined> = {}
  for (const key of url.searchParams.keys()) {
    query[key] = url.searchParams.get(key) ?? undefined
  }
  // The connecting socket's address only — never `x-forwarded-for`, a
  // client-supplied header this server has no trusted-proxy list to
  // validate. Trusting it here would let a single attacker rotate a
  // fake IP per request to defeat the per-IP rate limit and, worse, the
  // "already has an approved comment from this IP" auto-approve rule
  // (`clientIpOf`'s own comment explains why analytics can afford to be
  // wrong here and moderation cannot).
  const ip = clientIpOf(req)
  const userAgent = req.headers['user-agent']
  return {
    method: req.method ?? 'GET',
    path: url.pathname,
    query,
    ip,
    userAgent: Array.isArray(userAgent) ? (userAgent[0] ?? null) : (userAgent ?? null),
    ...(body === undefined ? {} : { body }),
  }
}

/**
 * The connecting socket's address — never trusted as anything more than an
 * input to the daily session hash (`@cogenta/analytics`'s `hashSession`).
 * No `x-forwarded-for` handling: trusting a client-supplied header for
 * anything security- or privacy-relevant needs a configured trusted-proxy
 * list this server does not have, and a wrong guess here would only ever
 * make analytics *less* accurate, never leak anything (the header is never
 * stored, only hashed).
 */
function clientIpOf(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? 'unknown'
}

function responseId(response: RestResponse): string | undefined {
  const data = (response.body as { readonly data?: { readonly id?: unknown } } | null)?.data
  return typeof data?.id === 'string' ? data.id : undefined
}

/**
 * The content version a create/update/restore/publish response just
 * produced — `SerialisedEntry.version`, a system field on every serialised
 * entry. Feeds `RecordAuditInput.version` (fiche 21 task 1), which is what
 * lets the audit detail view ask `GET .../diff?from={version-1}&to={version}`
 * instead of re-deriving one.
 */
function responseVersion(response: RestResponse): number | undefined {
  const data = (response.body as { readonly data?: { readonly version?: unknown } } | null)?.data
  return typeof data?.version === 'number' ? data.version : undefined
}

/**
 * The audit action a `/api/content/*` request stands for, or `null` for a
 * read (`history`/`diff`/`preview`/`translations`, or an unrecognised
 * sub-route this layer should not guess about).
 *
 * Found while wiring the trash screen's "deleted by" column (fiche 07 task
 * 3): `untrash` and `purge` fell through to `null` here, alongside
 * `unpublish` and `duplicate` — four real mutations silently missing from
 * the audit log despite the header comment above claiming every mutation
 * lands in it. All four are real writes and are named the same way
 * `publish`/`restore` already were.
 */
function contentAuditAction(method: string, subAction: string | undefined): string | null {
  switch (subAction) {
    case 'publish':
      return 'content.publish'
    case 'unpublish':
      return 'content.unpublish'
    case 'duplicate':
      return 'content.duplicate'
    case 'restore':
      return 'content.restore'
    case 'untrash':
      return 'content.untrash'
    case 'purge':
      return 'content.purge'
    case 'history':
    case 'diff':
    case 'preview':
    case 'translations':
      return null
    case undefined:
      if (method === 'POST') return 'content.create'
      if (method === 'PATCH' || method === 'PUT') return 'content.update'
      if (method === 'DELETE') return 'content.delete'
      return null
    default:
      return null
  }
}

/**
 * Every mutation lands in `@cogenta/auth`'s hash-chained audit log
 * (`packages/auth/src/audit.ts`), which existed since L2's own `AuthStore`
 * was built but had no writer until now. Recording here, at the transport
 * boundary, rather than inside `ContentService`/`MediaRouter`, means every
 * route that mutates something is covered by one place instead of every
 * write path remembering to call it — the same reasoning that keeps actor
 * resolution itself at this layer rather than duplicated per route.
 *
 * Never blocks or fails the response it is auditing: a write that succeeded
 * must reach the caller whether or not the audit row could be appended, and
 * a broken audit log is something `verify()` surfaces on its own.
 */
async function recordContentAudit(
  site: Site,
  actor: AccessContext['actor'],
  method: string,
  pathname: string,
  body: unknown,
  response: RestResponse,
  logger: Logger,
): Promise<void> {
  if (response.status < 200 || response.status >= 300) return
  const segments = pathname
    .replace(/^\/api\/content\/?/u, '')
    .split('/')
    .filter((segment) => segment.length > 0)
  const [collection, id, subAction] = segments
  if (collection === undefined || collection === '-') return

  const action = contentAuditAction(method, subAction)
  if (action === null) return

  const entryId = id ?? responseId(response)
  const values =
    typeof body === 'object' && body !== null && 'values' in body
      ? (body as { readonly values?: Record<string, unknown> }).values
      : undefined
  const version = responseVersion(response)

  // Fiche 30 task 5: which fields (if any) were filled by an accepted
  // assistant suggestion since the last save. Not a contract A field — this
  // never reaches `store.update`, `parseUpdateBody` strips it as an unknown
  // key — only the audit trail, so "a paragraph written" and "a paragraph
  // accepted from a suggestion" read differently in the log even though both
  // produce the same `content.update`.
  const assistApplied =
    typeof body === 'object' && body !== null && 'assistApplied' in body
      ? (
          body as {
            readonly assistApplied?: readonly { readonly field: string; readonly tool: string }[]
          }
        ).assistApplied
      : undefined
  const diff =
    values === undefined && (assistApplied === undefined || assistApplied.length === 0)
      ? undefined
      : {
          ...(values === undefined ? {} : values),
          ...(assistApplied === undefined || assistApplied.length === 0
            ? {}
            : { _assistApplied: assistApplied }),
        }

  await site.auth.audit
    .record({
      actorId: actor.id,
      actorRoles: actor.roles,
      action,
      collection,
      ...(entryId === undefined ? {} : { entryId }),
      ...(diff === undefined ? {} : { diff }),
      ...(version === undefined ? {} : { version }),
    })
    .catch((error: unknown) => logger.error('audit record failed', { error: String(error) }))
}

/**
 * Pings IndexNow the moment a publish or unpublish response succeeds (fiche
 * 50 task 3) — off by default (`seo.indexNowEnabled`), a no-op with no key
 * configured, and a no-op for a collection with no public route (nothing to
 * tell a crawler about). Deliberately narrower than `recordContentAudit`
 * above: a plain `content.update` is not a URL changing visibility the way a
 * publish/unpublish is, and pinging on every keystroke-triggered autosave
 * would spend the batch IndexNow itself documents as unnecessary.
 *
 * Never blocks or fails the response it follows: `pingIndexNow` already
 * turns a network failure or a non-2xx answer into a logged result rather
 * than a throw, and the `try`/`catch` here also covers the gateway read and
 * URL computation around it, so a publish always reaches its caller whether
 * or not IndexNow could be reached.
 */
async function notifyIndexNowOnContentChange(
  site: Site,
  actor: AccessContext['actor'],
  pathname: string,
  response: RestResponse,
  logger: Logger,
): Promise<void> {
  if (response.status < 200 || response.status >= 300) return
  const segments = pathname
    .replace(/^\/api\/content\/?/u, '')
    .split('/')
    .filter((segment) => segment.length > 0)
  const [collectionName, id, subAction] = segments
  if (collectionName === undefined || collectionName === '-') return
  if (subAction !== 'publish' && subAction !== 'unpublish') return

  try {
    const operational = await readSeoOperationalSettings(site.siteSettingsStore)
    if (!operational.indexNowEnabled || operational.indexNowKey === '') return

    const collection = site.collections.find((candidate) => candidate.name === collectionName)
    if (collection === undefined || collection.routing === undefined) return

    const entryId = id ?? responseId(response)
    if (entryId === undefined) return

    // The acting editor's own context, not `ANONYMOUS`: they just
    // published or unpublished this exact entry, so they can always read
    // it straight back, published or not — an entry just unpublished would
    // no longer be visible to `ANONYMOUS`, and the URL still needs telling.
    const entry = await site.gateway.read(collectionName, entryId, { actor })
    if (entry === null) return

    const seoSite = seoSiteFor(site.site, await readSeoRenderDefaults(site.siteSettingsStore))
    const url = canonicalUrl(seoSite, { collection, entry })
    if (url === null) return

    const result = await pingIndexNow({
      host: new URL(site.site.url).host,
      key: operational.indexNowKey,
      urls: [url],
    })
    if (result.outcome === 'failed') {
      logger.warn('IndexNow ping failed', { reason: result.reason, message: result.message })
    }
  } catch (error) {
    logger.warn('IndexNow ping skipped after an unexpected error', { error: String(error) })
  }
}

async function recordMediaAudit(
  site: Site,
  actor: AccessContext['actor'],
  method: string,
  pathname: string,
  response: RestResponse,
  logger: Logger,
): Promise<void> {
  if (response.status < 200 || response.status >= 300) return
  const segments = pathname
    .replace(/^\/api\/media\/?/u, '')
    .split('/')
    .filter((segment) => segment.length > 0)
  const [first, second] = segments

  // Fiche 46: the folder tree and the two "move" routes get their own
  // action names and, for a folder, the *folder's* id rather than the
  // literal segment `folders` — the same care `id` already got for a plain
  // asset write below.
  let action: string | null
  let id: string | undefined
  if (first === 'folders') {
    id = second
    action =
      second === undefined
        ? method === 'POST'
          ? 'media_folder.create'
          : null
        : segments[2] === 'move'
          ? method === 'POST'
            ? 'media_folder.move'
            : null
          : method === 'PATCH' || method === 'PUT'
            ? 'media_folder.update'
            : method === 'DELETE'
              ? 'media_folder.delete'
              : null
  } else if (second === 'move') {
    id = first
    action = method === 'POST' ? 'media.move' : null
  } else if (first === '-' && second === 'bulk-move') {
    id = undefined
    action = method === 'POST' ? 'media.bulk_move' : null
  } else {
    id = first
    action =
      method === 'POST'
        ? 'media.upload'
        : method === 'PATCH' || method === 'PUT'
          ? 'media.update'
          : method === 'DELETE'
            ? 'media.delete'
            : null
  }
  if (action === null) return

  const entryId = id ?? responseId(response)

  await site.auth.audit
    .record({
      actorId: actor.id,
      actorRoles: actor.roles,
      action,
      ...(entryId === undefined ? {} : { entryId }),
    })
    .catch((error: unknown) => logger.error('audit record failed', { error: String(error) }))
}

/**
 * Fiche 63, ADR-0028 — "aucun changement de permission sans... entrée
 * d'audit systématique": every successful `PUT`/`DELETE` on
 * `/api/role-permissions` is journaled unconditionally, never gated on
 * whether the admin's confirmation dialog was shown (that lives entirely in
 * `packages/admin`; the server side of "systematic" is that a write cannot
 * land without also producing this entry).
 */
async function recordRolePermissionAudit(
  site: Site,
  actor: AccessContext['actor'],
  method: string,
  pathname: string,
  response: RestResponse,
  logger: Logger,
): Promise<void> {
  if (response.status < 200 || response.status >= 300) return

  if (method === 'PUT') {
    const data = (response.body as { readonly data?: Record<string, unknown> } | null)?.data
    await site.auth.audit
      .record({
        actorId: actor.id,
        actorRoles: actor.roles,
        action: 'role_permission.set',
        ...(data === undefined ? {} : { diff: data }),
      })
      .catch((error: unknown) => logger.error('audit record failed', { error: String(error) }))
    return
  }

  if (method === 'DELETE') {
    const [targetType, targetName, permAction] = pathname
      .replace(/^\/api\/role-permissions\/?/u, '')
      .split('/')
      .filter((segment) => segment.length > 0)
    await site.auth.audit
      .record({
        actorId: actor.id,
        actorRoles: actor.roles,
        action: 'role_permission.remove',
        ...(targetType === undefined || targetName === undefined || permAction === undefined
          ? {}
          : { diff: { targetType, targetName, action: permAction } }),
      })
      .catch((error: unknown) => logger.error('audit record failed', { error: String(error) }))
  }
}

/**
 * One entry per successful `POST /api/import/wordpress` — who ran it and how
 * much it brought in, the same field the terminal command prints as
 * `formatConversionReport`'s opening line. Never the document itself: a WXR
 * export can carry a whole site's content, and the audit log is not a backup.
 */
async function recordImportAudit(
  site: Site,
  actor: AccessContext['actor'],
  method: string,
  pathname: string,
  response: RestResponse,
  logger: Logger,
): Promise<void> {
  if (method !== 'POST' || response.status < 200 || response.status >= 300) return
  if (!pathname.startsWith('/api/import/')) return

  const report = (response.body as { readonly data?: { readonly imported?: unknown } } | null)?.data
    ?.imported as
    | { readonly posts?: number; readonly pages?: number; readonly media?: number }
    | undefined

  await site.auth.audit
    .record({
      actorId: actor.id,
      actorRoles: actor.roles,
      action: 'import.wordpress',
      ...(report === undefined ? {} : { diff: report }),
    })
    .catch((error: unknown) => logger.error('audit record failed', { error: String(error) }))
}

async function recordAuthAudit(
  site: Site,
  actor: AccessContext['actor'],
  method: string,
  pathname: string,
  response: RestResponse,
  logger: Logger,
  body?: unknown,
): Promise<void> {
  if (response.status < 200 || response.status >= 300) {
    // A refused password attempt is the "who is trying to get in" signal a
    // security-conscious admin expects an audit log to carry (WordPress and
    // its security plugins log these too) — only the first step, though:
    // TOTP, recovery-code and passkey completion reuse the same
    // `AUTH_INVALID_CREDENTIALS`-family codes for a different meaning each
    // time, so recording those here under one generic action would misname
    // what actually failed.
    if (pathname.endsWith('/api/auth/login') && method === 'POST') {
      const email =
        body !== null &&
        typeof body === 'object' &&
        typeof (body as { email?: unknown }).email === 'string'
          ? (body as { email: string }).email
          : null
      await site.auth.audit
        .record({
          actorId: null,
          actorRoles: [],
          action: 'auth.login_failed',
          ...(email === null ? {} : { diff: { email } }),
        })
        .catch((error: unknown) => logger.error('audit record failed', { error: String(error) }))
    }
    return
  }

  if (pathname.endsWith('/api/auth/session') && method === 'DELETE') {
    await site.auth.audit
      .record({ actorId: actor.id, actorRoles: actor.roles, action: 'auth.logout' })
      .catch((error: unknown) => logger.error('audit record failed', { error: String(error) }))
    return
  }

  // Login, TOTP completion and passkey completion all land here the same
  // way: whichever step actually produced a session is the one worth
  // recording, not every intermediate MFA round trip.
  const data = (response.body as { readonly data?: { readonly status?: unknown } } | null)?.data
  if (data?.status !== 'session') return
  const user = (data as { readonly user?: { readonly id?: unknown; readonly roles?: unknown } })
    .user
  const userId = typeof user?.id === 'string' ? user.id : null
  const roles = Array.isArray(user?.roles) ? (user.roles as string[]) : []

  // A recovery-code sign-in is its own, more specific event (fiche 18 task
  // 1): "a code was consumed" is worth remarking on in a way an ordinary
  // login is not — it is what `createRecoveryCodeUsedNoticeSource` looks
  // for — so it is recorded instead of the generic `auth.login`, not in
  // addition to it.
  const action = pathname.endsWith('/api/auth/recovery-code')
    ? 'auth.recovery_code_used'
    : 'auth.login'

  await site.auth.audit
    .record({ actorId: userId, actorRoles: roles, action })
    .catch((error: unknown) => logger.error('audit record failed', { error: String(error) }))
}

/**
 * Who minted, rotated, revoked, purged or recovered a machine credential, in
 * the same append-only log as every other account action (L13 task 8;
 * rotation added by fiche 20 task 2 — "vérifier que c'est déjà le cas" for
 * create/revoke found it already was, so rotation is the one lifecycle event
 * that fiche actually added here; purge and recover added by fiche 62 tasks
 * 2-3). The raw key itself never reaches this function — a `POST`'s response
 * carries it once, but the audit entry only ever names the key's id, exactly
 * like `users-router.ts`'s own direct writes (T09-05) never log a password.
 */
async function recordApiKeyAudit(
  site: Site,
  actor: AccessContext['actor'],
  method: string,
  pathname: string,
  response: RestResponse,
  logger: Logger,
): Promise<void> {
  if (response.status < 200 || response.status >= 300) return

  const segments = pathname.split('/').filter((segment) => segment.length > 0)
  // ['api', 'api-keys', <id?>, <'rotate' | 'purge' | 'recover'?>]
  const target = segments[2]
  const sub = segments[3]

  const action =
    method === 'POST' && target === undefined
      ? 'apikey.create'
      : method === 'POST' && target !== undefined && sub === 'rotate'
        ? 'apikey.rotate'
        : method === 'POST' && target !== undefined && sub === 'recover'
          ? 'apikey.recover'
          : method === 'DELETE' && target !== undefined && sub === 'purge'
            ? 'apikey.purge'
            : method === 'DELETE' && target !== undefined && sub === undefined
              ? 'apikey.revoke'
              : null
  if (action === null) return

  const body = response.body as {
    readonly data?: { readonly id?: unknown; readonly issued?: { readonly id?: unknown } }
  } | null
  const subjectId =
    action === 'apikey.rotate'
      ? typeof body?.data?.issued?.id === 'string'
        ? body.data.issued.id
        : null
      : typeof body?.data?.id === 'string'
        ? body.data.id
        : (target ?? null)
  // For a rotation or a recovery the diff names what was replaced — the id
  // alone, never any key material, the same restraint every other field in
  // this function already keeps.
  const diff =
    action === 'apikey.rotate' && target !== undefined
      ? { rotatedFrom: target }
      : action === 'apikey.recover' && target !== undefined
        ? { recoveredFrom: target }
        : undefined

  await site.auth.audit
    .record({
      actorId: actor.id,
      actorRoles: actor.roles,
      action,
      ...(subjectId === null ? {} : { entryId: subjectId }),
      ...(diff === undefined ? {} : { diff }),
    })
    .catch((error: unknown) => logger.error('audit record failed', { error: String(error) }))
}

/**
 * Fiche 21 task 2: "l'export d'un journal d'audit est lui-même un événement à
 * journaliser" — the log names emails and nominative actions, so pulling a
 * copy of it out is a personal-data export, and who did it is worth knowing.
 * The count is recorded, never the exported rows themselves: the audit log
 * is not where a second copy of everyone's activity belongs.
 */
async function recordAuditExportAudit(
  site: Site,
  actor: AccessContext['actor'],
  method: string,
  pathname: string,
  query: RestRequest['query'],
  response: RestResponse,
  logger: Logger,
): Promise<void> {
  if (method !== 'GET' || response.status < 200 || response.status >= 300) return
  if (!pathname.endsWith('/export')) return

  const format = typeof query.format === 'string' ? query.format : 'json'
  const count =
    format === 'csv'
      ? typeof response.body === 'string'
        ? Math.max(response.body.trim().split(/\r\n/u).length - 1, 0) // minus the header row
        : 0
      : ((response.body as { readonly data?: readonly unknown[] } | null)?.data?.length ?? 0)

  await site.auth.audit
    .record({
      actorId: actor.id,
      actorRoles: actor.roles,
      action: 'audit.export',
      diff: { format, count },
    })
    .catch((error: unknown) => logger.error('audit record failed', { error: String(error) }))
}

/**
 * Every editorial setting change, in the same hash-chained log as every
 * other write (fiche 23 task 1: "toute écriture produit une entrée
 * d'audit"). Only `PATCH` writes anything down — `GET` is a plain read, the
 * same restraint `recordMediaAudit`/`recordApiKeyAudit` already apply.
 *
 * The written key and value are read back from the router's own response
 * body (`{ data: { key, value, … } }`) rather than the request body: it is
 * the value that actually landed, after the store's own validation, which
 * is the more honest thing for an audit entry to name.
 */
async function recordSiteSettingsAudit(
  site: Site,
  actor: AccessContext['actor'],
  method: string,
  response: RestResponse,
  logger: Logger,
): Promise<void> {
  if (method !== 'PATCH') return
  if (response.status < 200 || response.status >= 300) return

  const data = (
    response.body as {
      readonly data?: {
        readonly key?: unknown
        readonly value?: unknown
        readonly locale?: unknown
      }
    } | null
  )?.data
  const key = typeof data?.key === 'string' ? data.key : null
  if (key === null) return

  await site.auth.audit
    .record({
      actorId: actor.id,
      actorRoles: actor.roles,
      action: 'site_setting.update',
      diff: {
        key,
        value: data?.value ?? null,
        ...(data?.locale == null ? {} : { locale: data.locale }),
      },
    })
    .catch((error: unknown) => logger.error('audit record failed', { error: String(error) }))
}

async function recordAdminThemeAudit(
  site: Site,
  actor: AccessContext['actor'],
  method: string,
  response: RestResponse,
  logger: Logger,
): Promise<void> {
  if (method !== 'PUT') return
  if (response.status < 200 || response.status >= 300) return

  const active = (
    response.body as {
      readonly data?: { readonly active?: { readonly templateId?: unknown } }
    } | null
  )?.data?.active
  const templateId = typeof active?.templateId === 'string' ? active.templateId : null
  if (templateId === null) return

  await site.auth.audit
    .record({
      actorId: actor.id,
      actorRoles: actor.roles,
      action: 'admin_theme.update',
      diff: { templateId },
    })
    .catch((error: unknown) => logger.error('audit record failed', { error: String(error) }))
}

function writeRestResponse(res: ServerResponse, response: RestResponse): void {
  res.writeHead(response.status, response.headers)
  // A string body (the audit log's CSV export, fiche 21 task 2) is written
  // as-is: every other route's body is a plain object or `null`, and
  // `JSON.stringify`ing a string would wrap it in quotes and escape it,
  // corrupting the file a browser downloads.
  res.end(
    response.body === null || response.body === undefined
      ? undefined
      : typeof response.body === 'string'
        ? response.body
        : JSON.stringify(response.body),
  )
}

function jsonError(res: ServerResponse, status: number, code: string, message: string): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify({ error: { code, message } }))
}

/**
 * `Retry-After` plus the `RateLimit-*` draft headers (fiche 20 task 3), built
 * from the `{ limit, remaining, resetAt }` `resolveApiKeyActor` (`@cogenta/api`)
 * put on `API_KEY_RATE_LIMITED`'s `details`. `resetAt` is an absolute instant;
 * every header here wants a delta, computed once against the real clock so a
 * response that took a moment to reach this point still reports correctly.
 */
function rateLimitHeaders(
  details: Readonly<Record<string, unknown>> | undefined,
): Record<string, string> {
  const limit = typeof details?.limit === 'number' ? details.limit : undefined
  const remaining = typeof details?.remaining === 'number' ? details.remaining : undefined
  const resetAt = typeof details?.resetAt === 'number' ? details.resetAt : undefined
  const retryAfterSeconds =
    resetAt === undefined ? 60 : Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))

  return {
    'content-type': 'application/json; charset=utf-8',
    'retry-after': String(retryAfterSeconds),
    ...(limit === undefined ? {} : { 'ratelimit-limit': String(limit) }),
    ...(remaining === undefined ? {} : { 'ratelimit-remaining': String(remaining) }),
    'ratelimit-reset': String(retryAfterSeconds),
  }
}

/** Same authentication gate as every other `/api/media` route — the file itself is not public. */
async function serveMediaFile(
  site: Site,
  actor: AccessContext['actor'],
  id: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET' }).end()
    return
  }
  if (actor.id === null) {
    jsonError(res, 401, 'UNAUTHENTICATED', 'Sign in to view media.')
    return
  }

  const asset = await site.mediaStore.get(id)
  if (asset === null) {
    jsonError(res, 404, 'MEDIA_NOT_FOUND', `No media asset with id "${id}".`)
    return
  }

  const stream = await site.storage.get(asset.storageKey)
  res.writeHead(200, {
    'content-type': asset.mimeType,
    'cache-control': 'private, max-age=3600',
  })
  stream.on('error', () => res.destroy())
  stream.pipe(res)
}

/**
 * `GET /api/forms/submissions/export.csv` — fiche 47 task 9's server-streamed
 * export. Admin-only (the same role `forms-router.ts`'s own `requireAdmin`
 * checks for every other submissions route), handled directly for the same
 * reason `serveMediaFile` is: a streamed body has no shape `RestResponse`'s
 * JSON contract can carry. Rows are written to the response as
 * `streamSubmissionsCsv` (`@cogenta/api`) produces them — the whole export
 * is never held in memory at once, which is the point of this task over the
 * client-side, 200-row-capped export `form-submissions.tsx` already has.
 */
async function serveFormsSubmissionsExport(
  site: Site,
  actor: AccessContext['actor'],
  url: URL,
  res: ServerResponse,
): Promise<void> {
  if (!actor.roles.includes('admin')) {
    jsonError(res, 403, 'FORBIDDEN', 'Only the admin role may export submissions.')
    return
  }

  const formId = url.searchParams.get('formId') ?? undefined
  const status = url.searchParams.get('status') ?? undefined
  const from = url.searchParams.get('from') ?? undefined
  const to = url.searchParams.get('to') ?? undefined
  const query = url.searchParams.get('q') ?? undefined

  res.writeHead(200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': 'attachment; filename="form-submissions.csv"',
    'cache-control': 'no-store',
  })
  // UTF-8 BOM — same reason `admin/src/lib/csv.ts`'s `downloadCsv` prepends
  // one: without it, Excel guesses the wrong codepage for accented text.
  res.write('﻿')
  try {
    for await (const chunk of streamSubmissionsCsv(site.formStore, {
      ...(formId === undefined ? {} : { formId }),
      ...(status === undefined ? {} : { status }),
      ...(from === undefined ? {} : { from }),
      ...(to === undefined ? {} : { to }),
      ...(query === undefined ? {} : { query }),
    })) {
      res.write(chunk)
    }
  } finally {
    res.end()
  }
}

/**
 * `GET /_image?id=…&w=…` — the public delivery endpoint for images.
 *
 * **Public on purpose, and only for images.** A `<img src>` in a published
 * page is fetched by a visitor's browser with no session, so an endpoint the
 * theme can point at cannot be behind the same authentication as
 * `/api/media/{id}/file`. Restricting it to `kind === 'image'` is what keeps
 * that from widening to every uploaded PDF and video: those stay behind the
 * authenticated route, unchanged.
 *
 * It serves the rendition the upload already produced, and falls back to the
 * original when there is none — an asset uploaded before the pipeline
 * existed, a width outside the ladder, or a host with no image driver. It
 * never renders on demand: nothing here decodes an image, so a public URL
 * cannot be turned into CPU by asking for a size nobody stored.
 */
async function serveImageVariant(
  site: Site,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET' }).end()
    return
  }

  const id = url.searchParams.get('id')
  if (id === null || id === '') {
    jsonError(res, 400, 'QUERY_INVALID', 'An image request must name the media it wants.')
    return
  }

  const asset = await site.mediaStore.get(id)
  if (asset === null || asset.kind !== 'image') {
    jsonError(res, 404, 'MEDIA_NOT_FOUND', `No image asset with id "${id}".`)
    return
  }

  let key = asset.storageKey
  // Never the asset's recorded `mimeType` unquestioned. Uploads now record
  // the sniffed type, but an asset stored before that fix — or by a future
  // writer that skips the route — could carry `text/html`, and this endpoint
  // is public, unauthenticated and on the site's own origin. A type that is
  // not an image serves as an opaque download instead of executing.
  let contentType = SERVABLE_IMAGE_TYPES.has(asset.mimeType)
    ? asset.mimeType
    : 'application/octet-stream'

  const requested = Number(url.searchParams.get('w'))
  if (
    site.images !== null &&
    Number.isInteger(requested) &&
    requested > 0 &&
    asset.width !== null &&
    asset.height !== null
  ) {
    const names = site.images.variantNames({ width: asset.width, height: asset.height })
    const wanted = `${requested}.`
    const match = names.find((name) => name.startsWith(wanted))
    if (match !== undefined) {
      const variantKey = variantKeyFor(id, match)
      if (await site.storage.exists(variantKey)) {
        key = variantKey
        if (match.endsWith('.webp')) contentType = 'image/webp'
      }
    }
  }

  const stream = await site.storage.get(key)
  res.writeHead(200, {
    'content-type': contentType,
    // Long, because the URL names an immutable rendition of an immutable
    // upload: replacing an image means a new media id, never new bytes under
    // the same one.
    'cache-control': 'public, max-age=31536000, immutable',
  })
  stream.on('error', () => res.destroy())
  stream.pipe(res)
}

/**
 * Loads the media a theme render references, as `@cogenta/render`'s
 * `MediaAsset`.
 *
 * The two shapes are deliberately different types (ADR-0016: the delivery
 * plane declares its own wire types rather than importing the engine's), so
 * this is the one place they are mapped. Only images and videos exist in that
 * shape at all — a PDF has no `srcset` — so anything else is left out and
 * `ctx.image()` refuses it clearly.
 */
async function loadRenderMedia(
  site: Site,
  ids: readonly string[],
): Promise<ReadonlyMap<string, RenderMediaAsset>> {
  const found = new Map<string, RenderMediaAsset>()
  for (const id of new Set(ids)) {
    const asset = await site.mediaStore.get(id)
    if (asset === null) continue
    if (asset.kind !== 'image' && asset.kind !== 'video') continue
    found.set(id, {
      id: asset.id,
      kind: asset.kind,
      alt: asset.alt,
      ...(asset.width === null ? {} : { width: asset.width }),
      ...(asset.height === null ? {} : { height: asset.height }),
      focal: asset.focal,
    })
  }
  return found
}

/**
 * Fiche 24's extra runtime state — health/tools/maintenance/error-log — kept
 * separate from `Site` rather than folded into it: none of it is part of
 * "what a site is" the way a `ContentStore` or a `MediaStore` is, and every
 * caller that already constructs a bare `Site` by hand (tests included) goes
 * on working unchanged with this omitted, in which case the routes it would
 * serve simply do not exist.
 */
export interface RuntimeExtras {
  readonly healthRouter: HealthRouter
  readonly toolsRouter: ToolsRouter
  /**
   * The "Tâches planifiées" screen (fiche 28 task 2). Optional for the same
   * pragmatic reason `Site.agentsRouter` is: a caller that builds a bare
   * `Site` by hand (tests included) goes on working unchanged with this
   * omitted — `GET /api/scheduled-tasks` then simply does not exist, rather
   * than 500ing on a registry nobody constructed. `cogenta serve` always
   * passes one (L20 audit §1 point 6: before this it never did, so the
   * screen's own two requests 404'd against no route at all).
   */
  readonly scheduledTasksRouter?: ScheduledTasksRouter
  readonly maintenance: MaintenanceStore
  readonly errorLog: ErrorLog
  readonly siteName: string
  /**
   * The "Exploitation" > Observability screen (fiche L22 task 5). Optional
   * for the same pragmatic reason `scheduledTasksRouter` is — a caller that
   * builds a bare `Site` by hand goes on working unchanged, and
   * `GET /api/observability` simply does not exist rather than 500ing on a
   * runtime nobody constructed. `cogenta serve` always passes one.
   */
  readonly observabilityRouter?: ObservabilityRouter
}

/**
 * Builds the Node request handler from an already-assembled site.
 *
 * All the actual logic — routing, permissions, actor resolution — was already
 * tested as plain values in `@cogenta/api` and `@cogenta/auth`; this function
 * is deliberately just the translation from `IncomingMessage`/`ServerResponse`
 * to that shape and back, so a serverless adapter later is the same kind of
 * thin layer rather than a second implementation of any of it.
 */
export function createRequestListener(
  site: Site,
  logger: Logger,
  extras?: RuntimeExtras,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')

    // Before anything else, and once: CORS, the security headers and the
    // cache-control class of this path (L10 task 6). A preflight is answered
    // here and never reaches a route.
    if (applySecurity(req, res, url.pathname, site.security)) return

    try {
      const actor = await resolveActor(
        site.auth,
        Object.fromEntries(
          Object.entries(req.headers).map(([key, value]) => [
            key,
            Array.isArray(value) ? value.join(', ') : value,
          ]),
        ),
        site.requestQuota === undefined ? {} : { requestQuota: site.requestQuota },
      )
      // The `?preview=` token the admin's "Prévisualiser" button issues
      // (`POST /{collection}/{id}/preview`, `router.ts`) is only ever
      // consumed here for the public *page* route below — `createContentGateway`'s
      // own `list()` already has the preview overlay built in (it merges the
      // one granted entry into an otherwise published-only page), so folding
      // the grant into `context` here is the entire integration: nothing in
      // `theme-render.ts` needs to know a preview even happened. A missing or
      // invalid token is never a 500 — it just means this request proceeds as
      // an ordinary anonymous visitor, and an unpublished page 404s exactly
      // as it always did.
      const previewToken = url.searchParams.get('preview')
      let preview: AccessContext['preview']
      if (previewToken !== null) {
        try {
          preview = createPreviewTokens().verify(previewToken)
        } catch (error) {
          logger.warn('preview token rejected', { error: String(error) })
        }
      }
      const context: AccessContext = { actor, ...(preview === undefined ? {} : { preview }) }

      // Maintenance mode (fiche 24 task 5): every visitor of the *public*
      // site gets a 503 while it is on — `/api/*` and `/admin*` stay
      // reachable so a signed-in admin can still turn it back off, and any
      // already-authenticated actor is let straight through (an editor
      // previewing the live site during a maintenance window is not "a
      // visitor"). Never cached: an intermediary that stored this 503 would
      // turn "maintenance is over" into "still down" for whoever it serves
      // next.
      if (
        extras !== undefined &&
        actor.id === null &&
        !url.pathname.startsWith('/api/') &&
        url.pathname !== '/admin' &&
        !url.pathname.startsWith('/admin/')
      ) {
        const maintenance = await extras.maintenance.get()
        if (maintenance.enabled) {
          res.writeHead(503, {
            'content-type': 'text/html; charset=utf-8',
            'retry-after': '120',
            'cache-control': 'no-store',
          })
          res.end(renderMaintenancePage(extras.siteName, maintenance.message))
          return
        }
      }

      // The admin SPA's own built shell — never permission-checked here: it
      // is static HTML/JS, not data. Every real action it takes goes through
      // the same `/api/*` routes below, which already enforce permissions on
      // their own. GET only: there is nothing meaningful to POST to a static
      // file.
      if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
        if (req.method !== 'GET') {
          res.writeHead(405, { allow: 'GET' }).end()
          return
        }
        const asset = await serveAdminAsset(url.pathname)
        if (asset !== null) {
          res.writeHead(200, {
            'content-type': asset.contentType,
            'cache-control': asset.cacheControl,
          })
          res.end(asset.body)
          return
        }
        jsonError(res, 404, 'CONTENT_NOT_FOUND', 'No admin asset matches this path.')
        return
      }

      // The theme's stylesheet: public, cacheable, and the same URL every
      // page links, so a visitor pays for ~26 kB once instead of on every
      // page. Inlining it in each document would cost that on every
      // navigation; a `<link>` with a real ETag costs a conditional request
      // that answers 304. There is nothing to permission-check — the sheet is
      // derived from the skin's tokens and contains no content.
      if (url.pathname === STYLESHEET_PATH) {
        if (req.method !== 'GET') {
          res.writeHead(405, { allow: 'GET' }).end()
          return
        }
        // Recomputed on every request (`resolveStyles`, fiche 14) rather
        // than the fixed startup snapshot — this is the one route where
        // "a skin swap must show up on the next request" actually has to be
        // true, and the ETag below is what keeps that promise cheap: a
        // browser that already has the current bytes gets a 304, not a
        // re-download, even though the server recomputed to know that.
        const liveStyles = await site.resolveStyles()
        if (liveStyles === null) {
          jsonError(res, 404, 'CONTENT_NOT_FOUND', 'This site has no stylesheet.')
          return
        }
        const etag = cssEtag(liveStyles)
        if (req.headers['if-none-match'] === etag) {
          res.writeHead(304, { etag }).end()
          return
        }
        res.writeHead(200, {
          'content-type': 'text/css; charset=utf-8',
          etag,
          // Revalidate every time: a skin swap must show up on the next
          // request, which is the whole promise of contract D's hot swap. The
          // ETag makes that revalidation a 304 rather than a re-download.
          'cache-control': 'public, max-age=0, must-revalidate',
        })
        res.end(liveStyles)
        return
      }

      // Cogenta's own logo, served for the public footer's default branding
      // (fiche L21 task 8) — public and unauthenticated for the same reason
      // `/_image` is: a visitor's browser fetches it with no session. The
      // bytes are baked into this `@cogenta/cli` release, not a database
      // asset, so unlike the stylesheet above there is nothing to
      // recompute per request and the cache header can be truly immutable.
      if (url.pathname === DEFAULT_LOGO_PATH) {
        if (req.method !== 'GET') {
          res.writeHead(405, { allow: 'GET' }).end()
          return
        }
        res.writeHead(200, {
          'content-type': DEFAULT_LOGO_CONTENT_TYPE,
          'cache-control': 'public, max-age=31536000, immutable',
        })
        res.end(Buffer.from(defaultLogoBytes()))
        return
      }

      if (url.pathname.startsWith('/api/auth/')) {
        const body =
          req.method === 'GET' || req.method === 'DELETE' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        const response = await site.authRouter.handle(request)
        writeRestResponse(res, response)
        await recordAuthAudit(
          site,
          actor,
          req.method ?? 'GET',
          url.pathname,
          response,
          logger,
          body,
        )
        // A refused sign-in is the only clock a brute-force alert can honestly
        // have here (L14 task 4) — see `security-alerts.ts` for why not a timer.
        await site.securityAlerts?.observe(response.status)
        return
      }

      // Public and read-only: `schema.json` describes collection shapes and
      // which role names an action needs, never any content — the admin
      // reads this to know what to show before it has ever signed in.
      if (url.pathname === '/api/schema') {
        if (req.method !== 'GET') {
          res.writeHead(405, { allow: 'GET' }).end()
          return
        }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ data: site.schemaDocument }))
        return
      }

      // Serving the file itself sits outside `mediaRouter`: its `RestResponse`
      // is JSON-only, and a binary body has no shape to fit into that without
      // widening the transport contract every other route relies on.
      // The public image endpoint (L10 task 5). Before the `/api/*` block on
      // purpose: it is not an API route, and it is the one media path a
      // visitor's browser reaches with no session.
      if (url.pathname === DEFAULT_IMAGE_ENDPOINT) {
        await serveImageVariant(site, url, req, res)
        return
      }

      const fileMatch = /^\/api\/media\/([^/]+)\/file$/u.exec(url.pathname)
      if (fileMatch !== null) {
        await serveMediaFile(site, actor, decodeURIComponent(fileMatch[1] ?? ''), req, res)
        return
      }

      // Fiche 47 task 9 — same reasoning as `serveMediaFile`: a streamed CSV
      // body has no shape `RestResponse`'s JSON-only contract can carry, so
      // it is handled directly rather than through `formsRouter`.
      if (url.pathname === '/api/forms/submissions/export.csv') {
        if (req.method !== 'GET') {
          res.writeHead(405, { allow: 'GET' }).end()
          return
        }
        await serveFormsSubmissionsExport(site, actor, url, res)
        return
      }

      if (url.pathname === '/api/graphql') {
        if (req.method !== 'POST') {
          res.writeHead(405, { allow: 'POST' }).end()
          return
        }
        const body = (await readBody(req)) as
          | { query?: unknown; variables?: unknown; operationName?: unknown }
          | undefined
        const query = typeof body?.query === 'string' ? body.query : ''
        const result = await executeGraphQL(
          {
            query,
            variables:
              typeof body?.variables === 'object' && body.variables !== null
                ? (body.variables as Record<string, unknown>)
                : undefined,
            operationName: typeof body?.operationName === 'string' ? body.operationName : undefined,
          },
          { schema: site.graphqlSchema, gateway: site.gateway, access: context, logger },
        )
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(result))
        return
      }

      if (url.pathname.startsWith('/api/content')) {
        const body =
          req.method === 'GET' || req.method === 'DELETE' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        const response = await site.restRouter.handle(request, context)
        writeRestResponse(res, response)
        await recordContentAudit(
          site,
          actor,
          req.method ?? 'GET',
          url.pathname,
          body,
          response,
          logger,
        )
        await notifyIndexNowOnContentChange(site, actor, url.pathname, response, logger)
        return
      }

      // Terms live apart from content on purpose: a taxonomy is not a
      // collection, and a site may legitimately name both the same thing
      // (ADR-0022). Its router owns its own permission door.
      if (url.pathname.startsWith('/api/taxonomies')) {
        const body =
          req.method === 'GET' || req.method === 'DELETE' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        writeRestResponse(res, await site.taxonomyRouter.handle(request, context))
        return
      }

      if (url.pathname.startsWith('/api/marketplace')) {
        const body =
          req.method === 'GET' || req.method === 'DELETE' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        writeRestResponse(res, await site.marketplaceRouter.handle(request, context.actor))
        return
      }

      // A menu is not schema-declared like a taxonomy, but it gets its own
      // mount for the same reason: it is not a collection, and its router owns
      // its own (fixed, not per-site-configurable) permission door.
      if (url.pathname.startsWith('/api/menus')) {
        const body =
          req.method === 'GET' || req.method === 'DELETE' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        writeRestResponse(res, await site.menuRouter.handle(request, context))
        return
      }

      // The page builder's motif/model library (fiche 43 sub-chantier A):
      // also not schema-declared, also its own fixed door — admin/editor on
      // every method, the same reasoning `redirectRouter` below already
      // applies to a builder fixture that is never content a visitor reads.
      if (url.pathname.startsWith('/api/patterns')) {
        const body =
          req.method === 'GET' || req.method === 'DELETE' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        writeRestResponse(res, await site.patternRouter.handle(request, context))
        return
      }

      // Contract E's own back office, gated by its own permission vocabulary
      // (`commerce.*`, ADR-0024) — never contract A's five actions, which do
      // not stretch to "refund" or "issue an invoice".
      if (url.pathname.startsWith('/api/commerce')) {
        const body =
          req.method === 'GET' || req.method === 'DELETE' ? undefined : await readBody(req)
        const request = toCommerceRequest(req, url, body)
        const response = await site.commerceRouter.handle(request, context.actor)
        // Two routes whose body is not JSON: an invoice PDF (bytes) and the
        // accounting CSV export (fiche 52 task 7, plain text). Checked by
        // shape, not by path — the router already decided what to send, this
        // layer only has to notice how.
        if (response.body instanceof Uint8Array) {
          res.writeHead(response.status, { 'content-type': 'application/pdf' })
          res.end(Buffer.from(response.body))
          return
        }
        if (typeof response.body === 'string') {
          res.writeHead(response.status, {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': 'attachment; filename="orders.csv"',
          })
          res.end(response.body)
          return
        }
        res.writeHead(response.status, { 'content-type': 'application/json; charset=utf-8' })
        res.end(response.body === null ? undefined : JSON.stringify(response.body))
        return
      }

      // Contract F (ADR-0025): the moderation queue AND
      // `POST /api/comments`, the CMS's first public write route. The
      // router itself decides whether an actor is needed at all — an
      // anonymous `context.actor` reaches the public POST branch exactly the
      // way `resolveActor` already resolves it for any unauthenticated
      // request, so nothing special happens here beyond routing the request.
      if (url.pathname.startsWith('/api/comments')) {
        const body =
          req.method === 'GET' || req.method === 'DELETE' ? undefined : await readBody(req)
        const request = toCommentsRequest(req, url, body)
        const response = await site.commentsRouter.handle(request, context.actor)
        // The one shape besides JSON this router ever answers with: a 303
        // redirect back to the page a no-JS `<form>` posted from
        // (`response.headers.location`, set only when the submission carried
        // `redirectTo`). No body follows a redirect.
        if (response.headers?.location !== undefined) {
          res.writeHead(response.status, response.headers)
          res.end()
          return
        }
        res.writeHead(response.status, { 'content-type': 'application/json; charset=utf-8' })
        res.end(
          response.body === null || response.body === undefined
            ? undefined
            : JSON.stringify(response.body),
        )
        return
      }

      if (url.pathname.startsWith('/api/media')) {
        const body =
          req.method === 'GET' || req.method === 'DELETE' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        const response = await site.mediaRouter.handle(request, context.actor)
        writeRestResponse(res, response)
        await recordMediaAudit(site, actor, req.method ?? 'GET', url.pathname, response, logger)
        return
      }

      // The admin screen the redirect table never had: creating, editing and
      // removing a rule from a browser instead of the database directly
      // (audit follow-up to L10 task 2), extended by fiche 12 with prefix
      // patterns and CSV import/export under the same prefix — all
      // admin-only, checked by the router itself.
      if (url.pathname.startsWith('/api/redirects')) {
        const body =
          req.method === 'GET' || req.method === 'DELETE' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        writeRestResponse(res, await site.redirectRouter.handle(request, context))
        return
      }

      // Fiche 63, ADR-0028: a role's grant on a collection or taxonomy
      // action, writable in production without a deploy cycle. Admin-only,
      // checked by the router itself; a successful write is journaled
      // unconditionally (`recordRolePermissionAudit`), the server half of
      // "aucun changement de permission sans... entrée d'audit systématique".
      if (url.pathname.startsWith('/api/role-permissions')) {
        const body =
          req.method === 'GET' || req.method === 'DELETE' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        const response = await site.rolePermissionRouter.handle(request, context)
        writeRestResponse(res, response)
        await recordRolePermissionAudit(
          site,
          actor,
          req.method ?? 'GET',
          url.pathname,
          response,
          logger,
        )
        return
      }

      // Contract G (ADR-0026, fiche 16): form definitions/submissions
      // (admin-only) and the public `POST .../submit` this same mount also
      // serves — the router itself decides which is which (see
      // `forms-router.ts`'s own comment). The submit route is the CMS's
      // second public write route, and it must work with a plain HTML
      // `<form>` and no JavaScript at all (fiche 16 task 3) — that is the one
      // path handled specially below, everything else on this mount is a
      // normal JSON admin route.
      if (url.pathname.startsWith('/api/forms')) {
        const submitMatch = /^\/api\/forms\/([^/]+)\/submit$/u.exec(url.pathname)
        const submitContentType = req.headers['content-type'] ?? ''
        // Fiche 47 task 3: a step (or a step containing a `file` field)
        // arrives as `multipart/form-data`, not `application/x-www-form-urlencoded`
        // — both are a plain no-JS `<form method="post">`, never a JSON API
        // client, so both get the HTML treatment below.
        const isHtmlSubmit =
          submitMatch !== null &&
          req.method === 'POST' &&
          (submitContentType.includes('application/x-www-form-urlencoded') ||
            submitContentType.includes('multipart/form-data'))

        const body =
          req.method === 'GET' || req.method === 'DELETE' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        const formsContext: FormsRequestContext = { actor: context.actor, ip: clientIpOf(req) }
        const response = await site.formsRouter.handle(request, formsContext)

        if (isHtmlSubmit) {
          const formName = submitMatch[1] as string
          const postedFields: Record<string, unknown> = isMultipartFormData(body)
            ? { ...body.fields }
            : typeof body === 'object' && body !== null
              ? (body as Record<string, unknown>)
              : {}

          if (response.status === 201) {
            const data = (
              response.body as { readonly data: { readonly redirectTo: string | null } }
            ).data
            const location = data.redirectTo ?? `/forms/${encodeURIComponent(formName)}?submitted=1`
            res.writeHead(303, { location, 'cache-control': 'no-store' })
            res.end()
            return
          }

          if (response.status === 202) {
            // Fiche 47 task 2 — an intermediate multi-step page: render the
            // next step directly in this same response, no redirect. The
            // definition is already known to exist (the router only answers
            // 202 after finding it), so this never has to handle "not found"
            // here.
            const data = (
              response.body as {
                readonly data: {
                  readonly nextStep: number
                  readonly ts: string
                  readonly values: Record<string, unknown>
                }
              }
            ).data
            const definition = await site.formStore.definitions.readByName(formName)
            const formPageOptions = {
              site: site.site,
              styles: await site.resolveStyles(),
              now: Date.now,
              menus: { menuRouter: site.menuRouter },
              branding: () => brandingForSite(site),
              activeTheme: () => activeThemeForSite(site),
              seo: () => readSeoRenderDefaults(site.siteSettingsStore),
            }
            const html =
              definition === null
                ? await renderFormNotFoundPage(formPageOptions, context)
                : await renderFormPage(
                    definition,
                    { step: data.nextStep, accumulated: data.values, ts: data.ts },
                    formPageOptions,
                    context,
                  )
            res.writeHead(definition === null ? 404 : 200, {
              'content-type': 'text/html; charset=utf-8',
              'cache-control': 'no-store',
            })
            res.end(html)
            return
          }

          const definition = await site.formStore.definitions.readByName(formName)
          const errorBody = response.body as {
            readonly error?: { readonly message?: string; readonly field?: string }
          }
          const formPageOptions = {
            site: site.site,
            styles: await site.resolveStyles(),
            now: Date.now,
            menus: { menuRouter: site.menuRouter },
            branding: () => brandingForSite(site),
            activeTheme: () => activeThemeForSite(site),
            seo: () => readSeoRenderDefaults(site.siteSettingsStore),
          }
          // A failure on a multi-step form only ever comes from the final
          // step's real validation (an intermediate step never calls it —
          // see `forms-router.ts`'s own comment), so redisplaying "the last
          // step, with everything posted" is always the right page.
          const stepsCount = definition?.steps.length ?? 0
          const accumulatedFromBody = (() => {
            const raw = postedFields['_accumulated']
            if (typeof raw !== 'string' || raw.trim() === '') return {}
            try {
              const parsed: unknown = JSON.parse(raw)
              return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
                ? (parsed as Record<string, unknown>)
                : {}
            } catch {
              return {}
            }
          })()
          const html =
            definition === null
              ? await renderFormNotFoundPage(formPageOptions, context)
              : await renderFormPage(
                  definition,
                  {
                    errorMessage:
                      errorBody.error?.message ?? 'This submission could not be accepted.',
                    errorField: errorBody.error?.field ?? null,
                    values: { ...accumulatedFromBody, ...postedFields },
                    ...(stepsCount > 1
                      ? {
                          step: stepsCount - 1,
                          accumulated: accumulatedFromBody,
                          ...(typeof postedFields['_ts'] === 'string'
                            ? { ts: postedFields['_ts'] }
                            : {}),
                        }
                      : {}),
                  },
                  formPageOptions,
                  context,
                )
          res.writeHead(definition === null ? 404 : response.status, {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
          })
          res.end(html)
          return
        }

        writeRestResponse(res, response)
        return
      }

      // The 404 log's own admin screen (fiche 12 task 1) — read and dismiss
      // only; the log fills itself from the public GET path below.
      if (url.pathname === '/api/not-found') {
        const body =
          req.method === 'DELETE' || req.method === 'GET' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        writeRestResponse(res, await site.notFoundRouter.handle(request, context))
        return
      }

      // Read-only mirrors of `security`/`webhooks`/`config` from the config
      // file (audit follow-up to L10 task 6 / L14 task 1; `config-status`
      // added by fiche 23 task 5), plus the trash auto-purge's live sweep
      // state (fiche 07 task 5) — see `ops-status-router.ts` for why editing
      // them here would be the wrong architecture.
      if (
        url.pathname === '/api/security-status' ||
        url.pathname === '/api/webhooks-status' ||
        url.pathname === '/api/trash-status' ||
        url.pathname === '/api/config-status'
      ) {
        const request = toRestRequest(req, url, undefined)
        writeRestResponse(res, await site.opsStatusRouter.handle(request, context))
        return
      }

      // The editorial site settings (fiche 23, ADR-0025): read is public —
      // the theme's own homepage/tagline render must answer the same thing
      // to an anonymous visitor as `GET /api/settings` does — write is
      // admin-only, checked per setting by the router itself.
      if (url.pathname === '/api/settings') {
        const body = req.method === 'PATCH' ? await readBody(req) : undefined
        const request = toRestRequest(req, url, body)
        const response = await site.siteSettingsRouter.handle(request, context)
        writeRestResponse(res, response)
        await recordSiteSettingsAudit(site, actor, req.method ?? 'GET', response, logger)
        return
      }

      // The admin's own runtime template + personalisation (L21 task 2) —
      // distinct from `/api/theme` (contract D, the public site's own
      // theming, `themeRouter` above): read is public (the login screen
      // paints in the chosen template before a session exists), write is
      // admin-only, checked by the router itself.
      if (url.pathname === '/api/admin-theme') {
        const body = req.method === 'PUT' ? await readBody(req) : undefined
        const request = toRestRequest(req, url, body)
        const response = await site.adminThemeRouter.handle(request, context)
        writeRestResponse(res, response)
        await recordAdminThemeAudit(site, actor, req.method ?? 'GET', response, logger)
        return
      }

      // The "Santé" screen (fiche 24 tasks 1, 2, 4): the same `runDoctor`
      // `cogenta doctor` calls, migrations, audit integrity and the bounded
      // server error log — all read-only, admin-only, all injected rather
      // than recomputed here.
      if (
        extras !== undefined &&
        (url.pathname === '/api/health-report' ||
          url.pathname === '/api/migrations-status' ||
          url.pathname === '/api/migrations-apply' ||
          url.pathname === '/api/audit-integrity' ||
          url.pathname === '/api/disk-usage' ||
          url.pathname === '/api/error-log' ||
          url.pathname === '/api/maintenance')
      ) {
        const body = req.method === 'POST' ? await readBody(req) : undefined
        const request = toRestRequest(req, url, body)
        writeRestResponse(res, await extras.healthRouter.handle(request, context))
        return
      }

      // The "Exploitation" > Observability screen (fiche L22 task 5):
      // recent request traces and structured-log lines this process has
      // captured locally, admin-only, read-only.
      if (extras?.observabilityRouter !== undefined && url.pathname === '/api/observability') {
        const request = toRestRequest(req, url, undefined)
        writeRestResponse(res, await extras.observabilityRouter.handle(request, context))
        return
      }

      // The "Outils" screen (fiche 24 task 3): purge caches, reindex,
      // regenerate image variants, check links, test email, purge expired
      // trash — every one of them queued, never run inline in this request.
      if (extras !== undefined && url.pathname.startsWith('/api/tools')) {
        const body = req.method === 'POST' ? await readBody(req) : undefined
        const request = toRestRequest(req, url, body)
        writeRestResponse(res, await extras.toolsRouter.handle(request, context))
        return
      }

      // The "Tâches planifiées" screen (fiche 28 task 2, L20 audit §1 point
      // 6). Same shape as the two routes above: admin-only, a thin
      // read-through the router itself enforces.
      if (
        extras?.scheduledTasksRouter !== undefined &&
        url.pathname.startsWith('/api/scheduled-tasks')
      ) {
        const body = req.method === 'POST' ? await readBody(req) : undefined
        const request = toRestRequest(req, url, body)
        writeRestResponse(res, await extras.scheduledTasksRouter.handle(request, context))
        return
      }

      // The full-text index, reachable at last (L10 task 3). Its own router
      // decides which collections this actor may search — never this layer.
      if (url.pathname === '/api/search') {
        const request = toRestRequest(req, url, undefined)
        writeRestResponse(res, await site.searchRouter.handle(request, context))
        return
      }

      // The Search Console connector (fiche 70 task 4, ADR-0032) — checked
      // *before* the generic `/api/seo` prefix below, which would otherwise
      // swallow it (`startsWith('/api/seo')` matches this path too). Its
      // `callback` route is the one place on this whole server that a
      // request with no `Authorization` header is expected and correct —
      // see the router's own module comment.
      if (url.pathname.startsWith('/api/seo/search-console')) {
        const request = toRestRequest(req, url, undefined)
        writeRestResponse(res, await site.searchConsoleRouter.handle(request, context))
        return
      }

      // Fiche 13's admin-only door onto `@cogenta/seo`: a live preview of one
      // edit in progress, and the site-wide diagnostic. Both permission
      // checks live in the router itself, exactly like `/api/redirects`.
      if (url.pathname.startsWith('/api/seo')) {
        const body = req.method === 'POST' ? await readBody(req) : undefined
        const request = toRestRequest(req, url, body)
        writeRestResponse(res, await site.seoRouter.handle(request, context))
        return
      }

      // The review queue (`schema@2.1`, ADR-0027, fiche 37 task 3) — its own
      // router, same reasoning as search: it decides which collections are
      // in scope for this actor and this tab, never this layer.
      if (url.pathname === '/api/review') {
        const request = toRestRequest(req, url, undefined)
        writeRestResponse(res, await site.reviewRouter.handle(request, context))
        return
      }

      // `/api/analytics/beacon` (public) and `/api/analytics/summary`
      // (admin-only) — see `@cogenta/analytics` and `analytics-router.ts` for
      // why both live behind one router with opposite trust models.
      if (url.pathname.startsWith('/api/analytics')) {
        const request = toRestRequest(req, url, undefined)
        writeRestResponse(
          res,
          await site.analyticsRouter.handle(request, { actor: context.actor, ip: clientIpOf(req) }),
        )
        return
      }

      if (url.pathname.startsWith('/api/audit')) {
        const request = toRestRequest(req, url, undefined)
        const response = await site.auditRouter.handle(request, context.actor)
        writeRestResponse(res, response)
        await recordAuditExportAudit(
          site,
          context.actor,
          req.method ?? 'GET',
          url.pathname,
          request.query,
          response,
          logger,
        )
        return
      }

      // The admin chrome's one aggregated read (fiche 35 task 3) — badges
      // and feature flags in a single round trip, never one request per
      // nav entry.
      if (url.pathname === '/api/shell-status') {
        const request = toRestRequest(req, url, undefined)
        writeRestResponse(res, await site.shellStatusRouter.handle(request, context))
        return
      }

      if (url.pathname.startsWith('/api/notices/channels')) {
        const body =
          req.method === 'GET' || req.method === 'DELETE' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        writeRestResponse(
          res,
          await site.noticeChannelSettingsRouter.handle(request, context.actor),
        )
        return
      }

      if (url.pathname.startsWith('/api/notices')) {
        // GET has no body; `POST .../{id}/dismiss` never reads one either,
        // but `POST /api/notices/read` (fiche 38 task 2) does — same split
        // as `/api/users` below, not a GET-only assumption any more.
        const body = req.method === 'GET' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        writeRestResponse(res, await site.noticeRouter.handle(request, context.actor))
        return
      }

      if (url.pathname.startsWith('/api/users')) {
        const body =
          req.method === 'GET' || req.method === 'DELETE' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        const response = await site.usersRouter.handle(request, context.actor)
        writeRestResponse(res, response)
        // T09-05: account creation, password change and session revoke are
        // now recorded directly by `users-router.ts` itself, at the exact
        // point each mutates a row — `recordUserAudit`'s HTTP-path sniffing
        // is gone rather than kept as a redundant second writer.
        return
      }

      // Machine-to-machine bearer credentials, admin-only (L13 task 8).
      if (url.pathname.startsWith('/api/api-keys')) {
        const body =
          req.method === 'GET' || req.method === 'DELETE' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        const response = await site.apiKeysRouter.handle(request, context.actor)
        writeRestResponse(res, response)
        await recordApiKeyAudit(site, actor, req.method ?? 'GET', url.pathname, response, logger)
        return
      }

      if (url.pathname.startsWith('/api/site-plans') && site.sitePlanRouter !== undefined) {
        // `SitePlanRouter` itself refuses every route to a non-admin actor,
        // but only after `readBody` has already buffered the whole request —
        // and this route, alone among this server's routes, invites
        // multi-megabyte bodies by design (uploaded documents). Checking the
        // role here, before the body is read at all, means an unauthenticated
        // or non-admin caller is turned away without the server ever reading
        // what they sent.
        if (!context.actor.roles.includes('admin')) {
          jsonError(res, 403, 'FORBIDDEN', 'Only the admin role may propose or apply a site plan.')
          return
        }
        const body =
          req.method === 'GET' || req.method === 'DELETE' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        writeRestResponse(res, await site.sitePlanRouter.handle(request, context.actor))
        return
      }

      // `/api/updates` — L22 task 9. Admin-only, same early check as
      // `/api/site-plans` above, before the body is read.
      if (url.pathname.startsWith('/api/updates')) {
        if (!context.actor.roles.includes('admin')) {
          jsonError(res, 403, 'FORBIDDEN', 'Only the admin role may check for or apply an update.')
          return
        }
        const body = req.method === 'GET' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        writeRestResponse(res, await site.updatesRouter.handle(request, context.actor))
        return
      }

      // `/api/theme/preview` (fiche 14 task 2) — a candidate token/CSS
      // overlay, rendered on the real home page without saving it. Checked
      // before the generic `/api/theme` mount below since this is not a
      // `ThemeRouter` route: it needs `renderRequestedPage`, which that
      // router structurally cannot reach (same reason `/api/builder/render`
      // lives here rather than inside a router package).
      if (url.pathname === '/api/theme/preview') {
        if (req.method !== 'POST') {
          res.writeHead(405, { allow: 'POST' }).end()
          return
        }
        if (!context.actor.roles.includes('admin')) {
          jsonError(res, 403, 'FORBIDDEN', 'Only the admin role may preview a theme change.')
          return
        }
        if (site.previewStyles === undefined) {
          jsonError(res, 404, 'CONTENT_NOT_FOUND', 'This instance has no theme preview.')
          return
        }
        const body = (await readBody(req)) as
          | { pathname?: unknown; tokens?: unknown; additionalCss?: unknown }
          | undefined
        const pathname =
          typeof body?.pathname === 'string' && body.pathname.startsWith('/') ? body.pathname : '/'
        let previewStyles: string | null
        try {
          previewStyles = await site.previewStyles({
            ...(typeof body?.tokens === 'object' && body.tokens !== null
              ? { tokens: body.tokens as Record<string, unknown> }
              : {}),
            ...(typeof body?.additionalCss === 'string'
              ? { additionalCss: body.additionalCss }
              : {}),
          })
        } catch (error) {
          writeRestResponse(res, errorResponse(error))
          return
        }
        const html = await renderRequestedPage(
          pathname,
          {
            collections: site.collections,
            gateway: site.gateway,
            site: site.site,
            styles: previewStyles,
            loadMedia: (ids) => loadRenderMedia(site, ids),
            // A preview is never a real visit, and never cacheable.
            analyticsBeacon: {},
            menuRouter: site.menuRouter,
            homePath: async () => {
              const setting = await site.siteSettingsStore.get(
                'reading.homePath',
                SITE_SETTINGS_SITE_SCOPE,
              )
              return typeof setting?.value === 'string' ? setting.value : null
            },
            seo: () => readSeoRenderDefaults(site.siteSettingsStore),
          },
          context,
        )
        if (html === null) {
          jsonError(
            res,
            404,
            'CONTENT_NOT_FOUND',
            'No page exists at this path to preview against.',
          )
          return
        }
        // `renderRequestedPage`'s own `styles` option only decides whether
        // the `<link rel="stylesheet">` tag is emitted — the browser then
        // fetches whatever `/_cogenta/styles.css` currently serves, which is
        // the *saved* overrides, never an unsaved candidate. An inline
        // `<style>` right before `</head>` overrides those custom
        // properties by cascade order (same `:root` specificity, later
        // wins) — the one place in this file a `<style>` tag is correct
        // rather than a CSP violation: this response is JSON, consumed by
        // the appearance screen's own iframe (`srcDoc`, not a served
        // document on the site's own origin), the same trust boundary
        // `PreviewFrame` already relies on for the page builder.
        const withPreviewCss =
          previewStyles === null
            ? html
            : html.replace('</head>', `<style>${previewStyles}</style></head>`)
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        })
        res.end(JSON.stringify({ data: { html: withPreviewCss } }))
        return
      }

      // `/api/theme/gallery-preview` (fiche L24 task 5) — the appearance
      // screen's visual preview of a candidate theme *package*, distinct
      // from `/api/theme/preview` above (which previews a colour/token
      // candidate on the site's own real home page, in the currently active
      // theme). Checked before the generic `/api/theme` mount below for the
      // same structural reason `/api/theme/preview` is: it needs
      // `renderThemeGalleryPreview`, which that router cannot reach.
      //
      // Same principle as the visual page builder (L16) and the token
      // preview above — an iframe on a real server render, never a static
      // screenshot or a second React reimplementation of the twelve blocks.
      // What differs here is the entry: there is no real page to show yet on
      // a site with no content, so this renders one fixed, database-free
      // demo page identically across every theme asked for — see
      // `renderThemeGalleryPreview`'s own comment for why fixed content, the
      // same across every card, is the fairer comparison. `site.gateway` is
      // never touched, so this cannot leak a draft or private entry.
      if (url.pathname === '/api/theme/gallery-preview') {
        if (req.method !== 'POST') {
          res.writeHead(405, { allow: 'POST' }).end()
          return
        }
        if (!context.actor.roles.includes('admin')) {
          jsonError(res, 403, 'FORBIDDEN', 'Only the admin role may preview a theme.')
          return
        }
        if (site.themeGalleryStyles === undefined) {
          jsonError(res, 404, 'CONTENT_NOT_FOUND', 'This instance has no theme gallery preview.')
          return
        }
        const body = (await readBody(req)) as { theme?: unknown } | undefined
        const themeName = typeof body?.theme === 'string' ? body.theme : ''
        if (!(await availableThemes()).some((candidate) => candidate.name === themeName)) {
          jsonError(
            res,
            404,
            'THEME_NOT_FOUND',
            `No theme named "${themeName}" is available on this instance.`,
          )
          return
        }
        const styles = await site.themeGalleryStyles(themeName)
        const html = await renderThemeGalleryPreview(themeName, {
          site: site.site,
          styles,
          branding: () => brandingForSite(site),
        })
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        })
        res.end(JSON.stringify({ data: { html } }))
        return
      }

      // `/api/theme` (fiche 14) — the appearance screen. Admin only, every
      // route; `ThemeRouter` itself refuses a non-admin, checked again here
      // is unnecessary since nothing below reads the body unbounded the way
      // `/api/site-plans` does. Absent only when this instance built no
      // theme wiring (never true for a real `cogenta serve`/`cogenta dev`).
      if (url.pathname.startsWith('/api/theme') && site.themeRouter !== undefined) {
        const body =
          req.method === 'GET' || req.method === 'DELETE' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        writeRestResponse(res, await site.themeRouter.handle(request, context.actor))
        return
      }

      // The admin's WordPress importer. Same defensive order as
      // `/api/site-plans` just above and for the same reason: this route
      // invites a multi-megabyte upload by design, so the role is checked
      // before `readBody` buffers anything at all.
      if (url.pathname.startsWith('/api/import')) {
        if (!context.actor.roles.includes('admin')) {
          jsonError(res, 403, 'FORBIDDEN', 'Only the admin role may import content.')
          return
        }
        const body = req.method === 'GET' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        const response = await site.importRouter.handle(request, context.actor)
        writeRestResponse(res, response)
        await recordImportAudit(site, actor, req.method ?? 'GET', url.pathname, response, logger)
        return
      }

      // Always mounted, on every site (L18). On one with no AI provider it is
      // the route that answers `{available: false}`, which is precisely what
      // lets the admin panel disappear instead of failing.
      if (url.pathname.startsWith('/api/assistant')) {
        const body = req.method === 'GET' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        writeRestResponse(res, await site.assistantRouter.handle(request, context))
        return
      }

      if (url.pathname.startsWith('/api/agents') && site.agentsRouter !== undefined) {
        // L22 task 1: create/update/run all carry a JSON body — the pre-L22
        // enable/disable-only router never needed one, this one does.
        const body = req.method === 'GET' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        writeRestResponse(res, await site.agentsRouter.handle(request, context.actor))
        return
      }

      if (url.pathname.startsWith('/api/providers') && site.providersRouter !== undefined) {
        const body = req.method === 'GET' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        writeRestResponse(res, await site.providersRouter.handle(request, context.actor))
        return
      }

      if (url.pathname.startsWith('/api/agent-skills') && site.agentSkillsRouter !== undefined) {
        const body = req.method === 'GET' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        writeRestResponse(res, await site.agentSkillsRouter.handle(request, context.actor))
        return
      }

      // Fiche 58 tasks 2/3 — "MCP Clients". `mcpConnectionsRouter` is built
      // unconditionally (see `assembleSite`), so this branch is always live
      // once a site has a database, unlike the three above it.
      if (
        url.pathname.startsWith('/api/mcp-connections') &&
        site.mcpConnectionsRouter !== undefined
      ) {
        const body = req.method === 'GET' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        writeRestResponse(res, await site.mcpConnectionsRouter.handle(request, context.actor))
        return
      }

      if (
        url.pathname.startsWith('/api/prompt-templates') &&
        site.promptTemplatesRouter !== undefined
      ) {
        const body = req.method === 'GET' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        writeRestResponse(res, await site.promptTemplatesRouter.handle(request, context.actor))
        return
      }

      // Driver connectivity/latency, not process metrics or uptime — the
      // same two live selections `cogenta doctor` reports from a terminal,
      // here queried from the running server instead. Admin-only: a
      // driver's `message`/`details` are documented as credential-free, but
      // naming which driver and tier is running is still information the
      // `public` role has no reason to see.
      if (url.pathname === '/api/health') {
        if (req.method !== 'GET') {
          res.writeHead(405, { allow: 'GET' }).end()
          return
        }
        if (!actor.roles.includes('admin')) {
          jsonError(res, 403, 'FORBIDDEN', 'Only the admin role may read site health.')
          return
        }
        const health = await site.health()
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ data: health }))
        return
      }

      // The visual page builder's preview (L16). It renders an *unsaved* block
      // list through the very function that renders the published page, so the
      // builder can show the real thing in an iframe instead of a React
      // approximation of the twelve blocks.
      //
      // Three gates, in this order, before any of that happens:
      //  1. an authenticated actor — an anonymous caller has no editing
      //     session, so it has no business asking for a render of a page state
      //     that does not exist yet;
      //  2. `update` on the collection, asked of the same `PermissionLayer`
      //     every other write path asks (R4: the route verifies, the renderer
      //     does not);
      //  3. `renderDraftPage` reads the stored entry through the same
      //     permission-checked gateway, and every `collectionList` block on
      //     the page queries through it too — so a draft cannot be used to
      //     read content this actor could not already read.
      if (url.pathname === '/api/builder/render') {
        if (req.method !== 'POST') {
          res.writeHead(405, { allow: 'POST' }).end()
          return
        }
        if (actor.id === null) {
          jsonError(res, 401, 'UNAUTHENTICATED', 'This preview needs a signed-in editor.')
          return
        }
        const body = (await readBody(req)) as
          | { collection?: unknown; entryId?: unknown; blocks?: unknown; values?: unknown }
          | undefined
        const collectionName = typeof body?.collection === 'string' ? body.collection : ''
        const entryId = typeof body?.entryId === 'string' ? body.entryId : ''
        const collection = site.collections.find((entry) => entry.name === collectionName)
        if (collection === undefined || entryId === '') {
          jsonError(res, 404, 'CONTENT_NOT_FOUND', 'No such collection or entry.')
          return
        }
        // `errorResponse` rather than the outer catch: it is what turns a
        // `CogentaError` into the status its code deserves (403 for
        // `FORBIDDEN`), and it is already the mapping every `/api/*` router
        // uses. The outer catch would answer 500 to a refusal.
        let html: string | null
        try {
          site.permissions.assert('update', collection, context)
          html = await renderDraftPage(
            {
              collection: collectionName,
              entryId,
              blocks: (body?.blocks ?? {}) as BlockZones,
              ...(typeof body?.values === 'object' && body.values !== null
                ? { values: body.values as Record<string, unknown> }
                : {}),
            },
            {
              collections: site.collections,
              gateway: site.gateway,
              site: site.site,
              styles: site.styles,
              loadMedia: (ids) => loadRenderMedia(site, ids),
              // Present so the preview's `<body>` stays byte-identical to the
              // published page's (the property `theme-render-fidelity`
              // proves) — a POST carries no navigation `Referer` to report,
              // so this omits `referrer` the same way an ordinary page view
              // with no referrer does. The preview does still count as a
              // view; there is no distinct "not a real visit" signal to send
              // that would not itself become a body difference.
              analyticsBeacon: {},
              menuRouter: site.menuRouter,
              // Present for the same reason `homePath` is on the public GET
              // below: the L16 fidelity test asserts this preview's `<head>`
              // differs from the published page's by *only* `noindex` and the
              // missing canonical — a title template applied to one but not
              // the other would be a second, spurious difference.
              seo: () => readSeoRenderDefaults(site.siteSettingsStore),
              // `comments` deliberately absent here, unlike the public render
              // below: the thread's own form embeds a render timestamp
              // (`_ts`, the minimum-fill-delay field, fiche 15 task 6) that
              // cannot be identical across two separate renders no matter
              // how close together they happen — comparing it byte-for-byte
              // against the published page would be comparing two different
              // legitimate values, not catching a real divergence. The page
              // builder edits blocks; the visitor comment thread is not one
              // of them, so the preview simply does not render it — the same
              // reasoning that already keeps `adminBar` out of this render.
              // `theme-render-fidelity`-style byte equality still holds for
              // everything this preview *does* claim to show.
              branding: () => brandingForSite(site),
              activeTheme: () => activeThemeForSite(site),
            },
            context,
          )
        } catch (error) {
          logger.warn('builder preview refused', {
            error: isCogentaError(error) ? error.toJSON() : String(error),
          })
          writeRestResponse(res, errorResponse(error))
          return
        }
        if (html === null) {
          jsonError(res, 404, 'CONTENT_NOT_FOUND', 'No such collection or entry.')
          return
        }
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          // A draft is never cacheable, by anyone, for any length of time.
          'cache-control': 'no-store',
        })
        res.end(JSON.stringify({ data: { html } }))
        return
      }

      // Everything below is the public site rather than the API, so the
      // redirect table gets its turn first: a page renamed last month must
      // answer its old URL with the 301 the rename recorded, not a 404 (L10
      // task 2). Before route matching, so a redirect wins even when some
      // other entry has since taken the old path — that is what `release()`
      // is for on the write side. Prefix patterns (fiche 12 task 4) are
      // checked only when the exact-match table finds nothing — a curated
      // rule for one path always wins over a broad prefix rewrite.
      if (req.method === 'GET' || req.method === 'HEAD') {
        const redirect =
          (await site.redirects.resolve(url.pathname)) ??
          (await site.redirectPatterns.resolve(url.pathname))
        if (redirect !== null) {
          if (redirect.status === 410) {
            // Not a redirect at all: no `Location`, and cacheable for a
            // while — "gone for good" does not change from one request to
            // the next the way a temporary hop might.
            res.writeHead(410, {
              'content-type': 'text/plain; charset=utf-8',
              'cache-control': 'public, max-age=3600',
            })
            res.end('Gone')
            return
          }
          const cacheableByBrowsersAndCrawlers = redirect.status === 301 || redirect.status === 308
          res.writeHead(redirect.status, {
            location: `${redirect.to}${url.search}`,
            'cache-control': cacheableByBrowsersAndCrawlers ? 'public, max-age=3600' : 'no-store',
          })
          res.end()
          return
        }
      }

      // `robots.txt` and `sitemap.xml`, from the real content (L10 task 2).
      // Both are built as `ANONYMOUS` inside `collectRoutedResources`,
      // whoever asked: a crawler and a signed-in editor must get the same
      // document, or the sitemap advertises URLs the crawler cannot fetch.
      if (url.pathname === '/robots.txt') {
        if (req.method !== 'GET') {
          res.writeHead(405, { allow: 'GET' }).end()
          return
        }
        // Fiche 50 task 4 — an admin's own robots.txt lines, merged in
        // verbatim by `renderRobots`. Read fresh, same "no restart" contract
        // as everything else `readSeoRenderDefaults` feeds.
        const { robotsCustomRules } = await readSeoRenderDefaults(site.siteSettingsStore)
        res.writeHead(200, {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'public, max-age=3600',
        })
        res.end(
          renderRobots(seoSiteFor(site.site), {
            ...(robotsCustomRules === '' ? {} : { customRules: robotsCustomRules }),
          }),
        )
        return
      }

      // `llms.txt` (fiche 50 task 5) — off by default (`seo.llmsTxtEnabled`),
      // reusing `llmsTxtSectionsFor`/`renderLlmsTxt` (`@cogenta/seo`), written
      // and unit-tested back in L3/L9 but never served by any route until now.
      if (url.pathname === '/llms.txt') {
        if (req.method !== 'GET') {
          res.writeHead(405, { allow: 'GET' }).end()
          return
        }
        const { llmsTxtEnabled } = await readSeoOperationalSettings(site.siteSettingsStore)
        if (!llmsTxtEnabled) {
          jsonError(res, 404, 'CONTENT_NOT_FOUND', 'This site does not serve llms.txt.')
          return
        }
        const seoDefaults = await readSeoRenderDefaults(site.siteSettingsStore)
        const seoSite = seoSiteFor(site.site, seoDefaults)
        const resources = await collectRoutedResources(site.collections, site.gateway)
        res.writeHead(200, {
          'content-type': 'text/markdown; charset=utf-8',
          'cache-control': 'public, max-age=600',
        })
        res.end(renderLlmsTxt({ site: seoSite, sections: llmsTxtSectionsFor(seoSite, resources) }))
        return
      }

      // IndexNow's own ownership-proof key file (fiche 50 task 3) — served
      // only when IndexNow is on and the requested key is the one currently
      // configured. A path that merely *looks* like a key file, or a key
      // that does not match, falls through to the ordinary 404 below rather
      // than answering a distinct "wrong key" response that would let a
      // prober learn whether IndexNow is configured at all.
      {
        const keyFileMatch = INDEXNOW_KEY_FILE_PATTERN.exec(url.pathname)
        if (keyFileMatch !== null && req.method === 'GET') {
          const operational = await readSeoOperationalSettings(site.siteSettingsStore)
          if (operational.indexNowEnabled && operational.indexNowKey === keyFileMatch[1]) {
            res.writeHead(200, {
              'content-type': 'text/plain; charset=utf-8',
              'cache-control': 'public, max-age=3600',
            })
            res.end(indexNowKeyFile(operational.indexNowKey).contents)
            return
          }
        }
      }

      if (SITEMAP_PATH.test(url.pathname)) {
        if (req.method !== 'GET') {
          res.writeHead(405, { allow: 'GET' }).end()
          return
        }
        const seoDefaults = await readSeoRenderDefaults(site.siteSettingsStore)
        const seoSite = seoSiteFor(site.site, seoDefaults)
        const files = buildSitemapFiles(
          seoSite,
          await collectRoutedResources(site.collections, site.gateway),
          seoDefaults.sitemapCollectionSettings,
        )
        const file = files.find((candidate) => candidate.path === url.pathname)
        if (file !== undefined) {
          res.writeHead(200, {
            'content-type': 'application/xml; charset=utf-8',
            'cache-control': 'public, max-age=600',
          })
          res.end(file.contents)
          return
        }
        // `/sitemap-9.xml` on a site that only needs one file is a real 404,
        // not an empty urlset: an empty chunk would tell a crawler the site
        // has nothing there rather than that the URL is wrong.
        jsonError(res, 404, 'CONTENT_NOT_FOUND', 'No sitemap file at this path.')
        return
      }

      // The public search page (L10 task 3): a real form and a real results
      // list, served through the same permission-checked search router the
      // API uses. Deliberately a route rather than a contract B block — see
      // `search-page.ts` for why.
      if (url.pathname === '/search' && req.method === 'GET') {
        const html = await renderSearchPage(
          url.searchParams.get('q') ?? '',
          {
            router: site.searchRouter,
            gateway: site.gateway,
            collections: site.collections,
            site: site.site,
            styles: await site.resolveStyles(),
            menus: { menuRouter: site.menuRouter },
            branding: () => brandingForSite(site),
            activeTheme: () => activeThemeForSite(site),
            seo: () => readSeoRenderDefaults(site.siteSettingsStore),
          },
          context,
        )
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        })
        res.end(html)
        return
      }

      // `GET /forms/{name}` — the public "route dédiée" ADR-0026 chose for a
      // form's first arrival on a page. `?submitted=1` (no `redirectTo`
      // configured) shows the confirmation view instead of the form itself.
      {
        const formPageMatch = /^\/forms\/([^/]+)$/u.exec(url.pathname)
        if (formPageMatch !== null && req.method === 'GET') {
          const formName = formPageMatch[1] as string
          const definition = await site.formStore.definitions.readByName(formName)
          const formPageOptions = {
            site: site.site,
            styles: await site.resolveStyles(),
            now: Date.now,
            menus: { menuRouter: site.menuRouter },
            branding: () => brandingForSite(site),
            activeTheme: () => activeThemeForSite(site),
            seo: () => readSeoRenderDefaults(site.siteSettingsStore),
          }
          const html =
            definition === null || !definition.active
              ? await renderFormNotFoundPage(formPageOptions, context)
              : await renderFormPage(
                  definition,
                  { submitted: url.searchParams.get('submitted') === '1' },
                  formPageOptions,
                  context,
                )
          res.writeHead(definition === null || !definition.active ? 404 : 200, {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
          })
          res.end(html)
          return
        }
      }

      // Real theme HTML for anything else — see `theme-render.ts`'s own
      // doc comment for what this is and, as importantly, what it isn't
      // (no Astro build, one theme, no image pipeline). GET only: rendering
      // a page has no meaningful response to any other method.
      if (req.method === 'GET') {
        const renderOptions = {
          collections: site.collections,
          gateway: site.gateway,
          site: site.site,
          // Live, not the startup snapshot — a saved appearance override
          // must show up on the very next page view (fiche 14).
          styles: await site.resolveStyles(),
          loadMedia: (ids: readonly string[]) => loadRenderMedia(site, ids),
          // Self-hosted analytics (`@cogenta/analytics`): the referrer is read
          // from *this* request's own header, server-side — see
          // `analyticsBeaconTag` in `theme-render.ts` for why that, rather
          // than a client script, is how this page's beacon pixel gets it.
          analyticsBeacon: { referrer: req.headers.referer },
          menuRouter: site.menuRouter,
          // The homepage a rédacteur chose from the admin (fiche 23 task 4),
          // read fresh on every request — "sans redéployer" only holds if
          // this is not cached at startup. `theme-render.ts` falls back to
          // `/home` when nothing was ever written.
          homePath: async () => {
            const setting = await site.siteSettingsStore.get(
              'reading.homePath',
              SITE_SETTINGS_SITE_SCOPE,
            )
            return typeof setting?.value === 'string' ? setting.value : null
          },
          // The SEO title templates, default description, Twitter handle and
          // default social image an admin set from `/seo` (fiche 21 task 3),
          // read fresh — same "no restart" contract as `homePath` above.
          seo: () => readSeoRenderDefaults(site.siteSettingsStore),
          comments: {
            action: '/api/comments',
            forEntry: (commentCollection: string, entryId: string, locale: string | null) =>
              commentsForEntry(site, commentCollection, entryId, locale),
          },
          branding: () => brandingForSite(site),
          activeTheme: () => activeThemeForSite(site),
        }
        const html = await renderRequestedPage(url.pathname, renderOptions, context)
        if (html !== null) {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
          res.end(html)
          return
        }

        // The 404 log (fiche 12 task 1): every public GET that matched no
        // route, recorded by path — never by IP or user agent — so the ten
        // URLs most requested and never found are visible without anyone
        // discovering that by luck. A failed write here must never turn an
        // honest 404 into a 500. `/api/*` is excluded: an unmatched API path
        // falls through to this same branch (nothing above returns for it
        // either), but a wrong or retired API call is not a broken page link.
        if (site.notFoundLogEnabled && !url.pathname.startsWith('/api/')) {
          try {
            await site.notFoundLog.record({
              path: url.pathname,
              ...(req.headers.referer === undefined ? {} : { referrer: req.headers.referer }),
            })
          } catch (error) {
            logger.warn('not-found log write failed', { error: String(error) })
          }
        }

        // The site's own 404 page (L14 task 2). It is an ordinary entry at
        // `site.notFoundPath`, rendered by exactly the same function and
        // through exactly the same permission-checked gateway as any other
        // page — a custom 404 that could show content the visitor may not read
        // would be a hole, not a feature.
        //
        // The guard matters: without it, a site whose 404 page is missing (or
        // whose `notFoundPath` is itself unroutable) would ask for it again
        // for every unmatched URL forever. One extra lookup, never two.
        if (url.pathname !== site.site.notFoundPath) {
          const notFound = await renderRequestedPage(site.site.notFoundPath, renderOptions, context)
          if (notFound !== null) {
            res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' })
            res.end(notFound)
            return
          }
        }
      }

      res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
      res.end(
        JSON.stringify({
          error: { code: 'CONTENT_NOT_FOUND', message: 'No route matches this path.' },
        }),
      )
    } catch (error) {
      logger.error('request failed', {
        error: isCogentaError(error) ? error.toJSON() : String(error),
      })
      // The error journal (fiche 24 task 4): a bounded, redacted record of
      // exactly this failure, readable from the admin on a host where the
      // process's own stdout is not — see `createErrorLog` for why redaction
      // here is not optional.
      extras?.errorLog.recordError(error, { method: req.method ?? 'GET', path: url.pathname })
      if (isCogentaError(error) && error.code === 'REQUEST_BODY_TOO_LARGE') {
        jsonError(res, 413, error.code, error.message)
        return
      }
      // A valid, over-quota API key (fiche 20 task 3) — the one error this
      // listener turns into rate-limit headers, since `errorResponse` in
      // `@cogenta/api` deliberately never serialises `details` onto the wire
      // (that field is for logs, and could otherwise echo caller-controlled
      // data). `resolveActor` throws this only after resolving a real,
      // valid key, so the caller is exactly who it says it is; it just has
      // to wait.
      if (isCogentaError(error) && error.code === 'API_KEY_RATE_LIMITED') {
        res.writeHead(429, rateLimitHeaders(error.details))
        res.end(JSON.stringify({ error: { code: error.code, message: error.message } }))
        return
      }
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
      res.end(
        JSON.stringify({
          error: { code: 'INTERNAL', message: 'The request could not be completed.' },
        }),
      )
    }
  }
}

export interface ServeOptions {
  readonly cwd?: string
  readonly env?: Record<string, string | undefined>
  readonly logger?: Logger
  readonly out: Output
  readonly stderr: Writer
  readonly port?: number
  readonly host?: string
  /** Resolves once the server is actually listening — tests need the OS-assigned port. */
  onListening?: (address: { port: number; host: string }) => void
  /** Stops the server and disposes the database when aborted. */
  readonly signal?: AbortSignal
  /**
   * "Commencer par une démo en lecture seule" (L9 tâche 12, playground). Every
   * write attempt refuses with `CONTENT_READ_ONLY`; reads are unaffected.
   * Scheduling a periodic reset back to demo content is an operational
   * decision for whoever deploys a read-only instance, not made here.
   */
  readonly readOnly?: boolean
  /**
   * `cogenta dev` sets this; `cogenta serve` does not.
   *
   * It gates exactly one thing today: whether an approved site plan may be
   * **applied** (L19 task 7). ADR-0010 is explicit — "l'éditeur visuel de
   * schéma écrit ces fichiers, mais uniquement en mode développement. En
   * production le schéma est en lecture seule" — and applying a plan writes
   * `cogenta.schema.*` and creates tables, which is exactly that editor by
   * another name. Proposing and reviewing a plan stay available everywhere;
   * only the write is held to the decision.
   */
  readonly development?: boolean
  /**
   * Overrides `SCHEDULED_PUBLISH_TICK_MS`. Not a CLI flag — an operator has
   * no reason to change a 60-second cadence, and this exists so a test can
   * prove the interval really drains the queue without waiting a minute for
   * it.
   */
  readonly scheduledPublishTickMs?: number
  /** Overrides `NOT_FOUND_PURGE_TICK_MS`, for the same reason `scheduledPublishTickMs` exists. */
  readonly notFoundPurgeTickMs?: number
  /**
   * Overrides `AUDIT_INTEGRITY_TICK_MS` (fiche 21 task 3). Not a CLI flag,
   * same reason as `scheduledPublishTickMs` — exists so a test can prove the
   * scheduled check really runs without waiting a day for it.
   */
  readonly auditIntegrityTickMs?: number
  /**
   * Overrides `AUDIT_PRUNE_TICK_MS` (T09-01). Not a CLI flag, same reasoning
   * as `auditIntegrityTickMs` — exists so a test can prove the sweep really
   * runs without waiting a day for it.
   */
  readonly auditPruneTickMs?: number
  /**
   * Overrides `TRASH_PURGE_TICK_MS`. Not a CLI flag, same reasoning as
   * `scheduledPublishTickMs`: no operator has a reason to change a daily
   * cadence, this exists so a test can prove the sweep really runs without
   * waiting a day for it.
   */
  readonly trashPurgeTickMs?: number
  /** Test seam for the forms GDPR retention sweep (fiche 16 task 7) — production always uses `FORMS_PURGE_TICK_MS`. */
  readonly formsPurgeTickMs?: number
  /** Overrides `CHANNEL_NOTIFICATION_TICK_MS`, for the same reason as `scheduledPublishTickMs`. */
  readonly channelNotificationTickMs?: number
  /** Test seam for the commerce order-email retry queue (fiche 52 task 2) — production always uses `COMMERCE_EMAIL_TICK_MS`. */
  readonly commerceEmailTickMs?: number
  /**
   * Overrides `ANALYTICS_PURGE_TICK_MS`. Not a CLI flag, same reason as
   * `scheduledPublishTickMs`: a test proves the retention sweep really runs
   * without waiting a day for it.
   */
  readonly analyticsPurgeTickMs?: number
  /**
   * Overrides `OBSERVABILITY_SETTINGS_TICK_MS` (fiche L22 task 5). Not a CLI
   * flag, same reason as `scheduledPublishTickMs`: a test proves a settings
   * change really takes effect without waiting out the real interval.
   */
  readonly observabilitySettingsTickMs?: number
  /**
   * Overrides `UPDATES_AUTO_CHECK_TICK_MS` (L22 task 9). Not a CLI flag,
   * same reasoning as `scheduledPublishTickMs`: a test proves the
   * auto-update policy is really honoured without waiting a day for it.
   */
  readonly updatesAutoCheckTickMs?: number
  /** Test seam: replaces the real `fetch` to registry.npmjs.org with a scripted one — every update test in `packages/cli/test/` uses this rather than hitting the real network. */
  readonly updatesFetchImpl?: typeof fetch
  /** Test seam: replaces the real `npm install` child process — no test in this repository actually installs an npm package. */
  readonly updatesRunInstall?: RunPackageInstall
}

const UPDATES_AUTO_CHECK_TICK_MS = 24 * 60 * 60 * 1000

const DEFAULT_PORT = 4000
const DEFAULT_HOST = '127.0.0.1'

/** How long a shutdown waits for open connections before cutting them. */
const SHUTDOWN_GRACE_MS = 2_000

/**
 * How often `runServe` drains due scheduled-publication jobs (R1).
 *
 * `cogenta serve` has no persistent worker process beyond itself, so this
 * `setInterval` *is* the cron a hosted deployment with no worker would
 * otherwise need to configure by hand. The honest trade this makes: a page
 * scheduled for 09:00 goes live between 09:00 and 09:01, not exactly on the
 * hour. If the process is stopped when a publication comes due, nothing is
 * lost — the job is still in the `database` queue's table — it simply runs
 * on the first tick after the next start, however late that is.
 */
const SCHEDULED_PUBLISH_TICK_MS = 60_000

/**
 * How often `runServe` purges the 404 log past its configured retention
 * (fiche 12 task 1). Daily, not every minute like publication: a log purge
 * has no visitor waiting on it, and the log's own `maxPaths` cap — not this
 * interval — is what actually bounds its size between purges.
 */
const NOT_FOUND_PURGE_TICK_MS = 24 * 60 * 60 * 1000

/**
 * How often `runServe` runs the scheduled audit-integrity check (fiche 21
 * task 3). Daily by default — frequent enough that "altérer une ligne fait
 * apparaître une alerte dans les 24 heures" (the fiche's own acceptance
 * bound) holds with room to spare, rare enough that most ticks do the
 * cheap incremental form rather than a full replay.
 */
const AUDIT_INTEGRITY_TICK_MS = 24 * 60 * 60 * 1000

/**
 * How often `runServe` runs the audit-log retention sweep (T09-01). Daily,
 * the same cadence as the integrity check right above it — nobody is
 * waiting on a page load for an old audit entry to disappear, and
 * `security.audit.retainDays` itself is measured in whole days. The tick
 * itself is always registered; whether it actually prunes anything depends
 * entirely on `retainDays` being configured — see `tickAuditPrune`'s own
 * comment.
 */
const AUDIT_PRUNE_TICK_MS = 24 * 60 * 60 * 1000

/**
 * How often `runServe` sweeps every collection's trash past its
 * `retainDays` (fiche 07 task 5). Daily, not every minute like publication:
 * nobody is waiting on a page load for a trashed entry to disappear, and a
 * sweep that runs once a day is still the "purged automatically" the admin
 * screen advertises — `retainDays` itself is already measured in whole days.
 */
const TRASH_PURGE_TICK_MS = 24 * 60 * 60 * 1000
/** Same daily cadence as the trash sweep (fiche 16 task 7's GDPR retention, ADR-0022's `retainDays`/`purgeExpired` model applied to submissions). */
const FORMS_PURGE_TICK_MS = 24 * 60 * 60 * 1000

/**
 * How often `runServe` flushes queued/grouped channel notifications (fiche
 * 38 task 3, `NotificationDispatcher.flushDue`) — a quiet-hours deferral or
 * an hourly/daily digest sits in `@cogenta/channels`' own pending table
 * until this runs, the same R1-honest "no persistent worker" trade as
 * scheduled publication above.
 */
const CHANNEL_NOTIFICATION_TICK_MS = 60_000
const COMMERCE_EMAIL_TICK_MS = 60_000

/**
 * How often `runServe` purges analytics events (and their daily salts) past
 * the site's configured retention (fiche 27 task 3). Once a day: the events
 * table is the largest table on a site with real traffic, but retention is
 * measured in days, so nothing is lost by a sweep that runs on this cadence
 * rather than every minute — same honest trade `SCHEDULED_PUBLISH_TICK_MS`
 * documents for publication.
 */
const ANALYTICS_PURGE_TICK_MS = 24 * 60 * 60 * 1000

/**
 * How often `runServe` re-reads `observability.enabled`/
 * `observability.logLevel` from the settings store (fiche L22 task 5).
 * Every 15 seconds: frequent enough that flipping either from the admin
 * feels close to immediate, infrequent enough that it is nowhere near the
 * cost of a query per log call or per request.
 */
const OBSERVABILITY_SETTINGS_TICK_MS = 15_000

/**
 * Builds `/api/config-status`'s answer (fiche 23 task 5) from what
 * `loadConfig()` already resolved — a hand-picked, secret-free subset
 * (`ConfigStatusInput` has no field a secret could occupy), plus the
 * `secretHygiene` report `loadConfig()` computed from the raw file.
 */
function buildConfigStatus(
  config: CogentaConfig,
  secretHygiene: SecretHygieneReport,
): ConfigStatusInput {
  return {
    site: { name: config.site.name, url: config.site.url, notFoundPath: config.site.notFoundPath },
    database: { driver: config.database.driver },
    cache: { driver: config.cache.driver },
    queue: { driver: config.queue.driver },
    storage: {
      driver: config.storage.driver,
      bucket: config.storage.bucket,
      region: config.storage.region,
      endpoint: config.storage.endpoint,
    },
    llm:
      config.llm === undefined
        ? undefined
        : { provider: config.llm.provider, model: config.llm.model },
    embeddings: { provider: config.embeddings.provider, model: config.embeddings.model },
    imageGeneration:
      config.imageGeneration === undefined
        ? undefined
        : { provider: config.imageGeneration.provider, model: config.imageGeneration.model },
    vector: { driver: config.vector.driver },
    billingConfigured: config.billing !== undefined,
    secretHygiene,
  }
}

/**
 * Runs until `options.signal` aborts. Returns 0 on a clean shutdown, 1 if
 * startup failed — nothing here calls `process.exit` (same convention as
 * every other command), so an embedder controls the process lifecycle.
 */
export async function runServe(options: ServeOptions): Promise<number> {
  const { out, stderr } = options
  const env = options.env ?? process.env
  // Reassigned once `siteSettingsStore` exists (below): from that point on
  // every use of `logger` also feeds the observability recent-log buffer,
  // gated by the live `observability.logLevel` setting.
  let logger = options.logger ?? createLogger({ level: 'silent' })

  const loaded = await loadConfig({
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    env,
  })
  const projectRoot = loaded.path === null ? (options.cwd ?? process.cwd()) : dirname(loaded.path)

  if (loaded.config.auth.signingKey === undefined) {
    stderr('COGENTA_AUTH_SIGNING_KEY is not set.\n')
    stderr('Generate a random 32-byte value (openssl rand -base64 32 works) and export it as\n')
    stderr('COGENTA_AUTH_SIGNING_KEY before running serve again.\n')
    return 1
  }

  let collections: readonly CollectionDefinition[]
  let taxonomies: readonly TaxonomyDefinition[]
  try {
    const schema = await loadSchemaModule(projectRoot)
    collections = schema.collections
    taxonomies = schema.taxonomies
  } catch (error) {
    if (isCogentaError(error)) {
      stderr(`${error.code}: ${error.message}\n`)
      if (error.hint !== undefined) stderr(`${error.hint}\n`)
    } else {
      stderr(`${error instanceof Error ? error.stack : String(error)}\n`)
    }
    return 1
  }

  const selection = await createDatabaseRegistry({ logger }).select(loaded.config.database)
  const storageSelection = await createStorageRegistry({ logger }).select(loaded.config.storage)
  // Per-API-key request quota (fiche 20 task 3, R1): Redis when configured
  // and reachable, an in-process counter otherwise — never a hard dependency
  // on either.
  const rateLimitSelection = await createRateLimitRegistry({ logger }).select(
    loaded.config.rateLimit,
  )
  // Memoised per theme *package* name (`createThemeCssResolver`) — reading
  // and flattening a theme's stylesheet is real file I/O, so it happens once
  // per theme this process actually renders with, not on every request that
  // merely re-reads which one is currently active.
  const themeCssFor = createThemeCssResolver({ read: (url) => readFile(url, 'utf8') })
  const themeCss = await themeCssFor(DEFAULT_THEME_NAME)
  const styles = joinStyles(
    await loadSkinCss((path) => readFile(path, 'utf8'), join(projectRoot, 'theme.tokens.json')),
    themeCss,
  )
  const images = await selectMediaImageProcessor(logger)
  // One signed channel for both outbound events — the content lifecycle (task
  // 1) and the suspicious-activity alert (task 4). One set of endpoints, one
  // secret, one signing path.
  const webhooks = createContentWebhookEmitter({
    webhooks: loaded.config.webhooks,
    siteUrl: loaded.config.site.url,
    logger,
  })
  // L18. Never fatal: everything inside degrades to "off" with a log line
  // rather than stopping the site from serving (R2).
  const searchIndex = await createSearchIndex({ db: selection.instance })
  // Its own instance, separate from `assembleSite`'s internal one
  // (`createSiteSettingsStore` is stateless — every call hits the same table,
  // there is nothing to share): `buildAssistant` runs before `assembleSite`
  // does, and the `assistant.indexedCollections` toggle (L22 task 4) has to
  // be readable from the moment the first store wrap is built.
  const assistantSettings = createSiteSettingsStore({ db: selection.instance })
  // Fiche 45 — built here (before `buildAgentRuntime`, inside `assembleSite`
  // below, opens its own instance over the same directory) so the writing
  // assistant's `assist.*` tools resolve their instruction text from the
  // exact store the "Prompt Settings" admin screen edits. Two file-store
  // instances over one directory is safe: neither caches, so an edit either
  // makes is visible to the other on its next read (`agent-runtime.ts`'s own
  // `PROMPT_TEMPLATES_SUBDIR` comment explains this in full).
  const promptTemplates: PromptTemplateStore = createFilePromptTemplateStore({
    dir: join(projectRoot, '.cogenta', 'agents-runtime', 'prompt-templates'),
  })
  await ensureBuiltinPromptTemplates(promptTemplates)
  const assistant = await buildAssistant({
    config: loaded.config,
    db: selection.instance,
    logger,
    collections,
    settings: assistantSettings,
    siteId: loaded.config.site.url,
    // Beside the full-text index, never instead of it: the semantic half is
    // fused with this one by RRF (L18 task 5).
    fullText: searchIndex,
    promptTemplates,
  })
  // The "Santé" / "Outils" screens (fiche 24). `migrator` is built once here
  // — not per request, unlike `cogenta migrate`'s own CLI invocation, which
  // has no long-running process to amortise the cost across.
  const migrations = await loadMigrations(join(projectRoot, MIGRATIONS_DIRECTORY))
  const migrator = createMigrator({ db: selection.instance, migrations, logger })
  await ensureMaintenanceTable(selection.instance)
  const maintenanceStore = createMaintenanceStore({ db: selection.instance })
  const errorLog = createErrorLog()
  // The registry the doctor report already selects from for its own check —
  // built again here because a page cache and a diagnostic snapshot are
  // different lifetimes, not because the driver logic differs. Never fatal:
  // an install with no reachable cache backend still serves (R1's degraded
  // tier — `memory` — always resolves).
  const cacheSelection = await createCacheRegistry({ logger }).select(loaded.config.cache)
  const emailTransport = createFileEmailTransport({
    directory: join(projectRoot, '.cogenta', 'mail'),
  })
  const toolsQueue = createDatabaseQueue({ db: selection.instance, logger })

  // The update system (L22 task 9). `@cogenta/core`/`@cogenta/cli` are the
  // two packages the lot names explicitly as "déjà la source de vérité de
  // version" — each one's own self-reported version (`getCoreVersion()`,
  // `getCliVersion()`), never a guess read from `node_modules` by path. One
  // `AuditLog` handle over this site's own table — the same one
  // `site.auth.audit` will separately open once `assembleSite` runs below;
  // both read/write the same `cogenta_audit_log` table, so history recorded
  // here (before `site` exists) is exactly as visible through `site.auth.audit`
  // afterwards as any other action.
  const updatesAuditLog: AuditLog = createAuditLog(selection.instance)
  // Guards the `updates-auto-check` scheduled task below against re-applying
  // the same already-applied version on every subsequent tick — see that
  // task's own comment for why this process cannot otherwise tell.
  let lastAutoAppliedSignature: string | null = null
  const updatesBackupDir = join(projectRoot, '.cogenta', 'backups')
  const updatePackages = (): readonly { readonly name: string; readonly installed: string }[] => [
    { name: '@cogenta/core', installed: getCoreVersion() },
    { name: '@cogenta/cli', installed: getCliVersion() },
  ]
  async function recordUpdateOutcome(
    result: ApplyUpdateResult,
    actorId: string | null,
  ): Promise<void> {
    if (result.kind === 'up-to-date' || result.kind === 'confirmation-required') return
    await recordUpdateHistory(updatesAuditLog, {
      actorId,
      actorRoles: ['admin'],
      action: UPDATE_APPLIED_ACTION,
      diff: { installed: result.installed, restorePoint: result.restorePoint.path },
    }).catch((error: unknown) => {
      logger.error('update history record failed', { error: String(error) })
    })
  }
  const updatesRouter = createUpdateRouter({
    checker: {
      check: () =>
        checkForUpdates({
          packages: updatePackages(),
          ...(options.updatesFetchImpl === undefined
            ? {}
            : { fetchImpl: options.updatesFetchImpl }),
        }),
    },
    applier: {
      apply: async (input) => {
        let result: ApplyUpdateResult
        try {
          result = await applyUpdate({
            cwd: projectRoot,
            env,
            logger,
            packages: updatePackages(),
            confirmBreakingChange: input.confirmBreakingChange,
            backupDir: updatesBackupDir,
            ...(options.updatesFetchImpl === undefined
              ? {}
              : { fetchImpl: options.updatesFetchImpl }),
            ...(options.updatesRunInstall === undefined
              ? {}
              : { runInstall: options.updatesRunInstall }),
          })
        } catch (error) {
          await recordUpdateHistory(updatesAuditLog, {
            actorId: input.actorId,
            actorRoles: ['admin'],
            action: UPDATE_APPLY_FAILED_ACTION,
            diff: { error: isCogentaError(error) ? error.message : String(error) },
          }).catch(() => undefined)
          throw error
        }
        await recordUpdateOutcome(result, input.actorId)
        return result
      },
    },
    history: {
      entries: () => listUpdateHistory(updatesAuditLog),
      restorePoints: () => listRestorePoints(updatesBackupDir),
    },
  })

  const site = await assembleSite({
    db: selection.instance,
    assistant,
    searchIndex,
    collections,
    taxonomies,
    signingKey: loaded.config.auth.signingKey,
    site: loaded.config.site,
    storage: storageSelection.instance,
    logger,
    updatesRouter,
    health: async () => ({
      database: await selection.health(),
      storage: await storageSelection.health(),
    }),
    readOnly: options.readOnly ?? false,
    styles,
    themeCss,
    themeCssFor,
    theme: await createThemeWiring({
      projectRoot,
      db: selection.instance,
      config: loaded.config,
      development: options.development ?? false,
      readOnly: options.readOnly ?? false,
    }),
    images: images?.processor ?? null,
    security: loaded.config.security,
    notFoundLog: loaded.config.notFoundLog,
    webhooks: loaded.config.webhooks,
    billing: loaded.config.billing,
    payment: loaded.config.payment,
    // L22 task 1/1bis: always on for a real `cogenta serve` — the superagent
    // and its two example built-ins exist in configuration from the very
    // first boot (R2: nothing here attempts a network call without a
    // configured provider, only `POST .../run` can, and it refuses first).
    agentsRuntimeConfig: {
      dataDir: join(projectRoot, '.cogenta', 'agents-runtime'),
      projectRoot,
    },
    emailTransport,
    configStatus: buildConfigStatus(loaded.config, loaded.secretHygiene),
    pendingMigrations: {
      countPending: async () => (await migrator.status()).filter((item) => !item.applied).length,
      hasDestructive: async () =>
        (await migrator.status()).some((item) => !item.applied && item.destructive),
    },
    analytics: loaded.config.analytics,
    // Fiche 70 task 4, ADR-0032 — present only once both the client id and
    // secret are set. Neither alone is enough to talk to Google, and
    // `assembleSite` treats "absent" as the single source of truth for
    // "this connector is not offered" (R1/R2).
    ...(loaded.config.searchConsole.clientId !== undefined &&
    loaded.config.searchConsole.clientSecret !== undefined
      ? {
          searchConsole: {
            clientId: loaded.config.searchConsole.clientId,
            clientSecret: loaded.config.searchConsole.clientSecret,
          },
        }
      : {}),
    sitePlans: await createSitePlanning({
      projectRoot,
      db: selection.instance,
      collections,
      taxonomies,
      config: loaded.config,
      logger,
      readOnly: options.readOnly ?? false,
      // ADR-0010: the schema is writable in development only. `cogenta dev`
      // says development; `cogenta serve` does not, and a plan can then be
      // proposed and reviewed but never applied.
      development: options.development ?? false,
    }),
    // The signed outbound webhook channel, connected to the content lifecycle
    // for the first time (L14 task 1). `null` when the site configured no
    // endpoint, or configured one without a signing secret.
    onContentEvent: webhooks.emit,
    onSecurityEvent: webhooks.send,
    requestQuota: rateLimitSelection.instance,
    // Same mail this site's `cogenta users reset-password --email` already
    // sends (`../reset-mail.js`), just pointed at the admin's reset screen
    // instead of a terminal command — see that file for why the wording is
    // written once rather than twice.
    onForgotPassword: ({ user, token, expiresAt }) =>
      sendResetMail(
        {
          mailDir: join(projectRoot, '.cogenta', 'mail'),
          resetUrl: new URL('/admin/reset-password', loaded.config.site.url).toString(),
        },
        loaded.config.site,
        user.email,
        token,
        expiresAt,
      ).then(() => undefined),
    // Fiche 17 task 1. Same file, same transport, same "the token is redeemed
    // at /admin/reset-password" screen `onForgotPassword` already points at
    // — accepting an invitation and resetting a forgotten password are the
    // same action from `POST /api/auth/reset-password`'s point of view (see
    // that route's comment for the one line that tells them apart: whether
    // the account was `invited`).
    onInvite: ({ user, roles, token, expiresAt }) =>
      sendInviteMail(
        {
          mailDir: join(projectRoot, '.cogenta', 'mail'),
          acceptUrl: new URL('/admin/reset-password', loaded.config.site.url).toString(),
        },
        loaded.config.site,
        user.email,
        roles,
        token,
        expiresAt,
      ).then(() => undefined),
  })

  // Observability (fiche L22 task 5): OpenTelemetry tracing plus a local,
  // bounded recent-events buffer the admin's "Exploitation" screen reads.
  // The OTLP export destination is infra config, resolved once here
  // (`loaded.config.observability` — it can carry a bearer-token header,
  // rule R7); whether collection runs at all, and how verbose it is, are
  // the editorial `observability.enabled`/`observability.logLevel` site
  // settings instead, changeable from the admin with no restart. A DB read
  // on every request or log call would be its own cost, so both are cached
  // and refreshed on a short interval — eventually consistent, the same
  // trade every other "no restart" setting in this file already makes (see
  // `homePath`'s own comment further up), never a query per call.
  let observabilityEnabled = true
  let observabilityLogLevel: LogLevel = 'info'
  const OBSERVABILITY_LOG_LEVELS: readonly LogLevel[] = ['error', 'warn', 'info', 'debug']
  async function refreshObservabilitySettings(): Promise<void> {
    try {
      const [enabledSetting, logLevelSetting] = await Promise.all([
        site.siteSettingsStore.get('observability.enabled', SITE_SETTINGS_SITE_SCOPE),
        site.siteSettingsStore.get('observability.logLevel', SITE_SETTINGS_SITE_SCOPE),
      ])
      observabilityEnabled =
        typeof enabledSetting?.value === 'boolean' ? enabledSetting.value : true
      const level = logLevelSetting?.value
      observabilityLogLevel =
        typeof level === 'string' && (OBSERVABILITY_LOG_LEVELS as readonly string[]).includes(level)
          ? (level as LogLevel)
          : 'info'
    } catch (error) {
      logger.warn('failed to refresh observability settings', { error: String(error) })
    }
  }
  await refreshObservabilitySettings()
  const observabilityRuntime: ObservabilityRuntime = createObservabilityRuntime({
    serviceName: loaded.config.observability.serviceName,
    ...(loaded.config.observability.otlpEndpoint === undefined
      ? {}
      : {
          otlp: {
            endpoint: loaded.config.observability.otlpEndpoint,
            ...(loaded.config.observability.otlpHeaders === undefined
              ? {}
              : { headers: loaded.config.observability.otlpHeaders }),
          },
        }),
    isEnabled: () => observabilityEnabled,
  })
  // From here on, every `logger.debug/info/warn/error` call in this function
  // also feeds the observability recent-log buffer (gated by the live
  // `observabilityLogLevel` above) — nothing before this line could have,
  // since `site.siteSettingsStore` did not exist yet to read the setting
  // from. `assembleSite` above already captured the pre-wrap `logger` by
  // value, so its own internal logging is unaffected — an accepted, narrow
  // gap (documented in the task report) rather than a reason to thread a
  // mutable logger reference through a function whose every other caller
  // (tests included) passes a plain, already-built one.
  logger = observabilityRuntime.wrapLogger(logger, () => observabilityLogLevel)
  const observabilityRouter = createObservabilityRouter({
    isEnabled: () => observabilityEnabled,
    getRecentTraces: () => observabilityRuntime.recentStore.recentTraces(),
    getRecentLogs: () => observabilityRuntime.recentStore.recentLogs(),
  })

  const toolRunner = createToolRunner({
    queue: toolsQueue,
    logger,
    bodies: buildToolBodies({
      db: selection.instance,
      collections,
      locales: loaded.config.site.locales,
      defaultLocale: loaded.config.site.defaultLocale,
      cache: cacheSelection.instance,
      searchIndex,
      vectors:
        assistant.vectors === undefined
          ? null
          : { siteId: loaded.config.site.url, ...assistant.vectors },
      mediaStore: site.mediaStore,
      storage: storageSelection.instance,
      images: images?.processor ?? null,
      emailTransport,
      siteName: loaded.config.site.name,
    }),
  })
  const healthRouter = createHealthRouter({
    // The literal function `cogenta doctor` calls — task 1's acceptance
    // criterion ("le diagnostic de l'admin est le même code") holds by
    // construction, not by convention.
    getReport: () => runDoctor({ cwd: projectRoot, env, logger }),
    getMigrations: async () => {
      const status: MigrationStatus[] = await migrator.status()
      return {
        items: status.map((item) => ({
          id: item.id,
          name: item.name,
          applied: item.applied,
          destructive: item.destructive,
          ...(item.appliedAt === undefined ? {} : { appliedAt: item.appliedAt }),
          ...(item.impact === undefined ? {} : { impact: item.impact }),
        })),
      }
    },
    // "Appliquer seulement les migrations non destructives, et renvoyer
    // explicitement à la CLI pour les destructives" (fiche 24 task 2's
    // recommendation, taken). `up({ to })` already applies in order up to a
    // named id — the id right before the first pending destructive one — so
    // this never needs to touch `confirmDestructive`/`backupVerified` at all.
    applyMigrations: async () => {
      const status = await migrator.status()
      const pending = status.filter((item) => !item.applied)
      const firstDestructive = pending.find((item) => item.destructive)
      if (firstDestructive === undefined) {
        const outcomes = await migrator.up()
        return { applied: outcomes.map((outcome) => outcome.id), remainingDestructive: [] }
      }
      const before = pending.slice(
        0,
        pending.findIndex((item) => item.id === firstDestructive.id),
      )
      const remainingDestructive = pending
        .slice(pending.findIndex((item) => item.id === firstDestructive.id))
        .filter((item) => item.destructive)
        .map((item) => item.id)
      const cutoff = before[before.length - 1]
      if (cutoff === undefined) return { applied: [], remainingDestructive }
      const outcomes = await migrator.up({ to: cutoff.id })
      return { applied: outcomes.map((outcome) => outcome.id), remainingDestructive }
    },
    getAuditIntegrity: async () => {
      try {
        await site.auth.audit.verify()
        return { ok: true, checkedAt: new Date().toISOString(), error: undefined }
      } catch (error) {
        return {
          ok: false,
          checkedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
    getDiskUsage: async () => {
      if (loaded.config.storage.driver === 's3') return { available: false }
      try {
        const stats = await statfs(join(projectRoot, '.cogenta', 'storage'))
        return {
          available: true,
          freeBytes: stats.bfree * stats.bsize,
          totalBytes: stats.blocks * stats.bsize,
          path: join(projectRoot, '.cogenta', 'storage'),
        }
      } catch {
        return { available: false }
      }
    },
    getErrorLog: () => errorLog.entries(),
    getMaintenance: () => maintenanceStore.get(),
    setMaintenance: (input, actorId) =>
      maintenanceStore.set({
        enabled: input.enabled,
        ...(input.message === undefined ? {} : { message: input.message }),
        updatedBy: actorId,
      }),
  })
  const toolsRouter = createToolsRouter({
    tools: TOOL_DEFINITIONS,
    run: (id, runOptions) => toolRunner.run(id, runOptions),
    getRun: (id) => toolRunner.getRun(id),
    listRuns: () => toolRunner.listRuns(),
  })

  // "Tâches planifiées" (fiche 28 task 2, L20 audit §1 point 6): the registry
  // and its router already existed (`@cogenta/schema`, `@cogenta/api`) —
  // `cogenta serve` never actually constructed either, so `GET
  // /api/scheduled-tasks` 404'd through the generic content-route "no route
  // matches this path" for every admin that opened the screen. This registers
  // the same seven recurring jobs the raw `setInterval`s below used to run
  // blind, so "run now"/history/next-run in the admin reflect the real thing
  // rather than nothing at all.
  const scheduledTaskRegistry: ScheduledTaskRegistry = createScheduledTaskRegistry({
    db: site.db,
    logger,
  })
  scheduledTaskRegistry.register({
    name: 'scheduled-publish',
    description: 'Publish entries whose scheduled time has come, and drain the tools queue.',
    intervalMs: options.scheduledPublishTickMs ?? SCHEDULED_PUBLISH_TICK_MS,
    run: async () => {
      const published = await site.tickScheduledPublishing()
      await toolsQueue.tick()
      return { summary: `${published} published` }
    },
  })
  scheduledTaskRegistry.register({
    name: 'not-found-purge',
    description: "Purge 404 log entries past the site's retention window.",
    intervalMs: options.notFoundPurgeTickMs ?? NOT_FOUND_PURGE_TICK_MS,
    run: async () => ({ summary: `${await site.tickNotFoundPurge()} purged` }),
  })
  scheduledTaskRegistry.register({
    name: 'audit-integrity',
    description: 'Verify the audit log hash chain has not been tampered with.',
    intervalMs: options.auditIntegrityTickMs ?? AUDIT_INTEGRITY_TICK_MS,
    run: async () => {
      await site.checkAuditIntegrity()
      return undefined
    },
  })
  scheduledTaskRegistry.register({
    name: 'audit-prune',
    description: "Purge audit-log entries past the site's configured retention window.",
    intervalMs: options.auditPruneTickMs ?? AUDIT_PRUNE_TICK_MS,
    destructive: true,
    run: async () => {
      const result = await site.tickAuditPrune()
      return { summary: `${result.pruned} purged` }
    },
  })
  scheduledTaskRegistry.register({
    name: 'trash-purge',
    description: "Permanently delete trashed content past the site's retention window.",
    intervalMs: options.trashPurgeTickMs ?? TRASH_PURGE_TICK_MS,
    destructive: true,
    run: async () => {
      const result = await site.tickTrashPurge()
      return { summary: `${result.purged} purged` }
    },
  })
  scheduledTaskRegistry.register({
    name: 'forms-purge',
    description: "Purge form submissions past each form's own GDPR retention window.",
    intervalMs: options.formsPurgeTickMs ?? FORMS_PURGE_TICK_MS,
    run: async () => ({ summary: `${await site.tickFormsPurge()} purged` }),
  })
  scheduledTaskRegistry.register({
    name: 'channel-notifications',
    description: 'Flush any due grouped notification to its channel.',
    intervalMs: options.channelNotificationTickMs ?? CHANNEL_NOTIFICATION_TICK_MS,
    run: async () => ({ summary: `${(await site.tickChannelNotifications()).length} sent` }),
  })
  scheduledTaskRegistry.register({
    name: 'analytics-purge',
    description: "Purge page-view events past the site's configured retention window.",
    intervalMs: options.analyticsPurgeTickMs ?? ANALYTICS_PURGE_TICK_MS,
    run: async () => ({ summary: `${await site.tickAnalyticsPurge()} purged` }),
  })
  // Absent on a site with no e-mail transport configured (R1/R2) — registering
  // a task that would always no-op is worse than not registering it at all.
  if (site.tickCommerceEmails !== null) {
    const tickCommerceEmails = site.tickCommerceEmails
    scheduledTaskRegistry.register({
      name: 'commerce-order-emails',
      description: 'Send any due order confirmation/shipment e-mail, retrying a past failure.',
      intervalMs: options.commerceEmailTickMs ?? COMMERCE_EMAIL_TICK_MS,
      run: async () => {
        const result = await tickCommerceEmails()
        return { summary: `${result.sent} sent, ${result.failed} failed` }
      },
    })
  }
  scheduledTaskRegistry.register({
    name: 'updates-auto-check',
    description:
      'Check npm for a newer @cogenta/core/@cogenta/cli, and apply it when the auto-update policy allows and no contract risk was flagged.',
    intervalMs: options.updatesAutoCheckTickMs ?? UPDATES_AUTO_CHECK_TICK_MS,
    run: async () => {
      const setting = await site.siteSettingsStore.get(
        'updates.autoUpdatePolicy',
        SITE_SETTINGS_SITE_SCOPE,
      )
      const rawPolicy = setting?.value
      const policy: AutoUpdatePolicy = AUTO_UPDATE_POLICIES.includes(rawPolicy as AutoUpdatePolicy)
        ? (rawPolicy as AutoUpdatePolicy)
        : 'off'
      // Off by default (the registry's own default value) — no network call
      // at all in that case, R1/R2's "nothing surprising happens without an
      // explicit opt-in" applied to this feature too.
      if (policy === 'off') return { summary: 'auto-update is off' }

      const report = await checkForUpdates({
        packages: updatePackages(),
        ...(options.updatesFetchImpl === undefined ? {} : { fetchImpl: options.updatesFetchImpl }),
      })
      // Never a package the policy does not cover, and never one whose
      // changelog scan flagged a frozen-contract mention — an unattended
      // tick applies exactly nothing it cannot already tell is safe by this
      // system's own honest standard (`contract-risk.ts`'s module comment).
      const applicable = report.packages.filter(
        (pkg) =>
          pkg.updateAvailable &&
          pkg.latest !== null &&
          policyAllows(policy, pkg.bump) &&
          (pkg.contractRisk?.warnings.length ?? 0) === 0,
      )
      if (applicable.length === 0) {
        return {
          summary: report.updateAvailable
            ? 'an update exists but is outside this policy or was flagged risky — left for manual review'
            : 'up to date',
        }
      }

      // `getCoreVersion()`/`getCliVersion()` are cached after their first
      // real call (self-describing, `readOwnPackageVersion`) and never
      // change for the lifetime of this process, even after a real `npm
      // install` really does swap the files on disk — the running code stays
      // old until an actual restart. Without this guard, every tick after a
      // successful auto-apply would see the exact same "update available"
      // and try again, taking a fresh restore point and re-running `npm
      // install` forever until someone restarts the process.
      const signature = applicable
        .map((pkg) => `${pkg.name}@${pkg.latest}`)
        .sort()
        .join(',')
      if (signature === lastAutoAppliedSignature) {
        return { summary: 'already auto-updated to this version — waiting for a restart' }
      }

      const result = await applyUpdate({
        cwd: projectRoot,
        env,
        logger,
        packages: applicable.map((pkg) => ({ name: pkg.name, installed: pkg.installed })),
        confirmBreakingChange: false,
        backupDir: updatesBackupDir,
        ...(options.updatesFetchImpl === undefined ? {} : { fetchImpl: options.updatesFetchImpl }),
        ...(options.updatesRunInstall === undefined
          ? {}
          : { runInstall: options.updatesRunInstall }),
      })
      if (result.kind === 'applied') {
        await recordUpdateOutcome(result, null)
        lastAutoAppliedSignature = signature
        return {
          summary: `auto-updated: ${result.installed.map((pkg) => `${pkg.name}@${pkg.version}`).join(', ')} — restart to run the new version`,
        }
      }
      // A risk this tick's own filter did not see (e.g. the tarball scan
      // failing between the two checks) — refused rather than guessed at,
      // same as a human's "confirmation-required" would be.
      return {
        summary: 'a re-check before applying found a reason not to — left for manual review',
      }
    },
  })

  const scheduledTasksRouter = createScheduledTasksRouter({
    registry: scheduledTaskRegistry,
    queue: toolsQueue,
    mode: 'internal',
    onManualRun: ({ taskName, outcome, actorId }) => {
      // Best-effort, same as every other audit write in this file (e.g.
      // `recordAuditExportAudit`) — a failed journal entry must not undo the
      // task run it is describing. `assertAdmin` inside the router already
      // guarantees the caller holds `admin`.
      void site.auth.audit
        .record({
          actorId,
          actorRoles: ['admin'],
          action: 'scheduled_task.run',
          diff: { taskName, outcome },
        })
        .catch((error: unknown) => {
          logger.error('scheduled task audit record failed', { error: String(error) })
        })
    },
  })

  const server = createServer(
    withRequestTracing(
      createRequestListener(site, logger, {
        healthRouter,
        toolsRouter,
        scheduledTasksRouter,
        maintenance: maintenanceStore,
        errorLog,
        siteName: loaded.config.site.name,
        observabilityRouter,
      }),
      observabilityRuntime,
    ),
  )
  const port = options.port ?? DEFAULT_PORT
  const host = options.host ?? DEFAULT_HOST

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })

  const address = server.address()
  const boundPort = typeof address === 'object' && address !== null ? address.port : port
  out.ok(`Listening on http://${host}:${boundPort}`)
  out.detail(
    `${collections.length} collection(s), db driver: ${selection.driver}, storage driver: ${storageSelection.driver}, image driver: ${images?.driver ?? 'none'}`,
  )
  out.detail(assistant.summary)
  options.onListening?.({ port: boundPort, host })

  // The recurring jobs above (scheduled publication, the tools queue drain
  // riding along with it, the 404 log purge, audit integrity, audit-log
  // retention (T09-01), the trash sweep, forms GDPR retention, channel
  // notification flush, analytics retention, updates auto-check, and —
  // fiche 52 task 2 — the commerce order-email retry queue) are all
  // `scheduledTaskRegistry` entries rather
  // than independent `setInterval`s: one heartbeat drives `registry.tick()`,
  // which itself decides which tasks are actually due against the interval
  // each was registered with above — the same cadence as before, since the
  // heartbeat is at least as frequent as the fastest of them. Every one of
  // their own tick overrides must be folded into `scheduledTasksHeartbeatMs`
  // below, or a test that speeds up only its own task's interval sees no
  // effect — a real bug this fiche found and fixed for its own task. A
  // single failed tick is logged by the registry's own `execute()`, never
  // fatal.
  const scheduledTasksHeartbeatMs = Math.min(
    options.scheduledPublishTickMs ?? SCHEDULED_PUBLISH_TICK_MS,
    options.notFoundPurgeTickMs ?? NOT_FOUND_PURGE_TICK_MS,
    options.auditIntegrityTickMs ?? AUDIT_INTEGRITY_TICK_MS,
    options.auditPruneTickMs ?? AUDIT_PRUNE_TICK_MS,
    options.trashPurgeTickMs ?? TRASH_PURGE_TICK_MS,
    options.formsPurgeTickMs ?? FORMS_PURGE_TICK_MS,
    options.channelNotificationTickMs ?? CHANNEL_NOTIFICATION_TICK_MS,
    options.analyticsPurgeTickMs ?? ANALYTICS_PURGE_TICK_MS,
    options.updatesAutoCheckTickMs ?? UPDATES_AUTO_CHECK_TICK_MS,
    options.commerceEmailTickMs ?? COMMERCE_EMAIL_TICK_MS,
  )
  const runScheduledTasksHeartbeat = (): void => {
    // Sequenced, not concurrent: `registry.tick()` already runs its due
    // tasks one at a time for exactly this reason (see its own comment) —
    // two heartbeats overlapping would open two transactions on the same
    // SQLite connection.
    scheduledTaskRegistry.tick().catch((error: unknown) => {
      logger.error('scheduled tasks heartbeat failed', { error: String(error) })
    })
  }
  runScheduledTasksHeartbeat()
  const scheduledTasksTimer = setInterval(runScheduledTasksHeartbeat, scheduledTasksHeartbeatMs)
  // Never keeps the process alive on its own: a `signal`-driven shutdown with
  // no open connections must still be able to exit.
  scheduledTasksTimer.unref()

  // Refreshes the cached `observabilityEnabled`/`observabilityLogLevel`
  // values from the settings store (see their own comment above) — this is
  // what makes flipping either one from the admin take effect without a
  // restart, bounded by this interval rather than instant.
  const observabilitySettingsTimer = setInterval(
    () => void refreshObservabilitySettings(),
    options.observabilitySettingsTickMs ?? OBSERVABILITY_SETTINGS_TICK_MS,
  )
  observabilitySettingsTimer.unref()

  await new Promise<void>((resolve) => {
    if (options.signal === undefined) return
    if (options.signal.aborted) {
      resolve()
      return
    }
    options.signal.addEventListener('abort', () => resolve(), { once: true })
  })

  clearInterval(scheduledTasksTimer)
  clearInterval(observabilitySettingsTimer)

  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
    // `close()` alone waits for every open connection to end, and a client
    // that fetched a large response and never read the body holds one open
    // indefinitely — a media download is exactly that shape. Without the
    // grace period, one such client turns Ctrl-C into a hang. Found while
    // writing the image tests, where a deliberately unread image body kept
    // the whole process alive.
    const grace = setTimeout(() => server.closeAllConnections(), SHUTDOWN_GRACE_MS)
    grace.unref()
  })
  await observabilityRuntime.shutdown()
  await assistant.dispose()
  await toolsQueue.close()
  await cacheSelection.dispose()
  await selection.dispose()
  await storageSelection.dispose()
  await rateLimitSelection.dispose()
  await site.dispose().catch(() => undefined) // selection.dispose() already closed the same handle

  return 0
}
