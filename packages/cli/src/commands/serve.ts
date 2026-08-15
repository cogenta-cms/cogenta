import { readFile } from 'node:fs/promises'
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
  createPermissionLayer,
  createRestRouter,
  executeGraphQL,
  type MediaRouter,
  type RestRequest,
  type RestResponse,
  type RestRouter,
  resolveActor,
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
import {
  buildSchemaDocument,
  type CollectionDefinition,
  type ContentStore,
  createContentStore,
  createRedirectStore,
  createSchemaTables,
  type SchemaDocument,
  withReadOnlyStore,
} from '@cogenta/schema'
import type { GraphQLSchema } from 'graphql'
import type { Output, Writer } from '../output.js'
import { loadSkinCss, renderRequestedPage } from './theme-render.js'

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
  for (const candidate of SCHEMA_FILE_CANDIDATES) {
    const path = join(projectRoot, candidate)
    let module: { default?: unknown }
    try {
      module = (await import(pathToFileURL(path).href)) as { default?: unknown }
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
    return collections as CollectionDefinition[]
  }

  throw new CogentaError({
    code: 'SCHEMA_INVALID',
    message: `No schema file found next to the configuration (looked for ${SCHEMA_FILE_CANDIDATES.join(', ')}).`,
    hint: 'Create cogenta.schema.ts, default-exporting the array of collections defineCollection() built.',
  })
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
  /** Only set when a caller passes `agents` into `assembleSite` — no site constructs one today (R2: agents are optional, not a hard dependency of the CMS). */
  readonly agentsRouter?: AgentsRouter
  /** Not routed through `mediaRouter`: serving a binary body is outside the JSON-only `RestResponse` shape, so the file route is handled directly (same treatment `/api/schema` already gets). */
  readonly mediaStore: MediaStore
  readonly storage: StorageDriver
  readonly graphqlSchema: GraphQLSchema
  readonly gateway: ReturnType<typeof createContentGateway>
  /** `.cogenta/schema.json`'s in-memory twin — the admin's only view of the collections (never the schema modules themselves, which are Node code). */
  readonly schemaDocument: SchemaDocument
  readonly collections: readonly CollectionDefinition[]
  readonly site: {
    readonly name: string
    readonly url: string
    readonly locales: readonly string[]
    readonly defaultLocale: string
  }
  /** `null` when the project has no `theme.tokens.json` — the theme-render fallback serves unstyled HTML rather than refusing. */
  readonly skinCss: string | null
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

async function assembleSite(
  db: DatabaseHandle,
  collections: readonly CollectionDefinition[],
  signingKey: string,
  site: {
    readonly name: string
    readonly url: string
    readonly locales: readonly string[]
    readonly defaultLocale: string
  },
  storage: StorageDriver,
  health: () => Promise<{ readonly database: HealthReport; readonly storage: HealthReport }>,
  /** Optional: no caller constructs an agent registry today, and `/api/agents` simply is not mounted when this is absent — see `agentsRouter` on `Site`. */
  agents?: AgentsRouterOptions,
  /**
   * "Commencer par une démo en lecture seule" (L9 tâche 12, playground). Every
   * write REST or GraphQL could attempt refuses with `CONTENT_READ_ONLY`
   * instead of landing — wrapped once here, at the one place both transports'
   * stores are actually constructed, so neither can bypass it.
   */
  readOnly = false,
  /** `null` when `theme.tokens.json` is absent or invalid — see `loadSkinCss`. */
  skinCss: string | null = null,
): Promise<Site> {
  await createSchemaTables(db, collections)

  const stores = new Map<string, ContentStore>()
  const storeFor = (collection: CollectionDefinition): ContentStore => {
    const existing = stores.get(collection.name)
    if (existing !== undefined) return existing
    const created = createContentStore({ db, collection })
    const stored = readOnly ? withReadOnlyStore(created) : created
    stores.set(collection.name, stored)
    return stored
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
    signingKey,
    collections,
    issuer: site.name,
    webauthn: webauthnConfigFor(site),
  })

  const mediaStore = createDatabaseMediaStore({ db })

  return {
    db,
    auth,
    restRouter: createRestRouter({ service, siteUrl: site.url }),
    authRouter: createAuthRouter({ auth }),
    mediaRouter: createMediaRouter({ store: mediaStore, storage }),
    auditRouter: createAuditRouter({ audit: auth.audit }),
    ...(agents === undefined ? {} : { agentsRouter: createAgentsRouter(agents) }),
    mediaStore,
    storage,
    graphqlSchema: buildContentSchema({ collections }),
    gateway: createContentGateway({ collections, stores, permissions }),
    schemaDocument: buildSchemaDocument(collections, {
      locales: site.locales,
      defaultLocale: site.defaultLocale,
    }),
    collections,
    site,
    skinCss,
    health,
    dispose: async () => {
      await db.close()
    },
  }
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
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

      if (url.pathname.startsWith('/api/auth/')) {
        const body =
          req.method === 'GET' || req.method === 'DELETE' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        const response = await site.authRouter.handle(request)
        writeRestResponse(res, response)
        await recordAuthAudit(site, actor, req.method ?? 'GET', url.pathname, response, logger)
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

      if (url.pathname.startsWith('/api/media')) {
        const body =
          req.method === 'GET' || req.method === 'DELETE' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        const response = await site.mediaRouter.handle(request, context.actor)
        writeRestResponse(res, response)
        await recordMediaAudit(site, actor, req.method ?? 'GET', url.pathname, response, logger)
        return
      }

      if (url.pathname.startsWith('/api/audit')) {
        const request = toRestRequest(req, url, undefined)
        writeRestResponse(res, await site.auditRouter.handle(request, context.actor))
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

      // Real theme HTML for anything else — see `theme-render.ts`'s own
      // doc comment for what this is and, as importantly, what it isn't
      // (no Astro build, one theme, no image pipeline). GET only: rendering
      // a page has no meaningful response to any other method.
      if (req.method === 'GET') {
        const html = await renderRequestedPage(
          url.pathname,
          {
            collections: site.collections,
            gateway: site.gateway,
            site: site.site,
            skinCss: site.skinCss,
          },
          context,
        )
        if (html !== null) {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
          res.end(html)
          return
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
}

const DEFAULT_PORT = 4000
const DEFAULT_HOST = '127.0.0.1'

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
  try {
    collections = await loadCollections(projectRoot)
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
  const skinCss = await loadSkinCss(
    (path) => readFile(path, 'utf8'),
    join(projectRoot, 'theme.tokens.json'),
  )
  const site = await assembleSite(
    selection.instance,
    collections,
    loaded.config.auth.signingKey,
    loaded.config.site,
    storageSelection.instance,
    async () => ({ database: await selection.health(), storage: await storageSelection.health() }),
    undefined,
    options.readOnly ?? false,
    skinCss,
  )

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
    `${collections.length} collection(s), db driver: ${selection.driver}, storage driver: ${storageSelection.driver}`,
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
  })
  await selection.dispose()
  await storageSelection.dispose()
  await site.dispose().catch(() => undefined) // selection.dispose() already closed the same handle

  return 0
}
