import { mkdtemp, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * L22 task 3, end to end over HTTP against a real `cogenta serve` on a real
 * SQLite database — the lot's own one concrete case: "une page 404 dont les
 * journaux montrent des visites répétées reçoit une suggestion de
 * redirection vers une page choisie par l'agent, appliquée seulement en
 * autonomie `autopilot`, sinon proposée à l'admin pour confirmation
 * (réutilise l'écran Redirections déjà construit)".
 *
 * Nothing here is mocked beyond the LLM vendor endpoint (the same technique
 * `serve-agents.test.ts` uses): a real public 404 writes the real 404 log, a
 * real page is really published, the real tool-calling loop runs, and the
 * real `RedirectStore`/`ApprovalQueue`/notices machinery decides what
 * happens next.
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
  const root = await mkdtemp(join(tmpdir(), 'cogenta-monitoring-agent-e2e-'))
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
  /** The raw JSON body of every request received, in order — used to check what a tool actually reported back to the model, not only the run's end state. */
  readonly requests: unknown[]
  close(): Promise<void>
}

/** A minimal, real HTTP server answering Anthropic's Messages API shape — one scripted response per call, in order. Mirrors `serve-agents.test.ts`'s own helper. */
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

/** The four tool calls the Site Monitor's identity asks for, then a final report. */
function monitoringScript(): readonly AnthropicScriptedResponse[] {
  const usage = { input_tokens: 10, output_tokens: 5 }
  return [
    {
      content: [{ type: 'tool_use', id: 'call-1', name: 'logs.read_not_found', input: {} }],
      stop_reason: 'tool_use',
      usage,
    },
    {
      content: [{ type: 'tool_use', id: 'call-2', name: 'content.collections', input: {} }],
      stop_reason: 'tool_use',
      usage,
    },
    {
      content: [
        {
          type: 'tool_use',
          id: 'call-3',
          name: 'content.list',
          input: { collection: 'page' },
        },
      ],
      stop_reason: 'tool_use',
      usage,
    },
    {
      content: [
        {
          type: 'tool_use',
          id: 'call-4',
          name: 'redirects.create',
          input: { from: '/old-guide', to: '/new-guide' },
        },
      ],
      stop_reason: 'tool_use',
      usage,
    },
    {
      content: [
        {
          type: 'text',
          text: '"/old-guide" gets repeated 404s. I suggest redirecting it to "/new-guide".',
        },
      ],
      stop_reason: 'end_turn',
      usage,
    },
  ]
}

const activeServers: AbortController[] = []
const fakeProviders: FakeAnthropic[] = []

afterEach(async () => {
  for (const controller of activeServers.splice(0)) controller.abort()
  for (const fake of fakeProviders.splice(0)) await fake.close()
})

async function setUpSiteWithABrokenLink(): Promise<{
  readonly root: string
  readonly base: string
  readonly adminToken: string
}> {
  const root = await project()
  const server = await startServer(root, { registry: activeServers })

  // A real page to redirect to.
  await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
  const editorToken = await loginWithMfaSetup(
    server.base,
    'editor@example.com',
    'correct horse battery staple',
  )
  const created = await fetch(`${server.base}/api/content/page`, {
    method: 'POST',
    headers: { authorization: `Bearer ${editorToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ values: { title: 'New Guide', slug: 'new-guide' } }),
  })
  expect(created.status).toBe(201)
  const { data } = (await created.json()) as { data: { id: string } }
  const published = await fetch(`${server.base}/api/content/page/${data.id}/publish`, {
    method: 'POST',
    headers: { authorization: `Bearer ${editorToken}` },
  })
  expect(published.status).toBe(200)

  // Real, repeated 404s against a path nothing serves — the same public GET
  // path a browser would hit, writing the real 404 log as a side effect.
  // Each response body is drained so the server can close cleanly.
  for (let i = 0; i < 3; i += 1) {
    const miss = await fetch(`${server.base}/old-guide`)
    await miss.arrayBuffer()
  }

  await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
  const adminToken = await loginWithMfaSetup(
    server.base,
    'admin@example.com',
    'correct horse battery staple',
  )

  const notFound = await fetch(`${server.base}/api/not-found`, {
    headers: { authorization: `Bearer ${adminToken}` },
  })
  const notFoundBody = (await notFound.json()) as { data: readonly { path: string }[] }
  expect(notFoundBody.data.some((entry) => entry.path === '/old-guide')).toBe(true)

  const enabled = await fetch(
    `${server.base}/api/agents/${encodeURIComponent('Site Monitor')}/enable`,
    { method: 'POST', headers: { authorization: `Bearer ${adminToken}` } },
  )
  expect(enabled.status).toBe(200)

  return { root, base: server.base, adminToken }
}

async function configureProvider(
  base: string,
  adminToken: string,
  apiKey: string,
): Promise<FakeAnthropic> {
  const fake = await startFakeAnthropic(monitoringScript())
  fakeProviders.push(fake)
  const configured = await fetch(`${base}/api/providers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      provider: 'anthropic',
      apiKey,
      model: 'claude-test',
      baseUrl: fake.url,
    }),
  })
  expect(configured.status).toBe(201)
  return fake
}

describe('cogenta serve — the Site Monitor agent (L22 task 3)', () => {
  it('under co-pilot (its default): proposes the redirect, never creates it, and it shows up as a notice pointing at the Redirections screen', async () => {
    const { base, adminToken } = await setUpSiteWithABrokenLink()
    const fake = await configureProvider(base, adminToken, 'sk-ant-test-copilot')

    const run = await fetch(`${base}/api/agents/${encodeURIComponent('Site Monitor')}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ instruction: 'Check the 404 log for anything worth fixing.' }),
    })
    expect(run.status).toBe(200)
    const runBody = (await run.json()) as { data: { stopReason: string } }
    expect(runBody.data.stopReason).toBe('end_turn')

    // `content.list`'s answer, sent back to the model in the next request,
    // really carries the published page's public path — computed by
    // `agent-runtime.ts`'s `contentBrowseServiceLikeOf` from the real
    // collection route and the real saved slug, not a stub.
    expect(JSON.stringify(fake.requests.at(-2))).toContain('/new-guide')

    // Nothing was written: co-pilot only ever proposes.
    const redirects = await fetch(`${base}/api/redirects`, {
      headers: { authorization: `Bearer ${adminToken}` },
    })
    const redirectsBody = (await redirects.json()) as { data: readonly unknown[] }
    expect(redirectsBody.data).toEqual([])

    // The suggestion surfaces on the admin's notice board, pointing at the
    // existing Redirections screen — never a second confirmation UI.
    const notices = await fetch(`${base}/api/notices`, {
      headers: { authorization: `Bearer ${adminToken}` },
    })
    const noticesBody = (await notices.json()) as {
      data: readonly {
        code: string
        params?: Record<string, string>
        action?: { href: string }
      }[]
    }
    const suggestion = noticesBody.data.find(
      (notice) => notice.code === 'monitoring.redirect-suggestion',
    )
    expect(suggestion).toBeDefined()
    expect(suggestion?.params).toEqual({
      from: '/old-guide',
      to: '/new-guide',
      agent: 'Site Monitor',
    })
    expect(suggestion?.action?.href).toBe('/seo?tab=redirects')

    // The audit trail says "proposed", never "executed".
    const history = await fetch(
      `${base}/api/agents/${encodeURIComponent('Site Monitor')}/history`,
      { headers: { authorization: `Bearer ${adminToken}` } },
    )
    const historyBody = (await history.json()) as {
      data: readonly { action: string; diff?: Record<string, unknown> }[]
    }
    const redirectCall = historyBody.data.find(
      (entry) => entry.action === 'agent.tool.redirects.create',
    )
    expect(redirectCall).toBeDefined()
  })

  it('under autopilot: creates the redirect for real, and the notice disappears once it exists', async () => {
    const { base, adminToken } = await setUpSiteWithABrokenLink()

    const raised = await fetch(`${base}/api/agents/${encodeURIComponent('Site Monitor')}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ autonomy: { default: 'autonomous' } }),
    })
    expect(raised.status).toBe(200)

    await configureProvider(base, adminToken, 'sk-ant-test-autopilot')

    const run = await fetch(`${base}/api/agents/${encodeURIComponent('Site Monitor')}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ instruction: 'Check the 404 log for anything worth fixing.' }),
    })
    expect(run.status).toBe(200)

    // The redirect is really there — reason "agent", so an admin can tell it
    // apart from one they typed themselves.
    const redirects = await fetch(`${base}/api/redirects`, {
      headers: { authorization: `Bearer ${adminToken}` },
    })
    const redirectsBody = (await redirects.json()) as {
      data: readonly { from: string; to: string; reason: string }[]
    }
    expect(redirectsBody.data).toContainEqual(
      expect.objectContaining({ from: '/old-guide', to: '/new-guide', reason: 'agent' }),
    )

    // A visitor hitting the dead link is really redirected now.
    const visit = await fetch(`${base}/old-guide`, { redirect: 'manual' })
    expect(visit.status).toBe(301)
    expect(visit.headers.get('location')).toBe('/new-guide')
    await visit.arrayBuffer()

    // The notice source resolves itself: the condition it was about is fixed.
    const notices = await fetch(`${base}/api/notices`, {
      headers: { authorization: `Bearer ${adminToken}` },
    })
    const noticesBody = (await notices.json()) as { data: readonly { code: string }[] }
    expect(
      noticesBody.data.some((notice) => notice.code === 'monitoring.redirect-suggestion'),
    ).toBe(false)
  })
})
