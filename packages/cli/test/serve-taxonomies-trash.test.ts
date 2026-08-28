import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLogger } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { runServe } from '../src/commands/serve.js'
import { createOutput } from '../src/output.js'

/**
 * The trash and taxonomies of `schema@2.0` (ADR-0022), end to end through a
 * real `cogenta serve` — a real HTTP server, a real SQLite file, a real
 * session.
 *
 * The unit suites of `@cogenta/schema` and `@cogenta/api` prove the pieces.
 * This one proves they are actually *wired*: that a taxonomy declared in a
 * project's schema file reaches `/api/taxonomies`, that its terms classify
 * real content, and that deleting an entry over HTTP puts it somewhere it can
 * be recovered from instead of destroying it.
 */

const SIGNING_KEY = 'test-signing-key-not-a-real-secret'

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-tax-'))

  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Test site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
}
`,
    'utf8',
  )

  // A named `taxonomies` export beside the default one — the convention that
  // keeps every pre-2.0 schema file loading unchanged.
  await writeFile(
    join(root, 'cogenta.schema.mjs'),
    `export const taxonomies = [
  {
    name: 'topic',
    labels: { singular: { en: 'Topic' } },
    hierarchical: true,
    permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
  },
]

export default [
  {
    name: 'article',
    labels: { singular: 'Article', plural: 'Articles' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      topics: { kind: 'taxonomy', options: { of: 'topic', many: true } },
    },
    permissions: {
      read: ['public'],
      create: ['editor'],
      update: ['editor'],
      publish: ['editor'],
      delete: ['editor'],
    },
  },
]
`,
    'utf8',
  )

  return root
}

const activeServers: AbortController[] = []

async function startServer(root: string): Promise<{ base: string; stop: () => Promise<void> }> {
  const controller = new AbortController()
  activeServers.push(controller)

  let resolveAddress: (value: { port: number; host: string }) => void
  const address = new Promise<{ port: number; host: string }>((resolve) => {
    resolveAddress = resolve
  })

  const done = runServe({
    cwd: root,
    env: { COGENTA_AUTH_SIGNING_KEY: SIGNING_KEY },
    logger: createLogger({ level: 'silent' }),
    out: createOutput(() => undefined, false),
    stderr: () => undefined,
    port: 0,
    signal: controller.signal,
    onListening: (a) => resolveAddress(a),
  })

  const bound = await Promise.race([
    address,
    done.then((code) => {
      throw new Error(`runServe exited with code ${code} before it started listening`)
    }),
  ])

  return {
    base: `http://${bound.host}:${bound.port}`,
    stop: async () => {
      controller.abort()
      await done
    },
  }
}

afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

/**
 * Creates an account with the given roles and returns its bearer token.
 *
 * Bootstrapped straight through the auth store, the same way the other serve
 * tests do it — `cogenta users create` is a separate command with its own
 * suite, and going through it here would test that instead of this.
 */
async function signIn(root: string, base: string, roles: readonly string[]): Promise<string> {
  const { createSqliteHandle } = await import('@cogenta/core')
  const { createUserStore, createCredentialStore, ensureAuthTables } = await import('@cogenta/auth')

  const email = `${roles.join('-')}@example.com`
  const password = 'correct horse battery staple'

  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  await ensureAuthTables(db)
  const user = await createUserStore(db).create({ email, roles: [...roles] })
  await createCredentialStore(db).setPassword(user.id, password)
  await db.close()

  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = (await response.json()) as { data: { session?: { token: string } } }
  const token = body.data.session?.token
  if (token === undefined) throw new Error('expected a session')
  return token
}

describe('taxonomies and the trash, end to end', () => {
  it('serves the declared taxonomy, classifies content with it, and trashes reversibly', async () => {
    const root = await project()
    const server = await startServer(root)
    const token = await signIn(root, server.base, ['editor', 'admin'])
    const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

    // The schema document tells the admin both halves of 2.0 exist.
    const schema = (await (await fetch(`${server.base}/api/schema`)).json()) as {
      data: {
        contract: string
        taxonomies: { name: string }[]
        collections: { name: string; trash: unknown }[]
      }
    }
    expect(schema.data.contract).toBe('schema@2.0')
    expect(schema.data.taxonomies.map((entry) => entry.name)).toEqual(['topic'])
    expect(schema.data.collections[0]?.trash).toEqual({ retainDays: 30 })

    // A term, created through the real route.
    const created = await fetch(`${server.base}/api/taxonomies/topic`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ slug: 'cuisine', labels: { en: 'Cooking' } }),
    })
    expect(created.status).toBe(201)
    const term = ((await created.json()) as { data: { id: string; depth: number } }).data
    expect(term.depth).toBe(0)

    // A child of it, so the tree is real and not a single row.
    const child = await fetch(`${server.base}/api/taxonomies/topic`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ slug: 'desserts', labels: { en: 'Desserts' }, parent: term.id }),
    })
    expect(((await child.json()) as { data: { depth: number } }).data.depth).toBe(1)

    // Content classified by that term, through the ordinary content route:
    // the join table exists because `createSchemaTables` made it.
    const entry = await fetch(`${server.base}/api/content/article`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ values: { title: 'Tarte Tatin', topics: [term.id] } }),
    })
    expect(entry.status).toBe(201)
    const article = ((await entry.json()) as { data: { id: string } }).data

    const read = await fetch(`${server.base}/api/content/article/${article.id}?state=working`, {
      headers: auth,
    })
    const readBody = (await read.json()) as { data: { values: { topics: string[] } } }
    expect(readBody.data.values.topics).toEqual([term.id])

    // DELETE now means "to the trash", and the entry is still there.
    const deleted = await fetch(`${server.base}/api/content/article/${article.id}`, {
      method: 'DELETE',
      headers: auth,
    })
    expect(deleted.status).toBe(204)

    const gone = await fetch(`${server.base}/api/content/article/${article.id}?state=working`, {
      headers: auth,
    })
    expect(gone.status).toBe(404)

    const trash = await fetch(`${server.base}/api/content/article?state=working&trashed=only`, {
      headers: auth,
    })
    const trashBody = (await trash.json()) as { data: { id: string; deletedAt: string }[] }
    expect(trashBody.data.map((item) => item.id)).toEqual([article.id])
    expect(trashBody.data[0]?.deletedAt).not.toBeNull()

    // And it comes back, with its classification intact — the reason the
    // trash keeps every row rather than moving one.
    const restored = await fetch(`${server.base}/api/content/article/${article.id}/untrash`, {
      method: 'POST',
      headers: auth,
    })
    expect(restored.status).toBe(200)
    const restoredBody = (await restored.json()) as {
      data: { deletedAt: string | null; values: { topics: string[] } }
    }
    expect(restoredBody.data.deletedAt).toBeNull()
    expect(restoredBody.data.values.topics).toEqual([term.id])

    await server.stop()
  })

  it(
    'creates a term under a parent from the entry editor’s quick-create, found at the right level ' +
      'in the taxonomy tree (41-taxonomies)',
    async () => {
      const root = await project()
      const server = await startServer(root)
      const token = await signIn(root, server.base, ['editor', 'admin'])
      const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

      // "Actualités" already exists and is the category an editor has
      // selected in the entry editor's taxonomy field.
      const parentTerm = await fetch(`${server.base}/api/taxonomies/topic`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ slug: 'actualites', labels: { en: 'News' } }),
      })
      expect(parentTerm.status).toBe(201)
      const actualites = ((await parentTerm.json()) as { data: { id: string } }).data

      // The exact request `TaxonomyField`'s quick-create form now sends
      // (`packages/admin/src/fields/taxonomy-field.tsx`): a `parent` that is
      // whichever term is currently selected in the field, not omitted as
      // it used to be — the bug this fiche fixes.
      const quickCreated = await fetch(`${server.base}/api/taxonomies/topic`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          slug: 'local',
          labels: { en: 'Local' },
          parent: actualites.id,
        }),
      })
      expect(quickCreated.status).toBe(201)
      const local = (
        (await quickCreated.json()) as { data: { id: string; parent: string; depth: number } }
      ).data
      expect(local.parent).toBe(actualites.id)
      expect(local.depth).toBe(1)

      // Retrieved through the very listing the Taxonomies screen renders:
      // "Local" shows up right under "Actualités", one level deep — not at
      // the root, which is what the unfixed shortcut used to produce.
      const tree = await fetch(`${server.base}/api/taxonomies/topic`, { headers: auth })
      const treeBody = (await tree.json()) as {
        data: { id: string; parent: string | null; depth: number }[]
      }
      const found = treeBody.data.find((term) => term.id === local.id)
      expect(found).toMatchObject({ parent: actualites.id, depth: 1 })

      await server.stop()
    },
  )

  it('refuses a taxonomy write to an actor without the action, over HTTP', async () => {
    const root = await project()
    const server = await startServer(root)
    const viewerToken = await signIn(root, server.base, ['viewer'])

    // `topic` grants create to `editor` and `admin` only. The runtime checks
    // it (R4), not the screen that happens not to show the button.
    const refused = await fetch(`${server.base}/api/taxonomies/topic`, {
      method: 'POST',
      headers: { authorization: `Bearer ${viewerToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'nope', labels: { en: 'Nope' } }),
    })
    expect(refused.status).toBe(403)

    // Reading is open to `public`, so the same actor still gets the tree.
    const listed = await fetch(`${server.base}/api/taxonomies/topic`, {
      headers: { authorization: `Bearer ${viewerToken}` },
    })
    expect(listed.status).toBe(200)

    await server.stop()
  })

  it('renames a term, moves a subtree, and reports real usage counts — end to end, over HTTP', async () => {
    const root = await project()
    const server = await startServer(root)
    const token = await signIn(root, server.base, ['editor', 'admin'])
    const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

    const createTerm = async (
      slug: string,
      labels: Record<string, string>,
      parent: string | null = null,
    ): Promise<{ id: string; depth: number }> => {
      const response = await fetch(`${server.base}/api/taxonomies/topic`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ slug, labels, parent }),
      })
      expect(response.status).toBe(201)
      return ((await response.json()) as { data: { id: string; depth: number } }).data
    }

    const cuisine = await createTerm('cuisine', { en: 'Cooking' })
    const desserts = await createTerm('desserts', { en: 'Desserts' }, cuisine.id)
    const voyage = await createTerm('voyage', { en: 'Travel' })

    // Several articles classified with "desserts" — 08-taxonomies.md's own
    // acceptance criterion for task 1 (stated there as "forty articles")
    // is renaming must not unclassify any of them; the count here is
    // smaller only to keep this real-HTTP test fast, not the property.
    const ARTICLE_COUNT = 6
    const articleIds: string[] = []
    for (let index = 0; index < ARTICLE_COUNT; index += 1) {
      const response = await fetch(`${server.base}/api/content/article`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ values: { title: `Article ${index}`, topics: [desserts.id] } }),
      })
      expect(response.status).toBe(201)
      const created = ((await response.json()) as { data: { id: string } }).data
      articleIds.push(created.id)
      await fetch(`${server.base}/api/content/article/${created.id}/publish`, {
        method: 'POST',
        headers: auth,
      })
    }

    // Rename "desserts" — labels and slug change, nothing about the tree does.
    const renamed = await fetch(`${server.base}/api/taxonomies/topic/${desserts.id}`, {
      method: 'PATCH',
      headers: auth,
      body: JSON.stringify({ slug: 'patisserie', labels: { en: 'Pastry' } }),
    })
    expect(renamed.status).toBe(200)
    const renamedTerm = ((await renamed.json()) as { data: { slug: string; parent: string } }).data
    expect(renamedTerm.slug).toBe('patisserie')
    expect(renamedTerm.parent).toBe(cuisine.id)

    // Every one of the articles is still classified.
    for (const id of articleIds) {
      const read = await fetch(`${server.base}/api/content/article/${id}?state=working`, {
        headers: auth,
      })
      const body = (await read.json()) as { data: { values: { topics: string[] } } }
      expect(body.data.values.topics).toEqual([desserts.id])
    }

    // Usage counts, over the real route — own and with-descendants, and the
    // right numbers on the right term.
    const counted = await fetch(`${server.base}/api/taxonomies/topic?counts=1`, {
      headers: auth,
    })
    expect(counted.status).toBe(200)
    const countedBody = (await counted.json()) as {
      data: { id: string; entryCount: { own: number; withDescendants: number } }[]
    }
    const dessertsCount = countedBody.data.find((term) => term.id === desserts.id)
    expect(dessertsCount?.entryCount).toEqual({
      own: ARTICLE_COUNT,
      withDescendants: ARTICLE_COUNT,
    })
    const cuisineCount = countedBody.data.find((term) => term.id === cuisine.id)
    expect(cuisineCount?.entryCount).toEqual({ own: 0, withDescendants: ARTICLE_COUNT })
    const voyageCount = countedBody.data.find((term) => term.id === voyage.id)
    expect(voyageCount?.entryCount).toEqual({ own: 0, withDescendants: 0 })

    // "unused only" keeps every term with zero *direct* classifications —
    // "cuisine" qualifies too, even though it inherits every article
    // through its child: `own` is what the filter reads, not
    // `withDescendants`, and both counts are shown precisely so the two
    // questions stay distinct. "desserts" is the only one excluded.
    const unused = await fetch(`${server.base}/api/taxonomies/topic?unused=1`, {
      headers: auth,
    })
    const unusedBody = (await unused.json()) as { data: { id: string }[] }
    expect(unusedBody.data.map((term) => term.id).sort()).toEqual([cuisine.id, voyage.id].sort())

    // Refuses a move that would make "cuisine" its own descendant — checked
    // while "patisserie" (ex-"desserts") is still nested under it, which is
    // the only arrangement that makes this a real cycle to refuse.
    const cyclic = await fetch(`${server.base}/api/taxonomies/topic/${cuisine.id}/move`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ parent: desserts.id }),
    })
    expect(cyclic.status).toBe(400)
    const cyclicBody = (await cyclic.json()) as { error: { code: string } }
    expect(cyclicBody.error.code).toBe('TAXONOMY_CYCLE')
    // Nothing moved: "cuisine" is still a root.
    const cuisineAfter = await fetch(`${server.base}/api/taxonomies/topic/${cuisine.id}`, {
      headers: auth,
    })
    expect(
      ((await cuisineAfter.json()) as { data: { parent: string | null } }).data.parent,
    ).toBeNull()

    // Moving the (renamed) subtree: "patisserie" goes under "voyage" — a
    // deliberately odd move, chosen only to prove the whole branch travels.
    const moved = await fetch(`${server.base}/api/taxonomies/topic/${desserts.id}/move`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ parent: voyage.id }),
    })
    expect(moved.status).toBe(200)
    const movedBody = ((await moved.json()) as { data: { parent: string; depth: number } }).data
    expect(movedBody.parent).toBe(voyage.id)
    expect(movedBody.depth).toBe(1)

    // The articles are still classified with the very same term id — a
    // move rewrites the tree, never the classification.
    const stillClassified = await fetch(
      `${server.base}/api/content/article/${articleIds[0]}?state=working`,
      { headers: auth },
    )
    const stillBody = (await stillClassified.json()) as {
      data: { values: { topics: string[] } }
    }
    expect(stillBody.data.values.topics).toEqual([desserts.id])

    await server.stop()
  }, 30_000)
})
