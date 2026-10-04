import { dirname, join } from 'node:path'
import process from 'node:process'
import {
  type ApprovalQueue,
  buildManifest,
  type ContentServiceLike,
  createContentDeleteTool,
  createContentPublishTool,
  createContentReadTool,
  createContentWriteDraftTool,
  createFileApprovalQueue,
  createMediaReadTool,
  createMediaWriteTool,
  createSiteConfigReadTool,
  createToolRegistry,
  type ExecutableTool,
  type ToolDefinition,
  withAudit,
  withAutonomy,
} from '@cogenta/agents'
import {
  type AccessContext,
  type ContentService,
  canAccessMedia,
  createContentService,
  createPermissionLayer,
  type PermissionLayer,
} from '@cogenta/api'
import {
  createApiKeyStore,
  createAuditLog,
  createUserStore,
  ensureAuthTables,
  looksLikeApiKey,
} from '@cogenta/auth'
import {
  CogentaError,
  createDatabaseMediaStore,
  createDatabaseQueue,
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
  createRedirectStore,
  createRolePermissionOverlay,
  createRolePermissionStore,
  createSchemaTables,
  createSearchIndex,
  type TaxonomyDefinition,
} from '@cogenta/schema'
import type { Output, Writer } from '../output.js'
import { createDecoratedContentStores } from './decorated-content-stores.js'
import { loadSchemaModule } from './serve.js'

export interface McpOptions {
  readonly cwd?: string
  readonly env?: Record<string, string | undefined>
  readonly logger?: Logger
  /**
   * Present so every command shares one signature, and **deliberately never
   * written to**: the real CLI builds this on stdout, which here belongs to
   * JSON-RPC. Anything this command has to say to a human goes to `stderr`.
   */
  readonly out: Output
  readonly stderr: Writer
  /** Shared human-review channel; defaults to the same file queue the admin uses. */
  readonly approvalQueue?: ApprovalQueue
  /** Resolves the acting user from the real user store. */
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
the manifest exposes only the effective collection capabilities. Media and
site-config tools require authentication; viewers can read media, while only
editors and admins can write them. Every non-reversible mutation requires
human approval in the administration; pending requests are shared through
.cogenta/agents-runtime/approvals. Closing MCP cancels waiting calls.

Options
  --email <email>    Run as this user (looked up in the user store; must exist)
  --role <role,…>    Run as a synthetic actor with these roles, no real user
  --api-key <key>    Run as the actor a "cogenta_sk_…" API key was granted
`

/**
 * Adapts `@cogenta/api`'s real `ContentService` to the narrow
 * `ContentServiceLike` the core content tools (`@cogenta/agents`) declare
 * against — a `SerialisedEntry` is a plain, already-JSON-safe object (the
 * exact shape REST hands back as `data`), it merely lacks the string index
 * signature `Record<string, unknown>` promises structurally. Runtime shape
 * is identical; this is a type-level seam only.
 */
function contentServiceLikeOf(service: ContentService, defaultLocale: string): ContentServiceLike {
  return {
    read: (context, collection, id, options) =>
      service.read(context, collection, id, options) as unknown as Promise<Record<string, unknown>>,
    create: (context, collection, input, options) =>
      service.create(
        context,
        collection,
        { ...input, locale: input.locale ?? defaultLocale, createdBy: context.actor.id },
        options,
      ) as unknown as Promise<Record<string, unknown>>,
    update: (context, collection, id, input, options) =>
      service.update(
        context,
        collection,
        id,
        { ...input, updatedBy: context.actor.id },
        options,
      ) as unknown as Promise<Record<string, unknown>>,
    publish: (context, collection, id, input, options) =>
      service.publish(
        context,
        collection,
        id,
        { ...input, publishedBy: context.actor.id },
        options,
      ) as unknown as Promise<Record<string, unknown>>,
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

/** Build capabilities from effective collection grants and the shared media policy.
 * Detailed content ownership is still checked by ContentService on every call (R4).
 */
function buildSiteManifest(options: {
  readonly contentService: Parameters<typeof createContentReadTool>[0]
  readonly mediaStore: Parameters<typeof createMediaReadTool>[0]
  readonly site: { name: string; url?: string; locales: readonly string[]; defaultLocale: string }
  readonly actor: AccessContext['actor']
  readonly authenticated: boolean
  readonly logger: Logger
  readonly collections: readonly CollectionDefinition[]
  readonly permissions: PermissionLayer
}): readonly ExecutableTool[] {
  const registered: ToolDefinition[] = [
    createContentReadTool(options.contentService),
    createContentWriteDraftTool(options.contentService),
    createContentPublishTool(options.contentService),
    createContentDeleteTool(options.contentService),
  ]
  if (options.authenticated && canAccessMedia(options.actor, 'media.read')) {
    registered.push(createMediaReadTool(options.mediaStore))
  }
  if (options.authenticated && canAccessMedia(options.actor, 'media.write')) {
    registered.push(createMediaWriteTool(options.mediaStore))
  }
  if (options.authenticated) registered.push(createSiteConfigReadTool())

  const allowed = registered.filter((tool) => {
    const actions =
      tool.name === 'content.write_draft'
        ? (['create', 'update'] as const)
        : tool.name === 'content.publish'
          ? (['publish'] as const)
          : tool.name === 'content.delete'
            ? (['delete'] as const)
            : tool.name === 'content.read'
              ? (['read'] as const)
              : undefined
    if (actions === undefined) return true
    return options.collections.some((collection) =>
      actions.some((action) => {
        return options.permissions.can(
          action,
          collection,
          { actor: options.actor },
          options.actor.id,
        ).allowed
      }),
    )
  })
  const registry = createToolRegistry(allowed)
  return buildManifest(
    registry,
    allowed.map((tool) => tool.name),
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
  const { stderr } = options
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
  let taxonomies: readonly TaxonomyDefinition[]
  try {
    const loadedSchema = await loadSchemaModule(projectRoot)
    collections = loadedSchema.collections
    taxonomies = loadedSchema.taxonomies
  } catch (error) {
    return reportFailure(stderr, error)
  }

  const selection = await createDatabaseRegistry({ logger }).select(loaded.config.database)
  const db = selection.instance
  const cancellation = new AbortController()
  const inputStream = options.stdin ?? process.stdin
  const cancel = () => cancellation.abort()
  inputStream.once('end', cancel)
  inputStream.once('close', cancel)
  const activeCalls = new Set<Promise<unknown>>()

  try {
    await createSchemaTables(db, collections, taxonomies)
    await ensureAuthTables(db)

    const { actor, authenticated } = await resolveMcpActor(options, db)

    // Fiche 63, ADR-0028: `cogenta mcp` builds its own `PermissionLayer`
    // (never `assembleSite`'s), so it must consult the same override table —
    // otherwise a permission an admin just revoked in production would stay
    // granted to any MCP client until the process restarts, exactly the
    // silent-widening R4 exists to prevent.
    const rolePermissionOverlay = await createRolePermissionOverlay(
      createRolePermissionStore({ db, collections, taxonomies }),
    )
    const permissions = createPermissionLayer({
      collections,
      rolePermissionOverrides: rolePermissionOverlay,
    })
    const searchIndex = await createSearchIndex({ db })
    const redirects = createRedirectStore({ db })
    await redirects.ensureTable()
    const { storeFor } = createDecoratedContentStores({
      db,
      collections,
      defaultLocale: loaded.config.site.defaultLocale,
      logger,
      searchIndex,
      redirects,
      scheduledPublishQueue: createDatabaseQueue({ db, logger }),
    })
    const contentService = createContentService({ collections, permissions, storeFor })
    const mediaStore = createDatabaseMediaStore({ db })

    const tools = buildSiteManifest({
      contentService: contentServiceLikeOf(contentService, loaded.config.site.defaultLocale),
      collections,
      permissions,
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

    // stderr, never `out`. This command speaks JSON-RPC on stdout, and the
    // real CLI builds `out` on that same stream — so a readiness line printed
    // through it is the first thing a client reads, and it is not JSON. The
    // connection then fails before `initialize` is ever answered. Every
    // stdio MCP server has this rule; ours broke it by using the same output
    // helper as every other command.
    stderr(
      `MCP server ready — ${tools.length} tool(s), actor: ${actor.id ?? '(anonymous)'} [${actor.roles.join(', ')}]\n`,
    )

    const auditLog = createAuditLog(db)
    const approvalQueue = cancellableApprovalQueue(
      options.approvalQueue ??
        createFileApprovalQueue({
          directory: join(projectRoot, '.cogenta', 'agents-runtime', 'approvals'),
          signal: cancellation.signal,
        }),
      cancellation.signal,
    )
    const governedTools = tools.map((tool) => {
      const guarded: ExecutableTool = {
        ...tool,
        async execute(input, context) {
          if (context.signal.aborted)
            throw new CogentaError({
              code: 'APPROVAL_REQUEST_CANCELLED',
              message: 'The MCP connection closed before execution.',
              hint: 'Reconnect and submit a new request if needed.',
            })
          // An approval can wait while HTTP administrators revoke a grant.
          // Re-read the shared overlay before ContentService checks this call.
          if (tool.spec.name.startsWith('content.')) await rolePermissionOverlay.refresh()
          return tool.execute(input, context)
        },
      }
      const audited = withAudit(
        withAutonomy(guarded, {
          agentName: 'mcp',
          autonomy: { default: 'autonomous' },
          approvalQueue,
        }),
        {
          agentName: 'mcp',
          actor,
          autonomyLevel: tool.sideEffects === true ? 'execute_with_approval' : 'autonomous',
          auditLog: {
            record: (input) => {
              const output = input.diff?.['output']
              const entryId =
                typeof output === 'object' &&
                output !== null &&
                'id' in output &&
                typeof output.id === 'string'
                  ? output.id
                  : undefined
              return auditLog.record({
                ...input,
                ...(entryId === undefined ? {} : { entryId }),
                diff: { ...input.diff, origin: 'mcp' },
              })
            },
          },
          targetOf: (input) => ({
            ...(typeof input['collection'] === 'string' ? { collection: input['collection'] } : {}),
            ...(typeof input['id'] === 'string' ? { entryId: input['id'] } : {}),
          }),
          onAuditFailure: (error) =>
            logger.error('MCP audit write failed', { error: String(error) }),
        },
      )
      return {
        ...audited,
        async execute(
          input: Readonly<Record<string, unknown>>,
          context: Parameters<ExecutableTool['execute']>[1],
        ) {
          const call = audited.execute(input, { ...context, signal: cancellation.signal })
          activeCalls.add(call)
          try {
            return await call
          } finally {
            activeCalls.delete(call)
          }
        },
      }
    })
    const server = createMcpServer({ name: 'cogenta', version: '1.0.0', tools: governedTools })
    serveMcpOverStdio({
      server,
      ...(options.stdin === undefined ? {} : { input: options.stdin as never }),
      ...(options.stdout === undefined ? {} : { output: options.stdout as never }),
    })

    // Runs until stdin closes (the MCP client disconnected) — this command
    // has no other exit condition, matching stdio MCP servers generally.
    return await new Promise<number>((resolvePromise) => {
      if (cancellation.signal.aborted) {
        resolvePromise(0)
        return
      }
      cancellation.signal.addEventListener('abort', () => resolvePromise(0), { once: true })
    })
  } catch (error) {
    return reportFailure(stderr, error)
  } finally {
    cancellation.abort()
    await Promise.allSettled([...activeCalls])
    inputStream.removeListener('end', cancel)
    inputStream.removeListener('close', cancel)
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

/** Disconnecting a process cannot leave a future human decision executing its old call. */
function cancellableApprovalQueue(queue: ApprovalQueue, signal: AbortSignal): ApprovalQueue {
  return {
    ...queue,
    request(input) {
      return new Promise((resolve, reject) => {
        const abort = () => {
          signal.removeEventListener('abort', abort)
          reject(
            new CogentaError({
              code: 'APPROVAL_REQUEST_CANCELLED',
              message: 'Waiting for human approval was cancelled.',
              hint: 'Reconnect and submit a new request if the action is still needed.',
            }),
          )
        }
        if (signal.aborted) {
          abort()
          return
        }
        signal.addEventListener('abort', abort, { once: true })
        queue
          .request(input)
          .then(resolve, reject)
          .finally(() => signal.removeEventListener('abort', abort))
      })
    },
  }
}
