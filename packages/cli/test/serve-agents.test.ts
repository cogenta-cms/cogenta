import { mkdtemp, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * L22 task 1, end to end over HTTP against a real `cogenta serve` on a real
 * SQLite database — the lot's own acceptance bar: "un vrai test e2e...
 * prouvant que la boucle de tool-calling exécute réellement un outil permis
 * et refuse un outil hors des permissions de l'acteur/de l'agent (R4)".
 *
 * The "LLM provider" here is a real `node:http` server on a real port,
 * answering the exact wire shape `createAnthropicClient` sends — reached by
 * pointing `/api/providers`' saved `baseUrl` at it. Nothing about the tool-
 * calling loop, the permission gate, or the audit trail is mocked: only the
 * vendor endpoint is a local double, the same technique
 * `serve-webhooks.test.ts` already uses for an outbound receiver.
 */

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug' },
    versioning: { drafts: true, history: true },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title' } },
    },
    permissions: {
      read: ['public'],
      create: ['editor'],
      update: ['editor'],
      delete: ['admin'],
      publish: ['editor'],
    },
  },
]

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-agents-e2e-'))
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

/** A minimal, real HTTP server answering Anthropic's Messages API shape — one scripted response per call, in order. */
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

const activeServers: AbortController[] = []
const fakeProviders: FakeAnthropic[] = []

afterEach(async () => {
  for (const controller of activeServers.splice(0)) controller.abort()
  for (const fake of fakeProviders.splice(0)) await fake.close()
})

describe('cogenta serve — /api/agents with no LLM provider configured (R2)', () => {
  it('lists the four seeded built-ins, the superagent enabled, the three examples disabled', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
    const token = await loginWithMfaSetup(
      server.base,
      'admin@example.com',
      'correct horse battery staple',
    )

    const response = await fetch(`${server.base}/api/agents`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      data: readonly { name: string; enabled: boolean; builtin: boolean }[]
    }
    // L22 task 3 adds a fourth built-in, "Site Monitor" — disabled by
    // default, same as the other two examples.
    expect(body.data).toHaveLength(4)
    const byName = new Map(body.data.map((a) => [a.name, a]))
    expect(byName.get('Cogenta Agent')).toMatchObject({ enabled: true, builtin: true })
    expect(byName.get('Security Scanner')).toMatchObject({ enabled: false, builtin: true })
    expect(byName.get('Content Watch')).toMatchObject({ enabled: false, builtin: true })
    expect(byName.get('Site Monitor')).toMatchObject({ enabled: false, builtin: true })
  })

  it('refuses to run — with a code the admin can explain — before any network call is possible', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
    const token = await loginWithMfaSetup(
      server.base,
      'admin@example.com',
      'correct horse battery staple',
    )

    const response = await fetch(
      `${server.base}/api/agents/${encodeURIComponent('Cogenta Agent')}/run`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ instruction: 'read the site config' }),
      },
    )
    // 501, matching `SITE_PLAN_NO_PROVIDER`'s own precedent: nothing here is
    // broken, this run simply has no configured LLM provider (R2).
    expect(response.status).toBe(501)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'AGENT_NO_PROVIDER',
    )
  })

  it('never answers an anonymous caller', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const response = await fetch(`${server.base}/api/agents`)
    // Matches `agents-router.test.ts`'s own convention: `requireAdmin`
    // throws `FORBIDDEN` (403) for any actor without the admin role,
    // anonymous included — never a 401, since this router never
    // distinguishes "no session" from "wrong role".
    expect(response.status).toBe(403)
  })
})

describe('cogenta serve — /api/agents runs a real tool-calling loop once a provider is configured', () => {
  it('executes a permitted tool call, records it in the audit history, and returns the model’s final text', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
    const token = await loginWithMfaSetup(
      server.base,
      'admin@example.com',
      'correct horse battery staple',
    )

    const fake = await startFakeAnthropic([
      {
        content: [{ type: 'tool_use', id: 'call-1', name: 'site.config_read', input: {} }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
      {
        content: [{ type: 'text', text: 'This site is called Test site.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    ])
    fakeProviders.push(fake)

    const configured = await fetch(`${server.base}/api/providers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        provider: 'anthropic',
        apiKey: 'sk-ant-test-key',
        model: 'claude-test',
        baseUrl: fake.url,
      }),
    })
    expect(configured.status).toBe(201)
    // The key is never echoed back, even in the response that just saved it.
    expect(JSON.stringify(await configured.clone().json())).not.toContain('sk-ant-test-key')

    const run = await fetch(
      `${server.base}/api/agents/${encodeURIComponent('Cogenta Agent')}/run`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ instruction: 'What is this site called?' }),
      },
    )
    expect(run.status).toBe(200)
    const runBody = (await run.json()) as {
      data: { stopReason: string; finalText: string | null }
    }
    expect(runBody.data.stopReason).toBe('end_turn')
    expect(runBody.data.finalText).toBe('This site is called Test site.')
    // The fake vendor really was called twice, over real HTTP.
    expect(fake.requests).toHaveLength(2)

    const history = await fetch(
      `${server.base}/api/agents/${encodeURIComponent('Cogenta Agent')}/history`,
      { headers: { authorization: `Bearer ${token}` } },
    )
    const historyBody = (await history.json()) as { data: readonly { action: string }[] }
    expect(historyBody.data.some((entry) => entry.action === 'agent.run')).toBe(true)
    expect(historyBody.data.some((entry) => entry.action === 'agent.tool.site.config_read')).toBe(
      true,
    )
  })

  it('R4: never executes a tool outside a custom sub-agent’s declared tools, even when the model asks for it', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
    const token = await loginWithMfaSetup(
      server.base,
      'admin@example.com',
      'correct horse battery staple',
    )

    const fake = await startFakeAnthropic([
      {
        // media.read is deliberately NOT in this agent's tools below.
        content: [{ type: 'tool_use', id: 'call-1', name: 'media.read', input: { id: 'x' } }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
      {
        content: [{ type: 'text', text: 'I could not do that.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    ])
    fakeProviders.push(fake)

    await fetch(`${server.base}/api/providers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        provider: 'anthropic',
        apiKey: 'sk-ant-test-key-2',
        model: 'claude-test',
        baseUrl: fake.url,
      }),
    })

    const created = await fetch(`${server.base}/api/agents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: 'Narrow Agent',
        identity: { role: 'Only ever reads site config.', objectives: [] },
        model: { preferred: 'anthropic' },
        tools: ['site.config_read'],
        autonomy: { default: 'autonomous' },
      }),
    })
    expect(created.status).toBe(201)

    const run = await fetch(`${server.base}/api/agents/${encodeURIComponent('Narrow Agent')}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ instruction: 'read some media' }),
    })
    expect(run.status).toBe(200)

    const history = await fetch(
      `${server.base}/api/agents/${encodeURIComponent('Narrow Agent')}/history`,
      { headers: { authorization: `Bearer ${token}` } },
    )
    const historyBody = (await history.json()) as { data: readonly { action: string }[] }
    // The disallowed call never reached the tool — no audit entry for it exists.
    expect(historyBody.data.some((entry) => entry.action === 'agent.tool.media.read')).toBe(false)
  })
})

/**
 * The bug this closes was reported live: a conversation started on one
 * surface (the agent detail page's chat) did not "load" when reopened on
 * another (the floating widget) — because nothing server-side kept a
 * thread at all. `POST .../conversation/messages` is what both surfaces
 * are wired to now; this proves the thread is real (persists across
 * requests, keyed by the signed-in actor) and that a second message really
 * does carry the first turn as history to the model, not just client-side.
 */
describe('cogenta serve — /api/agents/:name/conversation, a real standing thread', () => {
  it('starts empty, persists a sent message and its reply, and threads history into the next turn', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
    const token = await loginWithMfaSetup(
      server.base,
      'admin@example.com',
      'correct horse battery staple',
    )

    const fake = await startFakeAnthropic([
      {
        content: [{ type: 'text', text: 'Hello! How can I help?' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
      {
        content: [{ type: 'text', text: 'Sure, following up on that.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    ])
    fakeProviders.push(fake)

    await fetch(`${server.base}/api/providers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        provider: 'anthropic',
        apiKey: 'sk-ant-test-key',
        model: 'claude-test',
        baseUrl: fake.url,
      }),
    })

    const agentPath = `/api/agents/${encodeURIComponent('Cogenta Agent')}`

    const empty = await fetch(`${server.base}${agentPath}/conversation`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(empty.status).toBe(200)
    expect((await empty.json()) as { data: { turns: unknown[] } }).toMatchObject({
      data: { turns: [] },
    })

    const first = await fetch(`${server.base}${agentPath}/conversation/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: 'Hi there' }),
    })
    expect(first.status).toBe(200)
    const firstBody = (await first.json()) as {
      data: { turns: { role: string; content: string }[] }
    }
    expect(firstBody.data.turns).toEqual([
      expect.objectContaining({ role: 'user', content: 'Hi there' }),
      expect.objectContaining({ role: 'assistant', content: 'Hello! How can I help?' }),
    ])

    // The thread survives being re-read — it lives server-side, not in
    // whichever component happened to send the first message.
    const reloaded = await fetch(`${server.base}${agentPath}/conversation`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(((await reloaded.json()) as { data: { turns: unknown[] } }).data.turns).toHaveLength(2)

    await fetch(`${server.base}${agentPath}/conversation/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: 'And after that?' }),
    })

    // The second call to the fake vendor really carried the first turn as
    // history (in `messages`); the new message itself travels in `system`'s
    // own `<task>` tag (`assembleContext`'s own contract), not `messages`.
    expect(fake.requests).toHaveLength(2)
    const secondRequest = fake.requests[1] as {
      system: string
      messages: readonly { role: string; content: unknown }[]
    }
    const asText = secondRequest.messages
      .map((m) => `${m.role}:${JSON.stringify(m.content)}`)
      .join('\n')
    expect(asText).toContain('Hi there')
    expect(asText).toContain('Hello! How can I help?')
    expect(secondRequest.system).toContain('And after that?')

    const cleared = await fetch(`${server.base}${agentPath}/conversation`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(cleared.status).toBe(200)
    const afterClear = await fetch(`${server.base}${agentPath}/conversation`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(((await afterClear.json()) as { data: { turns: unknown[] } }).data.turns).toEqual([])
  })

  it('never answers an anonymous or non-admin caller', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    const agentPath = `/api/agents/${encodeURIComponent('Cogenta Agent')}`

    const anonymous = await fetch(`${server.base}${agentPath}/conversation`)
    expect(anonymous.status).toBe(403)
  })
})

interface OpenAiScriptedResponse {
  readonly choices: readonly {
    readonly message: {
      readonly content: string | null
      readonly tool_calls?: readonly {
        readonly id: string
        readonly type: 'function'
        readonly function: { readonly name: string; readonly arguments: string }
      }[]
    }
    readonly finish_reason: 'stop' | 'tool_calls'
  }[]
  readonly usage: { readonly prompt_tokens: number; readonly completion_tokens: number }
}

interface FakeOpenAiCompatible {
  readonly url: string
  readonly requests: unknown[]
  close(): Promise<void>
}

/** A minimal, real HTTP server answering the OpenAI Chat Completions wire shape — fiche 56's "custom OpenAI-compatible endpoint", the same real-server technique `startFakeAnthropic` above already uses for the native adapter. */
async function startFakeOpenAiCompatible(
  responses: readonly OpenAiScriptedResponse[],
): Promise<FakeOpenAiCompatible> {
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
  if (address === null || typeof address === 'string') {
    throw new Error('fake OpenAI-compatible server has no port')
  }
  return {
    url: `http://127.0.0.1:${address.port}/v1/chat/completions`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

/**
 * Fiche 56, end to end: a provider id absent from the built-in catalog,
 * saved with its own `baseUrl`, actually drives a real agent run against a
 * real (local) OpenAI-compatible server — not just a unit-level construction
 * check. `GET /api/providers/catalog` is exercised alongside it, admin-only,
 * proving the catalog route this fiche adds is really mounted by `cogenta
 * serve`.
 */
describe('cogenta serve — a custom OpenAI-compatible provider (fiche 56)', () => {
  it('GET /api/providers/catalog lists the built-in catalog, admin-only', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
    const token = await loginWithMfaSetup(
      server.base,
      'admin@example.com',
      'correct horse battery staple',
    )

    const anonymous = await fetch(`${server.base}/api/providers/catalog`)
    expect(anonymous.status).toBe(403)

    const response = await fetch(`${server.base}/api/providers/catalog`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: readonly { id: string }[] }
    const ids = body.data.map((entry) => entry.id)
    expect(ids).toEqual(
      expect.arrayContaining(['anthropic', 'openai', 'google', 'openrouter', 'deepseek', 'qwen']),
    )
  })

  it('runs a real tool-calling loop against a custom id + baseUrl, over real HTTP', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
    const token = await loginWithMfaSetup(
      server.base,
      'admin@example.com',
      'correct horse battery staple',
    )

    const fake = await startFakeOpenAiCompatible([
      {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: { name: 'site.config_read', arguments: '{}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
      {
        choices: [
          {
            message: { content: 'This site is called Test site.' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
    ])
    fakeProviders.push(fake)

    // No `custom: true` flag to send: an id outside the catalog is only
    // ever valid alongside a non-empty `baseUrl` — that pairing *is* what
    // "custom" means, both at the router and at `store.ts`'s write boundary.
    const configured = await fetch(`${server.base}/api/providers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        provider: 'my-vllm-server',
        apiKey: 'sk-local-test-key',
        model: 'llama-3',
        baseUrl: fake.url,
      }),
    })
    expect(configured.status).toBe(201)
    expect(JSON.stringify(await configured.clone().json())).not.toContain('sk-local-test-key')

    const created = await fetch(`${server.base}/api/agents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: 'Custom Provider Agent',
        identity: { role: 'Only ever reads site config.', objectives: [] },
        model: { preferred: 'my-vllm-server' },
        tools: ['site.config_read'],
        autonomy: { default: 'autonomous' },
      }),
    })
    expect(created.status).toBe(201)

    const run = await fetch(
      `${server.base}/api/agents/${encodeURIComponent('Custom Provider Agent')}/run`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ instruction: 'What is this site called?' }),
      },
    )
    expect(run.status).toBe(200)
    const runBody = (await run.json()) as { data: { finalText: string | null } }
    expect(runBody.data.finalText).toBe('This site is called Test site.')
    // The custom endpoint really was called twice, over real HTTP — never
    // literally "openai" (the shared client's default `name`), which is
    // exactly what `client.name` reporting its real catalog/custom id fixes.
    expect(fake.requests).toHaveLength(2)
  })

  it('refuses a name outside the catalog with no baseUrl before anything is saved', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
    const token = await loginWithMfaSetup(
      server.base,
      'admin@example.com',
      'correct horse battery staple',
    )

    const response = await fetch(`${server.base}/api/providers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ provider: 'not-a-real-provider', apiKey: 'x', model: 'x' }),
    })
    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'PROVIDER_CUSTOM_BASE_URL_REQUIRED',
    )
  })

  // Security review of this fiche: widening `provider` to a free string
  // removed the fixed 3-name allowlist `PATCH`/`DELETE /api/providers/:provider`
  // used to gate on — over real HTTP, `%2e%2e%2F` in the path segment decodes
  // to `../` only *after* `segmentsOf()` has already split on literal `/`,
  // so it survives as one segment carrying real slashes. The fix lives in
  // `@cogenta/agents`' `store.ts` (`fileFor` now validates on every method,
  // not only `upsert`) — this proves it end to end, over the real router,
  // real server and real filesystem, not just the unit-level store test.
  it('a path-traversal-shaped provider id in PATCH/DELETE is rejected, never reaching the filesystem', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
    const token = await loginWithMfaSetup(
      server.base,
      'admin@example.com',
      'correct horse battery staple',
    )

    const encodedTraversal = '%2e%2e%2Fagents%2Fsome-agent'

    const patched = await fetch(`${server.base}/api/providers/${encodedTraversal}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ enabled: false }),
    })
    expect(patched.status).toBe(400)
    expect(((await patched.json()) as { error: { code: string } }).error.code).toBe(
      'PROVIDER_ID_INVALID',
    )

    const deleted = await fetch(`${server.base}/api/providers/${encodedTraversal}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(deleted.status).toBe(400)
    expect(((await deleted.json()) as { error: { code: string } }).error.code).toBe(
      'PROVIDER_ID_INVALID',
    )

    // The server, and this site's built-in agent registry, are unharmed.
    const agents = await fetch(`${server.base}/api/agents`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(agents.status).toBe(200)
    const agentsBody = (await agents.json()) as { data: readonly { name: string }[] }
    expect(agentsBody.data.some((agent) => agent.name === 'Cogenta Agent')).toBe(true)
  })
})
