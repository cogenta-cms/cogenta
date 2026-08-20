import { mkdtemp, writeFile } from 'node:fs/promises'
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
