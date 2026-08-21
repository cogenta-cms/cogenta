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
  it('lists the three seeded built-ins, the superagent enabled, the two examples disabled', async () => {
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
    expect(body.data).toHaveLength(3)
    const byName = new Map(body.data.map((a) => [a.name, a]))
    expect(byName.get('Cogenta Agent')).toMatchObject({ enabled: true, builtin: true })
    expect(byName.get('Security Scanner')).toMatchObject({ enabled: false, builtin: true })
    expect(byName.get('Content Watch')).toMatchObject({ enabled: false, builtin: true })
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
