import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import {
  type AccessContext,
  type AuthRouter,
  buildContentSchema,
  createAuthRouter,
  createContentGateway,
  createContentService,
  createPermissionLayer,
  createRestRouter,
  executeGraphQL,
  type RestRequest,
  type RestResponse,
  type RestRouter,
  resolveActor,
} from '@cogenta/api'
import { type AuthStore, createAuthStore } from '@cogenta/auth'
import {
  CogentaError,
  createDatabaseRegistry,
  createLogger,
  type DatabaseHandle,
  isCogentaError,
  type Logger,
  loadConfig,
} from '@cogenta/core'
import {
  type CollectionDefinition,
  type ContentStore,
  createContentStore,
  createRedirectStore,
  createSchemaTables,
} from '@cogenta/schema'
import type { GraphQLSchema } from 'graphql'
import type { Output, Writer } from '../output.js'

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
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND' &&
    error.message.includes(pathToFileURL(path).href)
  )
}

interface Site {
  readonly db: DatabaseHandle
  readonly auth: AuthStore
  readonly restRouter: RestRouter
  readonly authRouter: AuthRouter
  readonly graphqlSchema: GraphQLSchema
  readonly gateway: ReturnType<typeof createContentGateway>
  dispose(): Promise<void>
}

async function assembleSite(
  db: DatabaseHandle,
  collections: readonly CollectionDefinition[],
  signingKey: string,
): Promise<Site> {
  await createSchemaTables(db, collections)

  const stores = new Map<string, ContentStore>()
  const storeFor = (collection: CollectionDefinition): ContentStore => {
    const existing = stores.get(collection.name)
    if (existing !== undefined) return existing
    const created = createContentStore({ db, collection })
    stores.set(collection.name, created)
    return created
  }

  const redirects = createRedirectStore({ db })
  await redirects.ensureTable()

  const permissions = createPermissionLayer({ collections })
  const service = createContentService({
    collections,
    permissions,
    storeFor,
    routing: { locales: ['en'], defaultLocale: 'en', redirects },
  })

  const auth = await createAuthStore({ db, signingKey, collections })

  return {
    db,
    auth,
    restRouter: createRestRouter({ service }),
    authRouter: createAuthRouter({ auth }),
    graphqlSchema: buildContentSchema({ collections }),
    gateway: createContentGateway({ collections, stores, permissions }),
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

function writeRestResponse(res: ServerResponse, response: RestResponse): void {
  res.writeHead(response.status, response.headers)
  res.end(
    response.body === null || response.body === undefined
      ? undefined
      : JSON.stringify(response.body),
  )
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
      if (url.pathname.startsWith('/api/auth/')) {
        const body =
          req.method === 'GET' || req.method === 'DELETE' ? undefined : await readBody(req)
        const request = toRestRequest(req, url, body)
        writeRestResponse(res, await site.authRouter.handle(request))
        return
      }

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
        writeRestResponse(res, await site.restRouter.handle(request, context))
        return
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
  const site = await assembleSite(selection.instance, collections, loaded.config.auth.signingKey)

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
  out.detail(`${collections.length} collection(s), driver: ${selection.driver}`)
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
  await site.dispose().catch(() => undefined) // selection.dispose() already closed the same handle

  return 0
}
