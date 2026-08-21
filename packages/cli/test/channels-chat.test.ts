import { mkdtemp, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMemoryApprovalQueue } from '@cogenta/agents'
import { createContentService, createPermissionLayer } from '@cogenta/api'
import { createAuditLog } from '@cogenta/auth'
import { createAgentChatBridge, createCommandRouter } from '@cogenta/channels'
import {
  createDatabaseMediaStore,
  createDatabaseRegistry,
  createLogger,
  type DatabaseHandle,
  loadConfig,
} from '@cogenta/core'
import {
  type CollectionDefinition,
  type ContentStore,
  createContentStore,
  createNotFoundLogStore,
  createRedirectStore,
  createSchemaTables,
} from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { buildAgentRuntime } from '../src/commands/agent-runtime.js'
import { loadSchemaModule } from '../src/commands/serve.js'

/**
 * L22 task 2 — the inbound side of `@cogenta/channels` wired to a real agent
 * runtime, for real: `createCommandRouter`'s new `chat` fallback
 * (`packages/channels/src/inbound/router.ts`) and `createAgentChatBridge`
 * (`packages/channels/src/chat/bridge.ts`), driving `buildAgentRuntime`'s
 * real orchestrator (`packages/cli/src/commands/agent-runtime.ts`) — the
 * exact assembly `cogenta channels` (`commands/channels.ts`) uses. Built
 * directly (not via `cogenta serve` over HTTP) for one reason: proving the
 * required acceptance scenario needs to *decide* the human-approval request
 * a write tool call always produces (see below), and that queue is a
 * same-process object with no HTTP surface today — a real, honestly-named
 * gap (`AgentRuntimeAssembly.approvalQueue`'s own doc comment), not
 * something this test works around.
 *
 * The required scenario from the lot doc: ask an agent (as if from a linked
 * channel) to create a menu item with given characteristics, and prove it
 * really used `content.write_draft` — a real contract-C tool against a real
 * collection — never a fabricated action outside the tool registry.
 *
 * One property of the real system this test surfaces rather than hides:
 * `content.write_draft` is `sideEffects: true, reversible: false`, so
 * `with-autonomy.ts`'s `forcedApproval` routes it through the approval
 * queue regardless of the agent's configured autonomy level (R6 — a
 * non-reversible write always needs a human decision, autonomous or not).
 * A chat message can therefore never *silently* create content; it can only
 * make the *correct* proposal for a human to approve. This test approves it
 * itself, concurrently with the in-flight run, to prove the whole path
 * through to a real created entry — exactly what `list(status: 'pending')`
 * + `decide()` a future approvals screen or channel `/approve` command
 * would do.
 *
 * `ChannelLinkStore`'s own one-time-code linking is already proven in
 * `packages/channels/test/linking/store.test.ts` and
 * `packages/channels/test/providers/telegram/inbound.test.ts` — this test
 * starts from an already-linked `ChannelIdentity`, on purpose, so it proves
 * exactly the one thing that is new here.
 */

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'menu',
    labels: { singular: 'Menu item', plural: 'Menu items' },
    routing: { pattern: '/menu/:slug' },
    versioning: { drafts: true, history: true },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title' } },
      description: { kind: 'text', required: false, options: { max: 2000 } },
    },
    // `create`/`update` name `admin` alongside `editor`, deliberately: every
    // agent run's tool-level actor is `{roles: ['admin', 'agent']}`
    // (`orchestrator.ts`'s `actorFor` — an open role-name check, no implicit
    // "admin can do anything" in `@cogenta/api`'s `PermissionLayer`), so a
    // collection an agent may write to has to actually name that role, the
    // same way a real site would grant it explicitly.
    permissions: {
      read: ['public'],
      create: ['editor', 'admin'],
      update: ['editor', 'admin'],
      delete: ['admin'],
      publish: ['editor', 'admin'],
    },
  },
]

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-channels-chat-e2e-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Test site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
  vector: { path: ${JSON.stringify(join(root, 'vectors'))} },
}
`,
    'utf8',
  )
  await writeFile(
    join(root, 'cogenta.schema.mjs'),
    `export default ${JSON.stringify(COLLECTIONS, null, 2)}\n`,
    'utf8',
  )
  return root
}

interface AnthropicScriptedResponse {
  readonly content: readonly (
    | { readonly type: 'text'; readonly text: string }
    | {
        readonly type: 'tool_use'
        readonly id: string
        readonly name: string
        readonly input: unknown
      }
  )[]
  readonly stop_reason: 'end_turn' | 'tool_use'
  readonly usage: { readonly input_tokens: number; readonly output_tokens: number }
}

interface FakeAnthropic {
  readonly url: string
  readonly requests: unknown[]
  close(): Promise<void>
}

async function startFakeAnthropic(
  responses: readonly AnthropicScriptedResponse[],
): Promise<FakeAnthropic> {
  let index = 0
  const requests: unknown[] = []
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      const response = responses[index]
      index += 1
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(response))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('fake Anthropic has no port')
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

const fakeProviders: FakeAnthropic[] = []
const openDbs: { dispose(): Promise<void> }[] = []

afterEach(async () => {
  for (const fake of fakeProviders.splice(0)) await fake.close()
  for (const db of openDbs.splice(0)) await db.dispose()
})

/** Duplicated from `mcp.ts`/`channels.ts` rather than shared — see their own doc comments on why. */
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

/** Mirrors `cogenta channels`' own construction (`commands/channels.ts`) — a second, independent entry point onto the same site, minus the live bot adapters this test does not need. */
async function buildTestRuntime(root: string) {
  const loaded = await loadConfig({
    cwd: root,
    env: {
      ...process.env,
      COGENTA_AUTH_SIGNING_KEY: 'test-signing-key-not-a-real-secret-0123456789',
    },
  })
  const collections = (await loadSchemaModule(root)).collections
  const selection = await createDatabaseRegistry({
    logger: createLogger({ level: 'silent' }),
  }).select(loaded.config.database)
  const db = selection.instance
  await createSchemaTables(db, collections, [])

  const permissions = createPermissionLayer({ collections })
  const storeFor = storeForFactory(db, collections)
  const contentService = createContentService({ collections, permissions, storeFor })
  const mediaStore = createDatabaseMediaStore({ db })
  const auditLog = createAuditLog(db)
  const approvalQueue = createMemoryApprovalQueue()
  const notFoundLog = createNotFoundLogStore({ db })
  await notFoundLog.ensureTable()
  const redirects = createRedirectStore({ db })
  await redirects.ensureTable()

  const agentsRuntime = await buildAgentRuntime({
    dataDir: join(root, '.cogenta', 'agents-runtime'),
    projectRoot: root,
    signingKey: loaded.config.auth.signingKey as string,
    site: {
      name: loaded.config.site.name,
      url: loaded.config.site.url,
      locales: loaded.config.site.locales,
      defaultLocale: loaded.config.site.defaultLocale,
    },
    contentService,
    mediaStore,
    auditLog,
    logger: createLogger({ level: 'silent' }),
    approvalQueue,
    collections,
    notFoundLog,
    redirects,
  })

  const menuCollection = collections.find((collection) => collection.name === 'menu')
  if (menuCollection === undefined) throw new Error('menu collection missing from test schema')
  const menuStore = storeFor(menuCollection)

  return {
    agentsRuntime,
    approvalQueue,
    contentService,
    menuStore,
    dispose: () => selection.dispose(),
  }
}

describe('L22 task 2 — chat bridge routes an authorized channel message to a real agent run', () => {
  it('SECURITY: a linked user without the admin role never reaches the agent runner', async () => {
    const root = await project()
    const runtime = await buildTestRuntime(root)
    openDbs.push({ dispose: runtime.dispose })

    let runnerCalled = false
    const router = createCommandRouter({
      getUserRoles: async () => ['viewer'],
      chat: createAgentChatBridge({
        runner: {
          run: async (name, instruction, trigger) => {
            runnerCalled = true
            return runtime.agentsRuntime.agentRunner.run(name, instruction, trigger)
          },
        },
        agents: { has: () => true },
        defaultAgentName: 'Cogenta Agent',
        getUserRoles: async () => ['viewer'],
        channelName: 'telegram',
        reply: async () => undefined,
      }),
    })

    const result = await router.route('add a Margherita pizza to the menu', {
      channelName: 'telegram',
      channelUserId: 'chan-1',
      linkedUserId: 'user-1',
    })

    expect(result.kind).toBe('forbidden')
    expect(runnerCalled).toBe(false)
  })

  it('creates a real draft menu entry through content.write_draft, from a simulated inbound chat message', async () => {
    const root = await project()
    const runtime = await buildTestRuntime(root)
    openDbs.push({ dispose: runtime.dispose })

    const fake = await startFakeAnthropic([
      {
        content: [
          {
            type: 'tool_use',
            id: 'call-1',
            name: 'content.write_draft',
            input: {
              collection: 'menu',
              values: {
                title: 'Margherita Pizza',
                description: 'Tomato, mozzarella, basil.',
              },
            },
          },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
      {
        content: [{ type: 'text', text: 'Added Margherita Pizza to the menu.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    ])
    fakeProviders.push(fake)

    await runtime.agentsRuntime.providerRegistry.upsert({
      provider: 'anthropic',
      apiKey: 'sk-ant-test-key',
      model: 'claude-test',
      baseUrl: fake.url,
    })

    // Concurrently with the run below: wait for the pending approval
    // `content.write_draft` always produces (R6, see the module doc
    // comment), verify it names the right tool, and approve it — the same
    // thing a human clicking "approve" in a future admin screen, or typing
    // `/approve <id>` in a channel, would do.
    const decided = (async () => {
      for (let attempt = 0; attempt < 100; attempt++) {
        const pending = await runtime.approvalQueue.list('pending')
        const request = pending.find((entry) => entry.toolName === 'content.write_draft')
        if (request !== undefined) {
          return runtime.approvalQueue.decide(request.id, 'approved', 'user-1')
        }
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      throw new Error('no pending content.write_draft approval appeared in time')
    })()

    const replies: string[] = []
    const router = createCommandRouter({
      getUserRoles: async () => ['admin'],
      chat: createAgentChatBridge({
        runner: {
          run: (name, instruction, trigger) =>
            runtime.agentsRuntime.agentRunner.run(name, instruction, trigger),
        },
        agents: { has: (name) => name === 'Cogenta Agent' },
        defaultAgentName: 'Cogenta Agent',
        getUserRoles: async () => ['admin'],
        channelName: 'telegram',
        reply: async (_identity, message) => {
          if (message.level === 'notification') replies.push(message.text)
        },
      }),
    })

    // The identity is already linked (L6's own protocol is proven elsewhere,
    // see the module doc comment) — the message a real Telegram inbound
    // handler would have handed to `router.route()` after resolving it.
    const [result, approvalDecision] = await Promise.all([
      router.route('add a Margherita pizza to the menu, tomato mozzarella basil', {
        channelName: 'telegram',
        channelUserId: 'chan-1',
        linkedUserId: 'user-1',
      }),
      decided,
    ])

    expect(approvalDecision.status).toBe('approved')
    expect(result.kind).toBe('handled')
    expect(fake.requests).toHaveLength(2)
    expect(replies).toHaveLength(1)
    expect(replies[0]).toContain('Margherita Pizza')

    // The proof: a real draft entry now exists in the menu collection,
    // created by the tool the model actually called and a human actually
    // approved — not a fabricated action outside the contract-C registry.
    const list = await runtime.menuStore.list({ state: 'working' })
    expect(list.items.some((entry) => entry.values.title === 'Margherita Pizza')).toBe(true)
  })
})
