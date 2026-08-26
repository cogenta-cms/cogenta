import { mkdtemp, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * L18, end to end over HTTP against a real `cogenta serve` on a real SQLite
 * database — with **no AI provider configured**, which is the case that has to
 * hold on every install by default.
 *
 * The whole acceptance criterion of the lot is here: the CMS keeps working, the
 * assistant route exists and answers honestly, and nothing anywhere throws
 * because the site made the R2 choice.
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
  const root = await mkdtemp(join(tmpdir(), 'cogenta-assistant-e2e-'))
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

const activeServers: AbortController[] = []

afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

describe('cogenta serve — /api/assistant with no AI provider configured (R2)', () => {
  it('answers 200 and offers exactly the one tool that needs no AI at all', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
    const token = await loginWithMfaSetup(
      server.base,
      'editor@example.com',
      'correct horse battery staple',
    )

    const response = await fetch(`${server.base}/api/assistant`, {
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      data: { available: boolean; tools: { tool: string }[]; reason?: string }
    }
    // Duplicate detection runs on the local hashing embedder and the file
    // vector store — no key, no service, no vendor. Everything that *does* need
    // a model is absent, and this list is how the admin knows which is which.
    expect(body.data.tools.map((tool) => tool.tool)).toEqual(['assist.find_duplicates'])
    expect(body.data.available).toBe(true)
  })

  it('does not offer a single tool that would need a model', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
    const token = await loginWithMfaSetup(
      server.base,
      'editor@example.com',
      'correct horse battery staple',
    )

    const response = await fetch(`${server.base}/api/assistant`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const names = (
      (await response.json()) as { data: { tools: { tool: string }[] } }
    ).data.tools.map((tool) => tool.tool)

    for (const needsAModel of [
      'assist.rewrite',
      'assist.proofread',
      'assist.summarise',
      'assist.translate',
      'assist.meta_description',
      'assist.chat',
      'assist.moderate',
      'assist.faq_draft',
      'assist.generate_image',
    ]) {
      expect(names).not.toContain(needsAModel)
    }
  })

  it('refuses a tool this site does not have, with a code a client can branch on', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
    const token = await loginWithMfaSetup(
      server.base,
      'editor@example.com',
      'correct horse battery staple',
    )

    const response = await fetch(`${server.base}/api/assistant/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ tool: 'assist.rewrite', input: { text: 'hello' } }),
    })

    expect(response.status).toBe(404)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('TOOL_UNKNOWN')
  })

  it('finds a near-duplicate of a published entry, with no AI provider anywhere', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
    const token = await loginWithMfaSetup(
      server.base,
      'editor@example.com',
      'correct horse battery staple',
    )

    const created = await fetch(`${server.base}/api/content/page`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        values: { title: 'The cathedral was rebuilt in 1904', slug: 'cathedral-1904' },
      }),
    })
    const id = ((await created.json()) as { data: { id: string } }).data.id
    await fetch(`${server.base}/api/content/page/${id}/publish`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    })

    const response = await fetch(`${server.base}/api/assistant/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        tool: 'assist.find_duplicates',
        input: {
          text: 'The cathedral was rebuilt in 1904',
          siteId: 'https://example.com',
          locale: 'en',
          collections: ['page'],
        },
      }),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      data: {
        duplicates: { entryId: string }[]
        recommendedAction: string
        applied: boolean
      }
    }
    // The publish itself put the entry in the vector index — nothing seeded it.
    expect(body.data.duplicates.map((entry) => entry.entryId)).toEqual([id])
    // The strongest thing this whole lot may ever say about a duplicate.
    expect(body.data.recommendedAction).toBe('review')
    expect(body.data.applied).toBe(false)
  })

  it('never answers an anonymous caller', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })

    const response = await fetch(`${server.base}/api/assistant`)

    expect(response.status).toBe(401)
  })

  it('leaves the rest of the CMS working exactly as before', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
    const token = await loginWithMfaSetup(
      server.base,
      'editor@example.com',
      'correct horse battery staple',
    )

    // Content is created, published, rendered and found — the whole loop, on a
    // site with no AI configured at all.
    const created = await fetch(`${server.base}/api/content/page`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ values: { title: 'Cathedral windows', slug: 'cathedral-windows' } }),
    })
    expect(created.status).toBe(201)
    const id = ((await created.json()) as { data: { id: string } }).data.id

    const published = await fetch(`${server.base}/api/content/page/${id}/publish`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(published.status).toBe(200)

    const page = await fetch(`${server.base}/cathedral-windows`)
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('Cathedral windows')

    const found = await fetch(`${server.base}/api/search?q=cathedral`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(found.status).toBe(200)
    expect(((await found.json()) as { data: unknown[] }).data.length).toBeGreaterThan(0)
  })
})

describe('cogenta serve — vector index visibility (fiche 30 task 6)', () => {
  it('reports the driver, dimensions and a growing count with no AI provider at all', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
    const token = await loginWithMfaSetup(
      server.base,
      'editor@example.com',
      'correct horse battery staple',
    )

    const before = await fetch(`${server.base}/api/assistant`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const beforeBody = (await before.json()) as {
      data: {
        vector?: { driver: string; dimensions: number; count: number; lastIndexedAt: string | null }
        usage?: unknown
        model?: unknown
      }
    }
    expect(beforeBody.data.vector).toMatchObject({ count: 0, lastIndexedAt: null })
    expect(beforeBody.data.vector?.driver).toBeTruthy()
    expect(beforeBody.data.vector?.dimensions).toBeGreaterThan(0)
    // No usage tracker exists without a text provider — nothing to meter (R2).
    expect(beforeBody.data.usage).toBeUndefined()
    expect(beforeBody.data.model).toBeUndefined()

    const created = await fetch(`${server.base}/api/content/page`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ values: { title: 'Rose window', slug: 'rose-window' } }),
    })
    const id = ((await created.json()) as { data: { id: string } }).data.id
    await fetch(`${server.base}/api/content/page/${id}/publish`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    })

    const after = await fetch(`${server.base}/api/assistant`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const afterBody = (await after.json()) as {
      data: { vector?: { count: number; lastIndexedAt: string | null } }
    }
    expect(afterBody.data.vector?.count).toBe(1)
    expect(afterBody.data.vector?.lastIndexedAt).not.toBeNull()
  })
})

interface VectorCapabilities {
  readonly data: {
    readonly vector?: {
      readonly count: number
      readonly referenceCollection: string
      readonly collections: readonly {
        readonly name: string
        readonly enabled: boolean
        readonly count: number
      }[]
    }
  }
}

async function assistantCapabilities(base: string, token: string): Promise<VectorCapabilities> {
  const response = await fetch(`${base}/api/assistant`, {
    headers: { authorization: `Bearer ${token}` },
  })
  return (await response.json()) as VectorCapabilities
}

describe('cogenta serve — per-collection index composition (L22 task 4)', () => {
  it('lists every collection as included by default, with its own chunk count', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
    const token = await loginWithMfaSetup(
      server.base,
      'editor@example.com',
      'correct horse battery staple',
    )

    const before = await assistantCapabilities(server.base, token)
    expect(before.data.vector?.collections).toEqual([{ name: 'page', enabled: true, count: 0 }])
    expect(before.data.vector?.referenceCollection).toBe('_reference_documents')

    const created = await fetch(`${server.base}/api/content/page`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ values: { title: 'Nave', slug: 'nave' } }),
    })
    const id = ((await created.json()) as { data: { id: string } }).data.id
    await fetch(`${server.base}/api/content/page/${id}/publish`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    })

    const after = await assistantCapabilities(server.base, token)
    expect(after.data.vector?.collections).toEqual([{ name: 'page', enabled: true, count: 1 }])
  })

  it('excludes a collection once toggled off, and the change applies on the very next save with no restart', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin', 'editor'])
    const token = await loginWithMfaSetup(
      server.base,
      'admin@example.com',
      'correct horse battery staple',
    )

    const created = await fetch(`${server.base}/api/content/page`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ values: { title: 'Crypt', slug: 'crypt' } }),
    })
    const id = ((await created.json()) as { data: { id: string } }).data.id
    await fetch(`${server.base}/api/content/page/${id}/publish`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    })

    const indexed = await assistantCapabilities(server.base, token)
    expect(indexed.data.vector?.collections).toEqual([{ name: 'page', enabled: true, count: 1 }])

    // Turn the collection off — same generic site-settings route every other
    // editorial setting uses, no bespoke endpoint.
    const toggled = await fetch(`${server.base}/api/settings`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ key: 'assistant.indexedCollections', value: { page: false } }),
    })
    expect(toggled.status).toBe(200)

    const stillThere = await assistantCapabilities(server.base, token)
    expect(stillThere.data.vector?.collections).toEqual([
      { name: 'page', enabled: false, count: 1 },
    ])

    // A save after the toggle removes the entry from the index — read live,
    // no restart, exactly what the toggle promises.
    await fetch(`${server.base}/api/content/page/${id}/publish`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    })

    const removed = await assistantCapabilities(server.base, token)
    expect(removed.data.vector?.collections).toEqual([{ name: 'page', enabled: false, count: 0 }])
  })

  it('refuses the toggle to an editor who is not an admin', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
    const token = await loginWithMfaSetup(
      server.base,
      'editor@example.com',
      'correct horse battery staple',
    )

    const response = await fetch(`${server.base}/api/settings`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ key: 'assistant.indexedCollections', value: { page: false } }),
    })
    expect(response.status).toBe(403)
  })
})

interface ReferenceDocumentBody {
  readonly data: {
    readonly id: string
    readonly filename: string
    readonly status: 'pending' | 'indexed' | 'error'
    readonly chunkCount: number
    readonly errorMessage: string | null
  }
}

describe('cogenta serve — reference document upload flow (L22 task 4)', () => {
  it('extracts, chunks, embeds and indexes an uploaded document, with no AI provider at all', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin', 'editor'])
    const token = await loginWithMfaSetup(
      server.base,
      'admin@example.com',
      'correct horse battery staple',
    )

    const text =
      'Returns are accepted within thirty days of purchase.\n\n' +
      'A refund is issued to the original payment method within five business days.'
    const contentBase64 = Buffer.from(text, 'utf8').toString('base64')

    const uploaded = await fetch(`${server.base}/api/assistant/documents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ filename: 'returns-policy.txt', contentBase64 }),
    })
    expect(uploaded.status).toBe(201)
    const body = (await uploaded.json()) as ReferenceDocumentBody
    expect(body.data.status).toBe('indexed')
    expect(body.data.chunkCount).toBeGreaterThan(0)
    expect(body.data.errorMessage).toBeNull()

    const listed = await fetch(`${server.base}/api/assistant/documents`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const listedBody = (await listed.json()) as { data: readonly ReferenceDocumentBody['data'][] }
    expect(listedBody.data.map((doc) => doc.id)).toEqual([body.data.id])

    // Visible in the reference pseudo-collection's chunk count too.
    const capabilities = await assistantCapabilities(server.base, token)
    expect(capabilities.data.vector?.count).toBeGreaterThanOrEqual(body.data.chunkCount)

    const removed = await fetch(`${server.base}/api/assistant/documents/${body.data.id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(removed.status).toBe(200)

    const listedAfter = await fetch(`${server.base}/api/assistant/documents`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(((await listedAfter.json()) as { data: unknown[] }).data).toEqual([])
  })

  it('refuses an unsupported document with a code a client can branch on, without wedging the upload as pending', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin', 'editor'])
    const token = await loginWithMfaSetup(
      server.base,
      'admin@example.com',
      'correct horse battery staple',
    )

    // The legacy Word 97-2003 `.doc` magic number — `extractDocumentText`
    // detects format from the bytes, not the extension, and refuses this
    // one by name rather than guessing at binary data.
    const contentBase64 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]).toString('base64')

    const uploaded = await fetch(`${server.base}/api/assistant/documents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ filename: 'legacy.doc', contentBase64 }),
    })
    expect(uploaded.status).toBe(400)
    expect(((await uploaded.json()) as { error: { code: string } }).error.code).toBe(
      'DOCUMENT_FORMAT_UNSUPPORTED',
    )

    // Nothing was recorded — a rejected extraction never reaches the store.
    const listed = await fetch(`${server.base}/api/assistant/documents`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(((await listed.json()) as { data: unknown[] }).data).toEqual([])
  })

  it('refuses document management to an editor who is not an admin', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
    const token = await loginWithMfaSetup(
      server.base,
      'editor@example.com',
      'correct horse battery staple',
    )

    const contentBase64 = Buffer.from('hello world', 'utf8').toString('base64')
    const uploaded = await fetch(`${server.base}/api/assistant/documents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ filename: 'notes.txt', contentBase64 }),
    })
    expect(uploaded.status).toBe(403)

    // Listing, on the other hand, is open to anyone who may use the
    // assistant at all — seeing what feeds it is not the same as managing it.
    const listed = await fetch(`${server.base}/api/assistant/documents`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(listed.status).toBe(200)
  })
})

describe('cogenta serve — assistant traceability on save (fiche 30 task 5)', () => {
  it('records an accepted suggestion in the audit log, distinct from an ordinary edit', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin', 'editor'])
    const token = await loginWithMfaSetup(
      server.base,
      'admin@example.com',
      'correct horse battery staple',
    )

    const created = await fetch(`${server.base}/api/content/page`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ values: { title: 'Original title', slug: 'assisted-page' } }),
    })
    const id = ((await created.json()) as { data: { id: string } }).data.id

    // An ordinary edit — no assist metadata.
    await fetch(`${server.base}/api/content/page/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ values: { title: 'A human-typed title' } }),
    })

    // A save that includes an accepted suggestion.
    await fetch(`${server.base}/api/content/page/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        values: { title: 'An assistant-suggested title' },
        provenance: 'assisted',
        provenanceDetail: { agent: 'assist.rewrite', at: new Date().toISOString() },
        assistApplied: [{ field: 'title', tool: 'assist.rewrite' }],
      }),
    })

    const entry = await fetch(`${server.base}/api/content/page/${id}?state=working`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const entryBody = (await entry.json()) as { data: { provenance: string } }
    expect(entryBody.data.provenance).toBe('assisted')

    const audit = await fetch(`${server.base}/api/audit?collection=page`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const entries = (
      (await audit.json()) as {
        data: readonly {
          readonly action: string
          readonly entryId: string | null
          readonly diff: Readonly<Record<string, unknown>> | null
        }[]
      }
    ).data

    const updates = entries.filter((row) => row.action === 'content.update' && row.entryId === id)
    expect(updates).toHaveLength(2)
    const [assisted, plain] = [...updates].sort(
      (a, b) =>
        Number('_assistApplied' in (b.diff ?? {})) - Number('_assistApplied' in (a.diff ?? {})),
    )
    expect(assisted?.diff?.['_assistApplied']).toEqual([{ field: 'title', tool: 'assist.rewrite' }])
    expect(plain?.diff?.['_assistApplied']).toBeUndefined()
  })
})

/**
 * Fiche 45 — the fiche's central promise, proven end to end rather than
 * assumed from unit tests: editing a prompt template through the real admin
 * route, against a real running `cogenta serve`, really does change what the
 * next `assist.*` call sends the model — no restart. This is the one seam
 * unit tests cannot cover, because `buildAssistant` and `buildAgentRuntime`
 * construct two *separate* `PromptTemplateStore` instances over the same
 * directory (`agent-runtime.ts`'s own comment explains why that is safe);
 * only a real server exercises both at once, in the same process, the way
 * `cogenta serve` actually runs.
 */
interface AnthropicScriptedResponse {
  readonly content: readonly { readonly type: 'text'; readonly text: string }[]
  readonly stop_reason: 'end_turn'
  readonly usage: { readonly input_tokens: number; readonly output_tokens: number }
}

interface FakeAnthropic {
  readonly url: string
  readonly requests: readonly { readonly system?: string }[]
  close(): Promise<void>
}

/** A minimal, real HTTP server answering Anthropic's Messages API shape — same technique `serve-agents.test.ts` uses. */
async function startFakeAnthropic(
  responses: readonly AnthropicScriptedResponse[],
): Promise<FakeAnthropic> {
  let index = 0
  const requests: { readonly system?: string }[] = []
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')) as { system?: string })
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

/** Same fixture as `project()` above, plus an `llm` section pointing at a local fake vendor — what `buildAssistant`'s `textProvider()` reads from `cogenta.config.mjs`. */
async function projectWithLlm(llmBaseUrl: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-prompt-settings-e2e-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Test site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
  vector: { path: ${JSON.stringify(join(root, 'vectors'))} },
  llm: { provider: 'anthropic', model: 'claude-test', baseUrl: ${JSON.stringify(llmBaseUrl)} },
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

describe('cogenta serve — editing a prompt template changes assist.* behaviour live (fiche 45)', () => {
  const promptServers: AbortController[] = []
  const promptFakes: FakeAnthropic[] = []

  afterEach(async () => {
    for (const controller of promptServers.splice(0)) controller.abort()
    for (const fake of promptFakes.splice(0)) await fake.close()
  })

  it('a PATCH to /api/prompt-templates/rewrite changes the instruction the next assist.rewrite call sends, no restart', async () => {
    const fake = await startFakeAnthropic([
      {
        content: [{ type: 'text', text: 'A rewritten sentence.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    ])
    promptFakes.push(fake)

    const root = await projectWithLlm(fake.url)
    // COGENTA_LLM_API_KEY is the only piece `textProvider()` needs beyond
    // the config file (`packages/core/src/config/env.ts`'s `llm.apiKey`
    // mapping) — set here rather than on the real `process.env`, which
    // would leak between test files sharing a worker.
    const server = await startServer(root, {
      registry: promptServers,
      env: { COGENTA_LLM_API_KEY: 'sk-ant-test-key-3' },
    })
    // `admin` alone is not enough to call `/api/assistant/run`: the
    // assistant's own gate (`assertMayUseAssistant`) checks `update` on a
    // real collection via `PermissionLayer`, which does not treat `admin`
    // as an implicit bypass — the same reason every other test in this file
    // that both manages a setting and calls the assistant carries both
    // roles.
    await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin', 'editor'])
    const token = await loginWithMfaSetup(
      server.base,
      'admin@example.com',
      'correct horse battery staple',
    )

    // The builtin "Rewrite" template really is there under the id the
    // migrated tool resolves by (`seeds.ts`: `slugify('Rewrite')`).
    const before = await fetch(`${server.base}/api/prompt-templates/rewrite`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(before.status).toBe(200)
    const beforeBody = (await before.json()) as { data: { template: string; builtin: boolean } }
    expect(beforeBody.data.builtin).toBe(true)
    expect(beforeBody.data.template).toContain('Rewrite the passage in the DATA block.')

    const EDITED_MARKER = 'REWRITE-EDITED-BY-ADMIN'
    const edited = await fetch(`${server.base}/api/prompt-templates/rewrite`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        template: `${EDITED_MARKER} {{goalLine}} {{localeLine}}`,
      }),
    })
    expect(edited.status).toBe(200)

    const run = await fetch(`${server.base}/api/assistant/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ tool: 'assist.rewrite', input: { text: 'a sentence to rewrite' } }),
    })
    expect(run.status).toBe(200)
    const runBody = (await run.json()) as { data: { suggestions: readonly string[] } }
    expect(runBody.data.suggestions).toEqual(['A rewritten sentence.'])

    // The proof: the real request the fake vendor received — built by
    // `buildAssistant`'s own `PromptTemplateStore` instance, over the same
    // on-disk directory `agent-runtime.ts`'s admin-facing instance just
    // wrote to — carries the edited text, not the original hard-coded one.
    expect(fake.requests).toHaveLength(1)
    const system = fake.requests[0]?.system ?? ''
    expect(system).toContain(EDITED_MARKER)
    expect(system).not.toContain('Rewrite the passage in the DATA block.')
  })
})
