import { readFile, stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import {
  type AccessContext,
  type AgentsRouter,
  type AgentsRouterOptions,
  type AuditRouter,
  type AuthRouter,
  buildContentSchema,
  createAgentsRouter,
  createAuditRouter,
  createAuthRouter,
  createContentGateway,
  createContentService,
  createMediaRouter,
  createMfaRecommendationSource,
  createNoticeDismissalStore,
  createNoticeRouter,
  createPermissionLayer,
  createRestRouter,
  createSearchRouter,
  createSitePlanRouter,
  createSuspiciousActivitySource,
  createTaxonomyRouter,
  createUsersRouter,
  errorResponse,
  executeGraphQL,
  type MediaImageProcessor,
  type MediaRouter,
  type NoticeRouter,
  type PermissionLayer,
  type RestRequest,
  type RestResponse,
  type RestRouter,
  resolveActor,
  type SearchRouter,
  type SitePlanRouter,
  type SitePlanRouterOptions,
  type TaxonomyRouter,
  type UsersRouter,
  variantKeyFor,
} from '@cogenta/api'
import { type AuthStore, createAuthStore } from '@cogenta/auth'
import {
  CogentaError,
  createDatabaseMediaStore,
  createDatabaseRegistry,
  createLogger,
  createStorageRegistry,
  type DatabaseHandle,
  type HealthReport,
  isCogentaError,
  type Logger,
  loadConfig,
  type MediaStore,
  type StorageDriver,
} from '@cogenta/core'
import type { MediaAsset as RenderMediaAsset } from '@cogenta/render'
import {
  type BlockZones,
  buildSchemaDocument,
  type CollectionDefinition,
  type ContentLifecycleEvent,
  type ContentStore,
  createContentStore,
  createRedirectStore,
  createSchemaTables,
  createSearchIndex,
  createTaxonomyStore,
  type RedirectStore,
  type SchemaDocument,
  type TaxonomyDefinition,
  type TaxonomyStore,
  withLifecycleEvents,
  withReadOnlyStore,
  withSearchIndexing,
} from '@cogenta/schema'
import type { GraphQLSchema } from 'graphql'
import type { Output, Writer } from '../output.js'
import { serveAdminAsset } from './admin-assets.js'
import { createContentWebhookEmitter } from './content-webhooks.js'
import { applySecurity, type SecurityConfig } from './http-security.js'
import { selectMediaImageProcessor } from './media-images.js'
import { renderSearchPage } from './search-page.js'
import { createSecurityAlertWatch, type SecurityAlertWatch } from './security-alerts.js'
import { buildSitemapFiles, collectRoutedResources, renderRobots, seoSiteFor } from './seo.js'
import { createSitePlanning } from './site-plan.js'
import { cssEtag, loadThemeCss } from './theme-css.js'
import {
  DEFAULT_IMAGE_ENDPOINT,
  joinStyles,
  loadSkinCss,
  renderDraftPage,
  renderRequestedPage,
  STYLESHEET_PATH,
} from './theme-render.js'

/** `/sitemap.xml` and the `/sitemap-N.xml` chunks a large site splits into. */
const SITEMAP_PATH = /^\/sitemap(?:-\d+)?\.xml$/u

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

interface Site {
  readonly db: DatabaseHandle
  readonly auth: AuthStore
  readonly restRouter: RestRouter
  readonly authRouter: AuthRouter
  readonly mediaRouter: MediaRouter
  readonly auditRouter: AuditRouter
  /** `GET /api/search` — the full-text index, reachable for the first time (L10 task 3). */
  readonly searchRouter: SearchRouter
  /** `/api/taxonomies/*` — terms, mounted apart from content because a taxonomy is not a collection (`schema@2.0`, ADR-0022). */
  readonly taxonomyRouter: TaxonomyRouter
  /** ADR-0021's half that replaces the MFA sign-in gate: recommendations the admin shows, never a block. */
  readonly noticeRouter: NoticeRouter
  /** Refused sign-ins, watched for a run worth alerting on (L14 task 4). `null` when nothing is configured to receive one. */
  readonly securityAlerts: SecurityAlertWatch | null
  /** Account management from the admin instead of `cogenta users create` on a terminal (L11 task 3). */
  readonly usersRouter: UsersRouter
  /** Only set when a caller passes `agents` into `assembleSite` — no site constructs one today (R2: agents are optional, not a hard dependency of the CMS). */
  readonly agentsRouter?: AgentsRouter
  /**
   * `/api/site-plans` — L19 task 7's document-driven planning on a live site.
   *
   * Always mounted, even with no LLM provider: the drafts an installer left
   * behind must still be readable, and the router itself answers
   * `SITE_PLAN_NO_PROVIDER` for the routes that would need a model.
   */
  readonly sitePlanRouter?: SitePlanRouter
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
  /** The skin's custom properties plus the theme's own stylesheet, minified into one. `null` when neither could be loaded — the theme-render fallback serves unstyled HTML rather than refusing. */
  readonly styles: string | null
  /** CORS, security headers and cache-control, applied to every response (L10 task 6). */
  readonly security: SecurityConfig
  /** Live, not cached: a driver that just went down must show as down the next time this is called, not until the process restarts. */
  readonly health: () => Promise<{
    readonly database: HealthReport
    readonly storage: HealthReport
  }>
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
  /** Optional: no caller constructs an agent registry today, and `/api/agents` simply is not mounted when this is absent — see `agentsRouter` on `Site`. */
  readonly agents?: AgentsRouterOptions
  /** L19 task 7. Absent in a test that does not care; `runServe` always passes one. */
  readonly sitePlans?: SitePlanRouterOptions
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
}

async function assembleSite(options: AssembleSiteOptions): Promise<Site> {
  const { db, collections, site, storage, logger } = options
  const readOnly = options.readOnly ?? false
  const styles = options.styles ?? null
  const taxonomies = options.taxonomies ?? []
  // Taxonomies first: a `f.taxonomy()` field carries a real foreign key into
  // the terms table, which therefore has to exist before the collection does.
  await createSchemaTables(db, collections, taxonomies)

  // Full-text search, connected for the first time (L10 task 3). The index is
  // derived data and creates its own physical table, so a fresh install can
  // index its first entry without a migration having run.
  const searchIndex = await createSearchIndex({ db })

  const stores = new Map<string, ContentStore>()
  const storeFor = (collection: CollectionDefinition): ContentStore => {
    const existing = stores.get(collection.name)
    if (existing !== undefined) return existing
    // `siblings` is what lets `delete()` enforce `restrict` in application
    // code (ADR-0022): trashing is an UPDATE, so the foreign key has nothing
    // left to refuse at that moment.
    const created = createContentStore({ db, collection, siblings: collections })
    const guarded = readOnly ? withReadOnlyStore(created) : created
    // Outermost, so a read-only refusal happens *before* anything is indexed:
    // a write that never landed must not change the index either.
    const stored = withSearchIndexing(guarded, {
      collection,
      index: searchIndex,
      onError: (error) =>
        logger.error('search index write failed', {
          collection: collection.name,
          error: String(error),
        }),
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

  const redirects = createRedirectStore({ db })
  await redirects.ensureTable()

  const permissions = createPermissionLayer({ collections })
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

  const noticeDismissals = createNoticeDismissalStore(db)
  await noticeDismissals.ensureTable()

  return {
    db,
    auth,
    restRouter: createRestRouter({ service, siteUrl: site.url }),
    authRouter: createAuthRouter({ auth }),
    mediaRouter: createMediaRouter({
      store: mediaStore,
      storage,
      ...(options.images === undefined || options.images === null
        ? {}
        : { images: options.images }),
    }),
    auditRouter: createAuditRouter({ audit: auth.audit }),
    taxonomyRouter: createTaxonomyRouter({
      taxonomies,
      permissions,
      storeFor: (taxonomy) => taxonomyStoreFor(taxonomy),
    }),
    searchRouter: createSearchRouter({
      index: searchIndex,
      collections,
      permissions,
      defaultLocale: site.defaultLocale,
    }),
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
      // One source today, and the seam is the array: a future recommendation
      // (a plugin update waiting, a certificate about to expire) is one more
      // entry here and nothing else anywhere.
      sources: [
        createMfaRecommendationSource({ collections, credentials: auth.credentials }),
        // The failed-sign-in table has been written to since L2 and read by
        // nothing but the limiter's own counter (L14 task 4). One extra source
        // in this array is the whole wiring — the seam the notice mechanism was
        // designed around.
        createSuspiciousActivitySource({ rateLimit: auth.rateLimit }),
      ],
      dismissals: noticeDismissals,
    }),
    usersRouter: createUsersRouter({ auth }),
    ...(options.agents === undefined ? {} : { agentsRouter: createAgentsRouter(options.agents) }),
    ...(options.sitePlans === undefined
      ? {}
      : { sitePlanRouter: createSitePlanRouter(options.sitePlans) }),
    mediaStore,
    storage,
    images: options.images ?? null,
    graphqlSchema: buildContentSchema({ collections }),
    gateway: createContentGateway({ collections, stores, permissions }),
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
    security: options.security,
    health: options.health,
    dispose: async () => {
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

async function readBody(req: IncomingMessage): Promise<unknown> {
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
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim().length === 0) return undefined
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

function responseId(response: RestResponse): string | undefined {
  const data = (response.body as { readonly data?: { readonly id?: unknown } } | null)?.data
  return typeof data?.id === 'string' ? data.id : undefined
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

  const action =
    subAction === 'publish'
      ? 'content.publish'
      : subAction === 'restore'
        ? 'content.restore'
        : subAction !== undefined
          ? null // history/diff/preview/translations are reads
          : method === 'POST'
            ? 'content.create'
            : method === 'PATCH' || method === 'PUT'
              ? 'content.update'
              : method === 'DELETE'
                ? 'content.delete'
                : null
  if (action === null) return

  const entryId = id ?? responseId(response)
  const values =
    typeof body === 'object' && body !== null && 'values' in body
      ? (body as { readonly values?: Record<string, unknown> }).values
      : undefined

  await site.auth.audit
    .record({
      actorId: actor.id,
      actorRoles: actor.roles,
      action,
      collection,
      ...(entryId === undefined ? {} : { entryId }),
      ...(values === undefined ? {} : { diff: values }),
    })
    .catch((error: unknown) => logger.error('audit record failed', { error: String(error) }))
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
  const [id] = pathname
    .replace(/^\/api\/media\/?/u, '')
    .split('/')
    .filter((segment) => segment.length > 0)

  const action =
    method === 'POST'
      ? 'media.upload'
      : method === 'PATCH' || method === 'PUT'
        ? 'media.update'
        : method === 'DELETE'
          ? 'media.delete'
          : null
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

async function recordAuthAudit(
  site: Site,
  actor: AccessContext['actor'],
  method: string,
  pathname: string,
  response: RestResponse,
  logger: Logger,
): Promise<void> {
  if (response.status < 200 || response.status >= 300) return

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

  await site.auth.audit
    .record({ actorId: userId, actorRoles: roles, action: 'auth.login' })
    .catch((error: unknown) => logger.error('audit record failed', { error: String(error) }))
}

/**
 * Account management, in the audit log.
 *
 * Who created an account, who changed a role, who disabled someone and who cut
 * a session short are exactly the events an append-only, hash-chained log
 * exists for — and they were previously invisible, since the only way to do any
 * of it was a terminal.
 *
 * Recorded here, at the transport boundary, for the same reason the content and
 * media audits are: the router stays a pure request-in/response-out value, and
 * only a response that actually succeeded is written down.
 */
async function recordUserAudit(
  site: Site,
  actor: AccessContext['actor'],
  method: string,
  pathname: string,
  response: RestResponse,
  logger: Logger,
): Promise<void> {
  if (response.status < 200 || response.status >= 300) return

  const segments = pathname.split('/').filter((segment) => segment.length > 0)
  // ['api', 'users', <id?>, <'sessions' | 'password'>?, <sessionId?>]
  const target = segments[2]
  const sub = segments[3]

  const action =
    method === 'POST' && target === undefined
      ? 'user.create'
      : method === 'PATCH' && target !== undefined && sub === undefined
        ? 'user.update'
        : method === 'POST' && sub === 'password'
          ? 'user.password_change'
          : method === 'DELETE' && sub === 'sessions'
            ? 'user.session_revoke'
            : null
  if (action === null) return

  // The subject is named, never anything that could sign anyone in: no
  // password, no token, not even the new roles' provenance beyond the id.
  const created = (
    response.body as { readonly data?: { readonly user?: { readonly id?: unknown } } } | null
  )?.data?.user
  const subjectId =
    typeof created?.id === 'string' ? created.id : target === 'me' ? actor.id : (target ?? null)

  await site.auth.audit
    .record({
      actorId: actor.id,
      actorRoles: actor.roles,
      action,
      ...(subjectId === null ? {} : { entryId: subjectId }),
    })
    .catch((error: unknown) => logger.error('audit record failed', { error: String(error) }))
}

function writeRestResponse(res: ServerResponse, response: RestResponse): void {
  res.writeHead(response.status, response.headers)
  res.end(
    response.body === null || response.body === undefined
      ? undefined
      : JSON.stringify(response.body),
  )
}

function jsonError(res: ServerResponse, status: number, code: string, message: string): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify({ error: { code, message } }))
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
      )
      const context: AccessContext = { actor }

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
          res.writeHead(200, { 'content-type': asset.contentType })
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
        if (site.styles === null) {
          jsonError(res, 404, 'CONTENT_NOT_FOUND', 'This site has no stylesheet.')
          return
        }
        const etag = cssEtag(site.styles)
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
        res.end(site.styles)
        return
      }

      if (url.pathname.startsWith('/api/auth/')) {
        const body =
          req.method === 'GET' || req.method === 'DELETE' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        const response = await site.authRouter.handle(request)
        writeRestResponse(res, response)
        await recordAuthAudit(site, actor, req.method ?? 'GET', url.pathname, response, logger)
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

      if (url.pathname.startsWith('/api/media')) {
        const body =
          req.method === 'GET' || req.method === 'DELETE' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        const response = await site.mediaRouter.handle(request, context.actor)
        writeRestResponse(res, response)
        await recordMediaAudit(site, actor, req.method ?? 'GET', url.pathname, response, logger)
        return
      }

      // The full-text index, reachable at last (L10 task 3). Its own router
      // decides which collections this actor may search — never this layer.
      if (url.pathname === '/api/search') {
        const request = toRestRequest(req, url, undefined)
        writeRestResponse(res, await site.searchRouter.handle(request, context))
        return
      }

      if (url.pathname.startsWith('/api/audit')) {
        const request = toRestRequest(req, url, undefined)
        writeRestResponse(res, await site.auditRouter.handle(request, context.actor))
        return
      }

      if (url.pathname.startsWith('/api/notices')) {
        const request = toRestRequest(req, url, undefined)
        writeRestResponse(res, await site.noticeRouter.handle(request, context.actor))
        return
      }

      if (url.pathname.startsWith('/api/users')) {
        const body =
          req.method === 'GET' || req.method === 'DELETE' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        const response = await site.usersRouter.handle(request, context.actor)
        writeRestResponse(res, response)
        await recordUserAudit(site, actor, req.method ?? 'GET', url.pathname, response, logger)
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

      if (url.pathname.startsWith('/api/agents') && site.agentsRouter !== undefined) {
        const request = toRestRequest(req, url, undefined)
        writeRestResponse(res, await site.agentsRouter.handle(request, context.actor))
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
      // is for on the write side.
      if (req.method === 'GET' || req.method === 'HEAD') {
        const redirect = await site.redirects.resolve(url.pathname)
        if (redirect !== null) {
          res.writeHead(redirect.status, {
            location: `${redirect.to}${url.search}`,
            'cache-control': redirect.status === 301 ? 'public, max-age=3600' : 'no-store',
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
        res.writeHead(200, {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'public, max-age=3600',
        })
        res.end(renderRobots(seoSiteFor(site.site)))
        return
      }

      if (SITEMAP_PATH.test(url.pathname)) {
        if (req.method !== 'GET') {
          res.writeHead(405, { allow: 'GET' }).end()
          return
        }
        const seoSite = seoSiteFor(site.site)
        const files = buildSitemapFiles(
          seoSite,
          await collectRoutedResources(site.collections, site.gateway),
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
            styles: site.styles,
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

      // Real theme HTML for anything else — see `theme-render.ts`'s own
      // doc comment for what this is and, as importantly, what it isn't
      // (no Astro build, one theme, no image pipeline). GET only: rendering
      // a page has no meaningful response to any other method.
      if (req.method === 'GET') {
        const renderOptions = {
          collections: site.collections,
          gateway: site.gateway,
          site: site.site,
          styles: site.styles,
          loadMedia: (ids: readonly string[]) => loadRenderMedia(site, ids),
        }
        const html = await renderRequestedPage(url.pathname, renderOptions, context)
        if (html !== null) {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
          res.end(html)
          return
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
      if (isCogentaError(error) && error.code === 'REQUEST_BODY_TOO_LARGE') {
        jsonError(res, 413, error.code, error.message)
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
}

const DEFAULT_PORT = 4000
const DEFAULT_HOST = '127.0.0.1'

/** How long a shutdown waits for open connections before cutting them. */
const SHUTDOWN_GRACE_MS = 2_000

/**
 * Runs until `options.signal` aborts. Returns 0 on a clean shutdown, 1 if
 * startup failed — nothing here calls `process.exit` (same convention as
 * every other command), so an embedder controls the process lifecycle.
 */
export async function runServe(options: ServeOptions): Promise<number> {
  const { out, stderr } = options
  const env = options.env ?? process.env
  const logger = options.logger ?? createLogger({ level: 'silent' })

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
  const styles = joinStyles(
    await loadSkinCss((path) => readFile(path, 'utf8'), join(projectRoot, 'theme.tokens.json')),
    await loadThemeCss({ read: (url) => readFile(url, 'utf8') }),
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
  const site = await assembleSite({
    db: selection.instance,
    collections,
    taxonomies,
    signingKey: loaded.config.auth.signingKey,
    site: loaded.config.site,
    storage: storageSelection.instance,
    logger,
    health: async () => ({
      database: await selection.health(),
      storage: await storageSelection.health(),
    }),
    readOnly: options.readOnly ?? false,
    styles,
    images: images?.processor ?? null,
    security: loaded.config.security,
    sitePlans: await createSitePlanning({
      projectRoot,
      db: selection.instance,
      collections,
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
  })

  const server = createServer(createRequestListener(site, logger))
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
  options.onListening?.({ port: boundPort, host })

  await new Promise<void>((resolve) => {
    if (options.signal === undefined) return
    if (options.signal.aborted) {
      resolve()
      return
    }
    options.signal.addEventListener('abort', () => resolve(), { once: true })
  })

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
  await selection.dispose()
  await storageSelection.dispose()
  await site.dispose().catch(() => undefined) // selection.dispose() already closed the same handle

  return 0
}
