import { dirname } from 'node:path'
import process from 'node:process'
import {
  buildManifest,
  type ContentServiceLike,
  createContentDeleteTool,
  createContentPublishTool,
  createContentReadTool,
  createContentWriteDraftTool,
  createMediaReadTool,
  createMediaWriteTool,
  createSiteConfigReadTool,
  createToolRegistry,
  type ExecutableTool,
  type ToolDefinition,
} from '@cogenta/agents'
import {
  type AccessContext,
  type ContentService,
  createContentService,
  createPermissionLayer,
} from '@cogenta/api'
import {
  createApiKeyStore,
  createUserStore,
  ensureAuthTables,
  looksLikeApiKey,
} from '@cogenta/auth'
import {
  CogentaError,
  createDatabaseMediaStore,
  createDatabaseRegistry,
  createLogger,
  type DatabaseHandle,
  isCogentaError,
  type Logger,
  loadConfig,
} from '@cogenta/core'
import { createMcpServer, serveMcpOverStdio } from '@cogenta/mcp'
import {
  type CollectionDefinition,
  type ContentStore,
  createContentStore,
  createSchemaTables,
} from '@cogenta/schema'
import type { Output, Writer } from '../output.js'
import { loadSchemaModule } from './serve.js'

export interface McpOptions {
  readonly cwd?: string
  readonly env?: Record<string, string | undefined>
  readonly logger?: Logger
  readonly out: Output
  readonly stderr: Writer
  /** Resolves the acting user from the real user store — the process that launched this command IS that user. */
  readonly email?: string
  /** A synthetic actor for local testing (`--role viewer`), never combined with --email. */
  readonly role?: string
  /**
   * A machine-to-machine bearer credential minted from the admin's "MCP"
   * screen (or the generic "Clés API" one) — resolved through the exact same
   * `ApiKeyStore` REST's `resolveActor` verifies against
   * (`@cogenta/auth`'s `createApiKeyStore`), never a second store. The
   * actor's roles are the key's `scope`, and its id is `apikey:<key id>`,
   * mirroring `resolveApiKeyActor` in `@cogenta/api` byte for byte — a role
   * this key was not granted is refused by the same `PermissionLayer` REST
   * uses, not by anything specific to MCP. Never combined with --email or
   * --role.
   */
  readonly apiKey?: string
  /** Injectable for tests — defaults to the real process streams. */
  readonly stdin?: NodeJS.ReadableStream
  readonly stdout?: NodeJS.WritableStream
}

const USAGE = `Usage
  cogenta mcp [--email <email> | --role <role> | --api-key <key>]

Starts an MCP (Model Context Protocol) server on stdin/stdout, exposing this
site's content and site tools to whatever process spawned this command
(Claude Desktop, Claude Code, Cursor, or any other MCP client). See
packages/mcp/README.md for how to connect one.

--email resolves the acting user from this site's own user store: every tool
call runs with that user's real roles, checked by the same permission layer
REST and GraphQL use (R4). --role hands a synthetic actor with no id and the
named role(s) (comma-separated) — meant for local testing, never for a real
deployment. --api-key resolves the acting roles from a key minted in the
admin's "MCP" or "Clés API" screen, through the exact same key store and
verification REST uses for that key — a role the key was not granted is
refused by the same permission layer, exactly as it would be over HTTP.

With none of these flags, tool calls run as an anonymous ("public") actor:
content tools still run through the real permission layer (a public actor
sees only what a public actor may see), but media, site-config and
HTTP-fetch tools — which have no permission check of their own to fall back
on — are left out of the manifest entirely. See BLOCKERS.md, "MCP actor
scoping", for why.

Options
  --email <email>    Run as this user (looked up in the user store; must exist)
  --role <role,…>    Run as a synthetic actor with these roles, no real user
  --api-key <key>    Run as the actor a "cogenta_sk_…" API key was granted
`

/** A fresh, undecorated store per collection: an MCP tool call reads and writes content the same way `cogenta serve`'s REST/GraphQL routes do, through the real permission layer, but does not carry the search/redirect/schedule/vector decorators `assembleSite` wraps around a store — those are cache and derived-index maintenance, not permission-relevant, and wiring the whole of `assembleSite` into a single stdio command is out of this task's scope (see BLOCKERS.md). */
function storeForFactory(
  db: DatabaseHandle,
  collections: readonly CollectionDefinition[],
): (collection: CollectionDefinition) => ContentStore {
  const cache = new Map<string, ContentStore>()
  return (collection) => {
    const existing = cache.get(collection.name)
    if (existing !== undefined) return existing
    const created = createContentStore({ db, collection, siblings: collections })
    cache.set(collection.name, created)
    return created
  }
}

/**
 * Adapts `@cogenta/api`'s real `ContentService` to the narrow
 * `ContentServiceLike` the core content tools (`@cogenta/agents`) declare
 * against — a `SerialisedEntry` is a plain, already-JSON-safe object (the
 * exact shape REST hands back as `data`), it merely lacks the string index
 * signature `Record<string, unknown>` promises structurally. Runtime shape
 * is identical; this is a type-level seam only.
 */
function contentServiceLikeOf(service: ContentService): ContentServiceLike {
  return {
    read: (context, collection, id, options) =>
      service.read(context, collection, id, options) as unknown as Promise<Record<string, unknown>>,
    create: (context, collection, input, options) =>
      service.create(context, collection, input, options) as unknown as Promise<
        Record<string, unknown>
      >,
    update: (context, collection, id, input, options) =>
      service.update(context, collection, id, input, options) as unknown as Promise<
        Record<string, unknown>
      >,
    publish: (context, collection, id, input, options) =>
      service.publish(context, collection, id, input, options) as unknown as Promise<
        Record<string, unknown>
      >,
    remove: (context, collection, id) => service.remove(context, collection, id),
  }
}

/**
 * Resolves the actor this MCP server's tool calls will run as.
 *
 * `--email` looks the user up in the real user store — the account must
 * already exist (`cogenta users create`); this command never creates one.
 * `--role` is a synthetic actor for local testing. `--api-key` resolves
 * through the same `ApiKeyStore` (`@cogenta/auth`) REST's `resolveActor`
 * verifies against — one store, two callers, never a second lookup path.
 * None given: the anonymous ("public") actor, same as an unauthenticated
 * REST request.
 */
async function resolveMcpActor(
  options: McpOptions,
  db: DatabaseHandle,
): Promise<{ readonly actor: AccessContext['actor']; readonly authenticated: boolean }> {
  const given = [options.email, options.role, options.apiKey].filter(
    (value) => value !== undefined,
  ).length
  if (given > 1) {
    throw new CogentaError({
      code: 'MCP_ACTOR_OPTIONS_CONFLICT',
      message: '--email, --role and --api-key are mutually exclusive.',
      hint: 'Pass exactly one: --email resolves a real user, --role is a synthetic test actor, --api-key resolves a minted key.',
    })
  }
  if (options.apiKey !== undefined) {
    if (!looksLikeApiKey(options.apiKey)) {
      throw new CogentaError({
        code: 'MCP_ACTOR_API_KEY_INVALID',
        message: 'That does not look like a Cogenta API key.',
        hint: 'A real key starts with "cogenta_sk_" — copy it again from the admin\'s "MCP" screen.',
      })
    }
    await ensureAuthTables(db)
    const apiKeys = createApiKeyStore(db)
    const key = await apiKeys.verify(options.apiKey)
    if (key === null) {
      throw new CogentaError({
        code: 'MCP_ACTOR_API_KEY_INVALID',
        message: 'This API key is unknown, revoked, or expired.',
        hint: 'Mint a new one from the admin\'s "MCP" screen, or "Clés API" for a general-purpose key.',
      })
    }
    // Mirrors `resolveApiKeyActor` in `@cogenta/api` (`packages/api/src/rest/auth-router.ts`)
    // exactly: the same id shape and the same "roles = scope" mapping, so a
    // key behaves identically whether it authenticates an HTTP request or
    // this stdio server.
    return { actor: { id: `apikey:${key.id}`, roles: key.scope }, authenticated: true }
  }
  if (options.email !== undefined) {
    await ensureAuthTables(db)
    const users = createUserStore(db)
    const user = await users.byEmail(options.email)
    if (user === null) {
      throw new CogentaError({
        code: 'MCP_ACTOR_USER_NOT_FOUND',
        message: `No user with email "${options.email}".`,
        hint: 'Create the account first with "cogenta users create --email <email> --roles <role,role>".',
      })
    }
    return { actor: { id: user.id, roles: user.roles }, authenticated: true }
  }
  if (options.role !== undefined) {
    const roles = options.role
      .split(',')
      .map((role) => role.trim())
      .filter((role) => role.length > 0)
    if (roles.length === 0) {
      throw new CogentaError({
        code: 'MCP_ACTOR_ROLE_EMPTY',
        message: '--role was given but named no role.',
        hint: 'Pass at least one role name, e.g. --role viewer or --role editor,reviewer.',
      })
    }
    return { actor: { id: null, roles }, authenticated: true }
  }
  return { actor: { id: null, roles: ['public'] }, authenticated: false }
}

/**
 * Builds this site's real tool manifest for the resolved actor.
 *
 * Content tools (`content.*`) are always included: their actual permission
 * gate lives inside `ContentService`, which calls the same `PermissionLayer`
 * REST and GraphQL use, on every call, keyed on `ctx.actor` — so an anonymous
 * actor is already refused whatever a `public` role may not read or write,
 * exactly as it would be over HTTP.
 *
 * Media, site-config and HTTP-fetch tools have no such internal check (their
 * own doc comments say so plainly: "this tool's declared permissions is the
 * actual gate, enforced by the manifest" — meaning by *this* function, not by
 * the store). They are therefore included only for an authenticated actor
 * (`--email` or `--role`), never for the anonymous default — R4 requires a
 * runtime check somewhere, and for these three tools the manifest boundary is
 * the only place that check can happen.
 */
function buildSiteManifest(options: {
  readonly contentService: Parameters<typeof createContentReadTool>[0]
  readonly mediaStore: Parameters<typeof createMediaReadTool>[0]
  readonly site: { name: string; url?: string; locales: readonly string[]; defaultLocale: string }
  readonly actor: AccessContext['actor']
  readonly authenticated: boolean
  readonly logger: Logger
}): readonly ExecutableTool[] {
  const registered: ToolDefinition[] = [
    createContentReadTool(options.contentService),
    createContentWriteDraftTool(options.contentService),
    createContentPublishTool(options.contentService),
    createContentDeleteTool(options.contentService),
  ]
  if (options.authenticated) {
    registered.push(
      createMediaReadTool(options.mediaStore),
      createMediaWriteTool(options.mediaStore),
      createSiteConfigReadTool(),
    )
  }

  const registry = createToolRegistry(registered)
  return buildManifest(
    registry,
    registered.map((tool) => tool.name),
    {
      site: options.site,
      actor: options.actor,
      logger: {
        info: (message, fields) => options.logger.info(message, fields),
        warn: (message, fields) => options.logger.warn(message, fields),
        error: (message, fields) => options.logger.error(message, fields),
      },
    },
  )
}

/**
 * `cogenta mcp` — a real MCP server over stdin/stdout, wired to this site's
 * actual content and tools. `serveMcpOverStdio` never returns on its own; the
 * process exits when its stdin closes (the spawning client disconnected).
 */
export async function runMcp(options: McpOptions): Promise<number> {
  const { out, stderr } = options
  const env = options.env ?? process.env
  const logger = options.logger ?? createLogger({ level: 'silent' })

  if (
    [options.email, options.role, options.apiKey].filter((value) => value !== undefined).length > 1
  ) {
    stderr(`--email, --role and --api-key are mutually exclusive.\n\n${USAGE}`)
    return 2
  }

  let loaded: Awaited<ReturnType<typeof loadConfig>>
  try {
    loaded = await loadConfig({
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      env,
    })
  } catch (error) {
    return reportFailure(stderr, error)
  }
  const projectRoot = loaded.path === null ? (options.cwd ?? process.cwd()) : dirname(loaded.path)

  let collections: readonly CollectionDefinition[]
  try {
    collections = (await loadSchemaModule(projectRoot)).collections
  } catch (error) {
    return reportFailure(stderr, error)
  }

  const selection = await createDatabaseRegistry({ logger }).select(loaded.config.database)
  const db = selection.instance

  try {
    await createSchemaTables(db, collections, [])

    const { actor, authenticated } = await resolveMcpActor(options, db)

    const permissions = createPermissionLayer({ collections })
    const storeFor = storeForFactory(db, collections)
    const contentService = createContentService({ collections, permissions, storeFor })
    const mediaStore = createDatabaseMediaStore({ db })

    const tools = buildSiteManifest({
      contentService: contentServiceLikeOf(contentService),
      mediaStore,
      site: {
        name: loaded.config.site.name,
        ...(loaded.config.site.url === undefined ? {} : { url: loaded.config.site.url }),
        locales: loaded.config.site.locales,
        defaultLocale: loaded.config.site.defaultLocale,
      },
      actor,
      authenticated,
      logger,
    })

    out.detail(
      `MCP server ready — ${tools.length} tool(s), actor: ${actor.id ?? '(anonymous)'} [${actor.roles.join(', ')}]`,
    )

    const server = createMcpServer({ name: 'cogenta', version: '1.0.0', tools })
    serveMcpOverStdio({
      server,
      ...(options.stdin === undefined ? {} : { input: options.stdin as never }),
      ...(options.stdout === undefined ? {} : { output: options.stdout as never }),
    })

    // Runs until stdin closes (the MCP client disconnected) — this command
    // has no other exit condition, matching stdio MCP servers generally.
    return await new Promise<number>((resolvePromise) => {
      const input = options.stdin ?? process.stdin
      input.once('end', () => resolvePromise(0))
      input.once('close', () => resolvePromise(0))
    })
  } catch (error) {
    return reportFailure(stderr, error)
  } finally {
    await selection.dispose()
  }
}

function reportFailure(stderr: Writer, error: unknown): number {
  if (isCogentaError(error)) {
    stderr(`${error.code}: ${error.message}\n`)
    if (error.hint !== undefined) stderr(`${error.hint}\n`)
  } else {
    stderr(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
  }
  return 1
}
