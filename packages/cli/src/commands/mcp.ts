import { dirname, join } from 'node:path'
import process from 'node:process'
import { type ApprovalQueue, createFileApprovalQueue } from '@cogenta/agents'
import { createContentService, createPermissionLayer, createSearchRouter } from '@cogenta/api'
import {
  type ApiKey,
  createApiKeyStore,
  createAuditLog,
  createUserStore,
  ensureAuthTables,
  looksLikeApiKey,
} from '@cogenta/auth'
import { vocabularyRegistry } from '@cogenta/blocks'
import {
  CogentaError,
  createDatabaseMediaStore,
  createDatabaseQueue,
  createDatabaseRegistry,
  createLogger,
  type DatabaseHandle,
  findConfigFile,
  isCogentaError,
  type Logger,
  loadConfig,
} from '@cogenta/core'
import { createMcpServer, type McpTool, serveMcpOverStdio } from '@cogenta/mcp'
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
import { createMcpToolSource, type McpIdentity, mcpServerInstructions } from './mcp-tools.js'
import { loadSchemaModule } from './serve.js'

/** Read when no --api-key/--email/--role is given, so a client config can keep the key out of `args` (and out of `ps`). */
export const MCP_API_KEY_ENV = 'COGENTA_MCP_API_KEY'

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
  cogenta mcp [--cwd <site folder>] [--api-key <key> | --email <email> | --role <role>]

Starts an MCP (Model Context Protocol) server on stdin/stdout for an MCP
client running on this machine (Claude Desktop, Claude Code, Cursor…). The
client starts this command itself; run by hand, it waits for a client on its
standard input and never returns on its own. To drive a site deployed on
another machine, use the HTTP endpoint of "cogenta serve" instead
(https://<your site>/api/mcp, with "Authorization: Bearer <key>").

--api-key (or the ${MCP_API_KEY_ENV} environment variable) acts as the key
minted in the admin's "MCP" screen, with exactly that key's roles; revoking
the key stops the session at its next message. --email acts as that account
(it must exist and be active). --role is a synthetic actor for local tests.
Locally, these options name an identity: whoever can run this command in the
site folder can read its database anyway — the security boundary is access
to the machine. Over HTTP, the key is the boundary.

With none of these, calls run as the anonymous "public" actor. Every
non-reversible write waits for a human approval in the administration
(Agents, "Actions à approuver"); a cancelled call withdraws its request.

Options
  --cwd <folder>     The site folder (where cogenta.config.* lives)
  --api-key <key>    Act as the key minted in the admin's "MCP" screen
  --email <email>    Act as this account (looked up in the user store)
  --role <role,…>    Act as a synthetic actor with these roles (tests only)
`

function apiKeyIsUsable(key: ApiKey | null, now: number): key is ApiKey {
  if (key === null || key.revokedAt !== undefined) return false
  return key.expiresAt === undefined || new Date(key.expiresAt).getTime() > now
}

/**
 * Resolves who this server's calls run as — and keeps resolving it: the
 * function returned is called on every message, so a key revoked, an account
 * disabled or a role changed in the administration applies to an open
 * session at once. Before, the actor was read once at start-up and a revoked
 * key went on reading and submitting writes until the client restarted.
 *
 * `--email` looks the user up in the real user store; `--api-key` goes
 * through the same `ApiKeyStore` REST's `resolveActor` verifies against (the
 * key is verified once at start-up, then re-read by id: no usage counted per
 * message). None given: the anonymous ("public") actor.
 */
async function createIdentityResolver(
  options: McpOptions & { readonly apiKey?: string },
  db: DatabaseHandle,
): Promise<() => Promise<McpIdentity>> {
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
    const verified = await apiKeys.verify(options.apiKey)
    if (verified === null) {
      throw new CogentaError({
        code: 'MCP_ACTOR_API_KEY_INVALID',
        message: 'This API key is unknown, revoked, or expired.',
        hint: 'Mint a new one from the admin\'s "MCP" screen, or "Clés API" for a general-purpose key.',
      })
    }
    const keyId = verified.id
    return async () => {
      const key = await apiKeys.getById(keyId)
      if (!apiKeyIsUsable(key, Date.now())) {
        throw new CogentaError({
          code: 'MCP_ACTOR_API_KEY_INVALID',
          message: 'This API key was revoked or has expired: this session no longer authenticates.',
          hint: 'Create a new key in the admin\'s "MCP" screen and update the client configuration.',
        })
      }
      // Same id shape and "roles = scope" mapping as `resolveApiKeyActor`
      // in `@cogenta/api`, so a key behaves identically over HTTP and here.
      return {
        actor: { id: `apikey:${key.id}`, roles: key.scope },
        authenticated: true,
        label: `key "${key.name}"`,
      }
    }
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
    const userId = user.id
    return async () => {
      const current = await users.byId(userId)
      if (current === null || current.status !== 'active') {
        throw new CogentaError({
          code: 'MCP_ACTOR_USER_DISABLED',
          message: `The account ${options.email ?? ''} is no longer active: this session no longer authenticates.`,
          hint: 'An administrator disabled or removed it. Use another account or an API key.',
        })
      }
      return {
        actor: { id: current.id, roles: current.roles },
        authenticated: true,
        label: `account ${current.email}`,
      }
    }
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
    const identity: McpIdentity = {
      actor: { id: null, roles },
      authenticated: true,
      label: 'local test role',
    }
    return async () => identity
  }
  const anonymous: McpIdentity = {
    actor: { id: null, roles: ['public'] },
    authenticated: false,
    label: 'anonymous',
  }
  return async () => anonymous
}

/**
 * `cogenta mcp` — a real MCP server over stdin/stdout, wired to this site's
 * actual content and tools through the same assembly as the `/api/mcp` route
 * of `cogenta serve` (`mcp-tools.ts`). The process exits when its stdin
 * closes (the spawning client disconnected).
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
  const envKey = env[MCP_API_KEY_ENV]
  const apiKey =
    options.apiKey ??
    (options.email === undefined && options.role === undefined && envKey !== undefined && envKey !== ''
      ? envKey
      : undefined)

  const cwd = options.cwd ?? process.cwd()
  // Said plainly, before the config loader lists the missing fields of a
  // config that does not exist: a client that ignores `cwd` starts this in
  // its own folder, and "site.name: Invalid input" sent everyone looking
  // inside a file that was never read.
  if ((await findConfigFile(cwd)) === null) {
    stderr(
      `CONFIG_NOT_FOUND: No cogenta.config.* in ${cwd} or any folder above it.\nRun "cogenta mcp" in your site's folder, or pass --cwd <site folder> (in a client configuration, put "--cwd", "<site folder>" in "args").\n`,
    )
    return 1
  }

  let loaded: Awaited<ReturnType<typeof loadConfig>>
  try {
    loaded = await loadConfig({ cwd, env })
  } catch (error) {
    return reportFailure(stderr, error)
  }
  const projectRoot = loaded.path === null ? cwd : dirname(loaded.path)

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

    const resolveIdentity = await createIdentityResolver({ ...options, ...(apiKey === undefined ? {} : { apiKey }) }, db)
    const firstIdentity = await resolveIdentity()

    // Fiche 63, ADR-0028: `cogenta mcp` builds its own `PermissionLayer`
    // (never `assembleSite`'s), so it must consult the same override table —
    // and re-read it before a write runs (`refreshPermissions`).
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
    const site = {
      name: loaded.config.site.name,
      ...(loaded.config.site.url === undefined ? {} : { url: loaded.config.site.url }),
      locales: loaded.config.site.locales,
      defaultLocale: loaded.config.site.defaultLocale,
    }
    const approvalQueue: ApprovalQueue =
      options.approvalQueue ??
      createFileApprovalQueue({
        directory: join(projectRoot, '.cogenta', 'agents-runtime', 'approvals'),
        signal: cancellation.signal,
      })

    const source = createMcpToolSource(
      {
        collections,
        contentService,
        permissions,
        refreshPermissions: () => rolePermissionOverlay.refresh(),
        mediaStore: createDatabaseMediaStore({ db }),
        search: createSearchRouter({
          index: searchIndex,
          collections,
          permissions,
          defaultLocale: loaded.config.site.defaultLocale,
        }),
        blocks: vocabularyRegistry,
        site,
        logger,
        auditLog: createAuditLog(db),
        approvalQueue,
        transport: 'stdio',
        ...(loaded.config.site.url === undefined
          ? {}
          : { approvalsUrl: `${loaded.config.site.url.replace(/\/+$/u, '')}/admin/agents` }),
      },
      resolveIdentity,
    )
    // Every call is tracked so closing the process waits for its last
    // in-flight calls — a cancelled approval is withdrawn before the
    // database closes, never left pending for a decision that cannot run.
    const tracked = async (): Promise<readonly McpTool[]> =>
      (await source()).map((tool) => ({
        ...tool,
        async execute(input, context) {
          const call = tool.execute(input, context)
          activeCalls.add(call)
          try {
            return await call
          } finally {
            activeCalls.delete(call)
          }
        },
      }))

    // stderr, never `out`: this command speaks JSON-RPC on stdout.
    const initialTools = await source()
    stderr(
      `MCP server ready — ${initialTools.length} tool(s), acting as ${firstIdentity.label} [${firstIdentity.actor.roles.join(', ')}]\n`,
    )

    const server = createMcpServer({
      name: 'cogenta',
      version: '1.1.0',
      instructions: mcpServerInstructions(site),
      tools: tracked,
    })
    const transport = serveMcpOverStdio({
      server,
      ...(options.stdin === undefined ? {} : { input: options.stdin as never }),
      ...(options.stdout === undefined ? {} : { output: options.stdout as never }),
    })

    return await new Promise<number>((resolvePromise) => {
      const finish = () => {
        transport.close()
        resolvePromise(0)
      }
      if (cancellation.signal.aborted) {
        finish()
        return
      }
      cancellation.signal.addEventListener('abort', finish, { once: true })
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
