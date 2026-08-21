import { dirname, join } from 'node:path'
import process from 'node:process'
import { SUPERAGENT_NAME } from '@cogenta/agents'
import { createContentService, createPermissionLayer } from '@cogenta/api'
import { createAuditLog, createUserStore } from '@cogenta/auth'
import {
  type ChannelAdapter,
  type ChannelLinkStore,
  createAgentChatBridge,
  createChannelLinkStore,
  createCommandRouter,
  createDiscordAdapter,
  createSlackAdapter,
  createTelegramAdapter,
  ensureChannelTables,
} from '@cogenta/channels'
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
import {
  type CollectionDefinition,
  type ContentStore,
  createContentStore,
  createSchemaTables,
} from '@cogenta/schema'
import type { Output, Writer } from '../output.js'
import { buildAgentRuntime } from './agent-runtime.js'
import { loadSchemaModule } from './serve.js'

/**
 * `cogenta channels` — L22 task 2's answer to "constructor cette contrainte
 * de déploiement, jamais la contourner": Telegram long-polling is safe per
 * process only with exactly one dedicated instance running it (or a webhook,
 * which this project deliberately does not use yet — see the adapters'
 * own doc comments); Slack Socket Mode and Discord Gateway are each a single
 * persistent connection by nature. Starting any of the three from every
 * `cogenta serve` web replica would either duplicate every inbound update or
 * fight over one connection slot. So none of them start inside `cogenta
 * serve` at all — this is a separate, optional, single-instance process that
 * owns exactly that job and nothing else: `cogenta serve` keeps serving HTTP
 * (including outbound notices, unaffected) whether or not this process is
 * running anywhere.
 *
 * Built the same way `cogenta mcp` is (`mcp.ts`): a second, independent
 * entry point onto the *same* database and the *same* `.cogenta/
 * agents-runtime` agent declarations `cogenta serve` uses — never a second
 * copy of either, and never an HTTP round-trip back into a `cogenta serve`
 * that may not even be running on this host. `@cogenta/channels`' chat
 * bridge (`createAgentChatBridge`) is the one piece of real work this file
 * wires in: an inbound message resolves to the linked Cogenta account (L6's
 * already-tested one-time-code linking, `ChannelLinkStore`), and only runs
 * an agent when that account itself holds `admin` — the same role `POST
 * /api/agents/:name/run` itself requires, so a channel can never grant more
 * than the linked account's own standing already would over HTTP (R4).
 *
 * Bot credentials are secrets and never touch `cogenta.config.mjs` (R7):
 * each provider is configured entirely from environment variables, and a
 * provider whose token is absent is simply not started — a site that wires
 * up Telegram alone runs Telegram alone, with zero code path towards Slack
 * or Discord (R1).
 */

export interface ChannelsOptions {
  readonly cwd?: string
  readonly env?: Record<string, string | undefined>
  readonly logger?: Logger
  readonly out: Output
  readonly stderr: Writer
  /** Aborting stops every adapter, closes the database, and resolves `run()` — the graceful-shutdown seam tests use, mirroring `runServe`'s own `signal`. */
  readonly signal?: AbortSignal
}

const USAGE = `Usage
  cogenta channels

Connects this site to Telegram/Slack/Discord and routes inbound messages to
an agent, running with the linked Cogenta account's own permissions. A
single, dedicated process — do not run more than one per site, and never
start it from inside a load-balanced "cogenta serve" fleet (see the module
doc comment in packages/cli/src/commands/channels.ts).

Reads bot credentials from the environment, never from cogenta.config.mjs:
  COGENTA_CHANNELS_TELEGRAM_BOT_TOKEN
  COGENTA_CHANNELS_SLACK_BOT_TOKEN, COGENTA_CHANNELS_SLACK_APP_TOKEN
  COGENTA_CHANNELS_DISCORD_BOT_TOKEN
A provider with no token set is simply not started.
`

/** Duplicated from `mcp.ts` rather than shared — the two commands otherwise have nothing in common, and this is a dozen lines. */
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

function notConfigured(name: string, missing: readonly string[]): CogentaError {
  return new CogentaError({
    code: 'CHANNEL_PROVIDER_NOT_CONFIGURED',
    message: `${name} has no bot credentials in the environment.`,
    hint: `Set ${missing.join(' and ')} to connect ${name}, or leave it unset to skip it.`,
    details: { channel: name },
  })
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

interface LiveAdapter {
  readonly name: string
  start(): void | Promise<void>
  stop(): void | Promise<void>
}

/**
 * Builds the router+bridge for one channel and, if its credentials are
 * present in `env`, the live adapter itself — `undefined` otherwise, which
 * is how a site with only Telegram configured ends up starting only
 * Telegram (R1). `runner`/`agentExists`/`getUserRoles`/`linkStore` are
 * shared across all three providers; only the credentials and the resulting
 * adapter differ per channel.
 */
async function buildTelegram(deps: {
  readonly env: Record<string, string | undefined>
  readonly linkStore: ChannelLinkStore
  readonly getUserRoles: (userId: string) => Promise<readonly string[]>
  readonly run: (
    name: string,
    instruction: string,
    trigger?: string,
  ) => Promise<{ finalText: string | null }>
  readonly agentExists: (name: string) => boolean
}): Promise<ChannelAdapter & LiveAdapter> {
  const token = deps.env.COGENTA_CHANNELS_TELEGRAM_BOT_TOKEN
  if (token === undefined) throw notConfigured('telegram', ['COGENTA_CHANNELS_TELEGRAM_BOT_TOKEN'])
  const router = createCommandRouter({
    getUserRoles: deps.getUserRoles,
    chat: createAgentChatBridge({
      runner: { run: deps.run },
      agents: { has: deps.agentExists },
      defaultAgentName: SUPERAGENT_NAME,
      getUserRoles: deps.getUserRoles,
      channelName: 'telegram',
      reply: async (identity, message) => {
        if (identity.linkedUserId === null) return
        await adapter.send({ id: identity.channelUserId }, message)
      },
    }),
  })
  const adapter = createTelegramAdapter({ token, linkStore: deps.linkStore, router })
  return Object.assign(adapter, {
    start: () => adapter.start(),
    stop: () => adapter.stop(),
  })
}

async function buildSlack(deps: {
  readonly env: Record<string, string | undefined>
  readonly linkStore: ChannelLinkStore
  readonly getUserRoles: (userId: string) => Promise<readonly string[]>
  readonly run: (
    name: string,
    instruction: string,
    trigger?: string,
  ) => Promise<{ finalText: string | null }>
  readonly agentExists: (name: string) => boolean
}): Promise<ChannelAdapter & LiveAdapter> {
  const botToken = deps.env.COGENTA_CHANNELS_SLACK_BOT_TOKEN
  const appToken = deps.env.COGENTA_CHANNELS_SLACK_APP_TOKEN
  if (botToken === undefined || appToken === undefined) {
    throw notConfigured('slack', [
      'COGENTA_CHANNELS_SLACK_BOT_TOKEN',
      'COGENTA_CHANNELS_SLACK_APP_TOKEN',
    ])
  }
  const router = createCommandRouter({
    getUserRoles: deps.getUserRoles,
    chat: createAgentChatBridge({
      runner: { run: deps.run },
      agents: { has: deps.agentExists },
      defaultAgentName: SUPERAGENT_NAME,
      getUserRoles: deps.getUserRoles,
      channelName: 'slack',
      reply: async (identity, message) => {
        if (identity.linkedUserId === null) return
        await adapter.send({ id: identity.channelUserId }, message)
      },
    }),
  })
  const adapter = createSlackAdapter({ botToken, appToken, linkStore: deps.linkStore, router })
  return Object.assign(adapter, {
    start: () => adapter.start(),
    stop: () => adapter.stop(),
  })
}

async function buildDiscord(deps: {
  readonly env: Record<string, string | undefined>
  readonly linkStore: ChannelLinkStore
  readonly getUserRoles: (userId: string) => Promise<readonly string[]>
  readonly run: (
    name: string,
    instruction: string,
    trigger?: string,
  ) => Promise<{ finalText: string | null }>
  readonly agentExists: (name: string) => boolean
}): Promise<ChannelAdapter & LiveAdapter> {
  const botToken = deps.env.COGENTA_CHANNELS_DISCORD_BOT_TOKEN
  if (botToken === undefined) throw notConfigured('discord', ['COGENTA_CHANNELS_DISCORD_BOT_TOKEN'])
  const router = createCommandRouter({
    getUserRoles: deps.getUserRoles,
    chat: createAgentChatBridge({
      runner: { run: deps.run },
      agents: { has: deps.agentExists },
      defaultAgentName: SUPERAGENT_NAME,
      getUserRoles: deps.getUserRoles,
      channelName: 'discord',
      reply: async (identity, message) => {
        if (identity.linkedUserId === null) return
        await adapter.send({ id: identity.channelUserId }, message)
      },
    }),
  })
  const adapter = createDiscordAdapter({ botToken, linkStore: deps.linkStore, router })
  return Object.assign(adapter, {
    start: () => adapter.start(),
    stop: () => adapter.stop(),
  })
}

export async function runChannels(options: ChannelsOptions): Promise<number> {
  const { out, stderr } = options
  const env = options.env ?? process.env
  const logger = options.logger ?? createLogger({ level: 'silent' })

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

  if (loaded.config.auth.signingKey === undefined) {
    stderr('COGENTA_AUTH_SIGNING_KEY is not set.\n')
    stderr('cogenta channels needs the same signing key cogenta serve uses, to read the same\n')
    stderr('agent and provider configuration. Export COGENTA_AUTH_SIGNING_KEY and try again.\n')
    return 1
  }

  let collections: readonly CollectionDefinition[]
  try {
    collections = (await loadSchemaModule(projectRoot)).collections
  } catch (error) {
    return reportFailure(stderr, error)
  }

  const selection = await createDatabaseRegistry({ logger }).select(loaded.config.database)
  const db = selection.instance

  const live: LiveAdapter[] = []
  try {
    await createSchemaTables(db, collections, [])
    await ensureChannelTables(db)

    const permissions = createPermissionLayer({ collections })
    const storeFor = storeForFactory(db, collections)
    const contentService = createContentService({ collections, permissions, storeFor })
    const mediaStore = createDatabaseMediaStore({ db })
    const auditLog = createAuditLog(db)
    const users = createUserStore(db)
    const linkStore = createChannelLinkStore(db)

    const agentsRuntime = await buildAgentRuntime({
      dataDir: join(projectRoot, '.cogenta', 'agents-runtime'),
      projectRoot,
      signingKey: loaded.config.auth.signingKey,
      site: {
        name: loaded.config.site.name,
        ...(loaded.config.site.url === undefined ? {} : { url: loaded.config.site.url }),
        locales: loaded.config.site.locales,
        defaultLocale: loaded.config.site.defaultLocale,
      },
      contentService,
      mediaStore,
      auditLog,
      logger,
    })

    const getUserRoles = async (userId: string): Promise<readonly string[]> => {
      const user = await users.byId(userId)
      return user === null ? [] : user.roles
    }
    const run = (name: string, instruction: string, trigger?: string) =>
      agentsRuntime.agentRunner.run(name, instruction, trigger)
    const agentExists = (name: string) => agentsRuntime.agentRegistry.get(name) !== undefined

    const builders: readonly [string, () => Promise<ChannelAdapter & LiveAdapter>][] = [
      ['telegram', () => buildTelegram({ env, linkStore, getUserRoles, run, agentExists })],
      ['slack', () => buildSlack({ env, linkStore, getUserRoles, run, agentExists })],
      ['discord', () => buildDiscord({ env, linkStore, getUserRoles, run, agentExists })],
    ]

    for (const [name, build] of builders) {
      try {
        const adapter = await build()
        await adapter.start()
        live.push(adapter)
        out.detail(`${name}: connected.`)
      } catch (error) {
        if (isCogentaError(error) && error.code === 'CHANNEL_PROVIDER_NOT_CONFIGURED') {
          out.detail(`${name}: not configured, skipped.`)
          continue
        }
        throw error
      }
    }

    if (live.length === 0) {
      out.detail(
        'No channel is configured — set COGENTA_CHANNELS_TELEGRAM_BOT_TOKEN, ' +
          'COGENTA_CHANNELS_SLACK_BOT_TOKEN+COGENTA_CHANNELS_SLACK_APP_TOKEN, or ' +
          'COGENTA_CHANNELS_DISCORD_BOT_TOKEN to connect one.',
      )
    } else {
      out.detail(`cogenta channels running — ${live.length} channel(s) connected.`)
    }

    // Runs until told to stop — this process has no other exit condition
    // while at least the intent to run exists (mirrors `runServe`'s own
    // `signal`-driven shutdown).
    await new Promise<void>((resolvePromise) => {
      if (options.signal === undefined) return
      if (options.signal.aborted) {
        resolvePromise()
        return
      }
      options.signal.addEventListener('abort', () => resolvePromise(), { once: true })
    })

    return 0
  } catch (error) {
    return reportFailure(stderr, error)
  } finally {
    for (const adapter of live) await adapter.stop()
    await selection.dispose()
  }
}

export { USAGE as CHANNELS_USAGE }
