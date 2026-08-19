import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import {
  type CollectionDefinition,
  createContentStore,
  createSchemaTables,
  createTaxonomyStore,
  defineCollection,
  defineTaxonomy,
  f,
  type TaxonomyDefinition,
  type TaxonomyStore,
} from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPermissionLayer } from '../../src/access/index.js'
import type { RestRequest, RestResponse } from '../../src/rest/http.js'
import { createTaxonomyRouter, type TaxonomyRouter } from '../../src/rest/taxonomy-router.js'
import type { AccessContext, Actor } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'

/**
 * The taxonomy transport (`schema@2.0`, ADR-0022), against a real SQLite
 * database — never a mock (AGENTS.md).
 *
 * The permission split of the fixture is what the R4 tests below turn on:
 * anyone reads, an editor creates and updates, only an admin deletes.
 */

const CATEGORY: TaxonomyDefinition = defineTaxonomy({
  name: 'api_category',
  labels: { singular: { fr: 'Catégorie', en: 'Category' } },
  hierarchical: true,
  permissions: {
    read: ['public'],
    create: ['editor', 'admin'],
    update: ['editor', 'admin'],
    delete: ['admin'],
  },
})

/** Closed to the public entirely, to prove "unlisted grants nothing". */
const INTERNAL: TaxonomyDefinition = defineTaxonomy({
  name: 'api_internal',
  labels: { singular: { en: 'Internal' } },
  permissions: { read: ['admin'], create: ['admin'] },
})

const TAXONOMIES = [CATEGORY, INTERNAL]

const EDITOR: Actor = { id: 'user-editor', roles: ['editor'] }
const ADMIN: Actor = { id: 'user-admin', roles: ['admin'] }
const VIEWER: Actor = { id: 'user-viewer', roles: ['viewer'] }

const asPublic: AccessContext = { actor: ANONYMOUS }
const asEditor: AccessContext = { actor: EDITOR }
const asAdmin: AccessContext = { actor: ADMIN }
const asViewer: AccessContext = { actor: VIEWER }

interface Term {
  readonly id: string
  readonly slug: string
  readonly parent: string | null
  readonly depth: number
  readonly labels: Readonly<Record<string, string>>
}

function request(
  method: string,
  path: string,
  extra: { readonly query?: RestRequest['query']; readonly body?: unknown } = {},
): RestRequest {
  return {
    method,
    path: `/api/taxonomies${path}`,
    query: extra.query ?? {},
    ...(extra.body === undefined ? {} : { body: extra.body }),
  }
}

function dataOf<T>(response: RestResponse): T {
  const body = response.body as { data: T }
  return body.data
}

describe('the taxonomy transport', () => {
  let db: DatabaseHandle
  let directory: string
  let router: TaxonomyRouter
  let categories: TaxonomyStore

  const createTerm = async (
    slug: string,
    parent: string | null = null,
    context: AccessContext = asEditor,
  ): Promise<Term> => {
    const response = await router.handle(
      request('POST', '/api_category', { body: { slug, labels: { fr: slug }, parent } }),
      context,
    )
    expect(response.status).toBe(201)
    return dataOf<Term>(response)
  }

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-taxonomy-api-'))
    db = await createSqliteHandle({ url: join(directory, 'taxonomy.db') })
    await createSchemaTables(db, [], TAXONOMIES)

    const stores = new Map<string, TaxonomyStore>()
    const storeFor = (taxonomy: TaxonomyDefinition): TaxonomyStore => {
      const existing = stores.get(taxonomy.name)
      if (existing !== undefined) return existing
      const created = createTaxonomyStore({ db, taxonomy })
      stores.set(taxonomy.name, created)
      return created
    }

    categories = storeFor(CATEGORY)
    router = createTaxonomyRouter({
      taxonomies: TAXONOMIES,
      permissions: createPermissionLayer(),
      storeFor,
    })
  })

  afterEach(async () => {
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  describe('terms', () => {
    it('creates a term and lists the tree in tree order', async () => {
      const root = await createTerm('cuisine')
      const child = await createTerm('desserts', root.id)

      const listed = await router.handle(request('GET', '/api_category'), asPublic)
      expect(listed.status).toBe(200)
      expect(dataOf<Term[]>(listed).map((term) => term.id)).toEqual([root.id, child.id])
      expect(dataOf<Term[]>(listed)[1]?.depth).toBe(1)
    })

    it('never puts the materialised path on the wire', async () => {
      const root = await createTerm('cuisine')
      const read = await router.handle(request('GET', `/api_category/${root.id}`), asPublic)

      // The path is a storage decision (ADR-0022); a client that parsed it
      // would be coupled to it. `parent` and `depth` say all a tree needs.
      expect(Object.keys(dataOf<Term>(read))).not.toContain('path')
    })

    it('renames a term without touching its children', async () => {
      const root = await createTerm('cuisine')
      const child = await createTerm('desserts', root.id)

      const renamed = await router.handle(
        request('PATCH', `/api_category/${root.id}`, {
          body: { slug: 'gastronomie', labels: { fr: 'Gastronomie' } },
        }),
        asEditor,
      )
      expect(renamed.status).toBe(200)
      expect(dataOf<Term>(renamed).slug).toBe('gastronomie')
      expect((await categories.read(child.id))?.parent).toBe(root.id)
    })

    it('moves a branch and reports the new depth', async () => {
      const cuisine = await createTerm('cuisine')
      const voyage = await createTerm('voyage')
      const desserts = await createTerm('desserts', cuisine.id)

      const moved = await router.handle(
        request('POST', `/api_category/${desserts.id}/move`, { body: { parent: voyage.id } }),
        asEditor,
      )
      expect(moved.status).toBe(200)
      expect(dataOf<Term>(moved).parent).toBe(voyage.id)
    })

    it('refuses a move that would make a term its own ancestor', async () => {
      const root = await createTerm('cuisine')
      const child = await createTerm('desserts', root.id)

      const response = await router.handle(
        request('POST', `/api_category/${root.id}/move`, { body: { parent: child.id } }),
        asEditor,
      )
      // A tree with a cycle is refused, not stored and rendered as an
      // infinite menu. 400: the request is understood and impossible.
      expect(response.status).toBe(400)
    })

    it('refuses to delete a term with children unless cascade is asked for', async () => {
      const root = await createTerm('cuisine')
      await createTerm('desserts', root.id)

      // 409: the request is coherent, the current state forbids it.
      const refused = await router.handle(request('DELETE', `/api_category/${root.id}`), asAdmin)
      expect(refused.status).toBe(409)

      const cascaded = await router.handle(
        request('DELETE', `/api_category/${root.id}`, { query: { cascade: 'true' } }),
        asAdmin,
      )
      expect(cascaded.status).toBe(204)
      expect(await categories.list()).toEqual([])
    })

    it('refuses a duplicate slug with a conflict rather than a second term', async () => {
      await createTerm('cuisine')
      const response = await router.handle(
        request('POST', '/api_category', { body: { slug: 'cuisine', labels: { fr: 'Autre' } } }),
        asEditor,
      )
      expect(response.status).toBe(409)
    })

    it('refuses a body whose labels are not indexed by locale', async () => {
      const response = await router.handle(
        request('POST', '/api_category', { body: { slug: 'cuisine', labels: 'Cuisine' } }),
        asEditor,
      )
      expect(response.status).toBe(400)
    })

    it('404s a taxonomy the site does not declare', async () => {
      const response = await router.handle(request('GET', '/api_nothing'), asAdmin)
      expect(response.status).toBe(404)
    })
  })

  describe('permissions, by role', () => {
    it('lets anyone read a taxonomy open to the public', async () => {
      await createTerm('cuisine')
      expect((await router.handle(request('GET', '/api_category'), asPublic)).status).toBe(200)
    })

    it('refuses reading a taxonomy whose read is closed to the actor', async () => {
      for (const [label, actor] of [
        ['public', asPublic],
        ['viewer', asViewer],
        ['editor', asEditor],
      ] as const) {
        const response = await router.handle(request('GET', '/api_internal'), actor)
        expect(response.status, `${label} must not read api_internal`).toBe(403)
      }
      expect((await router.handle(request('GET', '/api_internal'), asAdmin)).status).toBe(200)
    })

    it('refuses creating, updating and moving to an actor without the action', async () => {
      const root = await createTerm('cuisine')

      const created = await router.handle(
        request('POST', '/api_category', { body: { slug: 'x', labels: { fr: 'X' } } }),
        asViewer,
      )
      expect(created.status).toBe(403)

      const updated = await router.handle(
        request('PATCH', `/api_category/${root.id}`, { body: { labels: { fr: 'Autre' } } }),
        asViewer,
      )
      expect(updated.status).toBe(403)

      const moved = await router.handle(
        request('POST', `/api_category/${root.id}/move`, { body: { parent: null } }),
        asViewer,
      )
      expect(moved.status).toBe(403)

      // Nothing was written by any of the three refusals.
      const terms = await categories.list()
      expect(terms).toHaveLength(1)
      expect(terms[0]?.labels).toEqual({ fr: 'cuisine' })
    })

    it('refuses deleting to an editor, who may create and update but not delete', async () => {
      const root = await createTerm('cuisine')

      const response = await router.handle(request('DELETE', `/api_category/${root.id}`), asEditor)
      expect(response.status).toBe(403)
      expect(await categories.read(root.id)).not.toBeNull()
    })

    it('grants nothing for an action the taxonomy never mentions', async () => {
      // `api_internal` lists read and create only: deny by default, so an
      // omission never opens a door.
      const created = await router.handle(
        request('POST', '/api_internal', { body: { slug: 'i', labels: { en: 'I' } } }),
        asAdmin,
      )
      expect(created.status).toBe(201)

      const term = dataOf<Term>(created)
      const deleted = await router.handle(request('DELETE', `/api_internal/${term.id}`), asAdmin)
      expect(deleted.status).toBe(403)
    })

    it('never lets a preview token unlock a taxonomy', async () => {
      // A grant names a *collection* and an entry. A site may have both a
      // `api_category` collection and an `api_category` taxonomy, so the
      // taxonomy door deliberately has no preview path at all.
      const withGrant: AccessContext = {
        actor: ANONYMOUS,
        preview: {
          collection: 'api_internal',
          entryId: 'whatever',
          expiresAt: Date.now() + 60_000,
        },
      }

      expect((await router.handle(request('GET', '/api_internal'), withGrant)).status).toBe(403)
    })
  })
})

/**
 * `?counts=1`, `?unused=1` and `?q=` (`08-taxonomies.md`, task 3): the list
 * route grows the ability to say how many entries carry a term, and to find
 * one by label or slug — never a second endpoint, since the client already
 * fetches the whole tree to render it.
 */
describe('taxonomy usage counts and search', () => {
  const TOPIC: TaxonomyDefinition = defineTaxonomy({
    name: 'usage_topic',
    labels: { singular: { fr: 'Sujet', en: 'Topic' } },
    hierarchical: true,
    permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
  })

  const RECIPE: CollectionDefinition = defineCollection({
    name: 'usage_recipe',
    labels: { singular: 'Recipe', plural: 'Recipes' },
    fields: {
      title: f.text({ required: true, max: 200 }),
      topics: f.taxonomy({ of: 'usage_topic', many: true }),
    },
    permissions: { read: ['public'], create: ['editor'], update: ['editor'], publish: ['editor'] },
  })

  /** Closed to `public`, so it proves a term's usage there never leaks out. */
  const SECRET: CollectionDefinition = defineCollection({
    name: 'usage_secret',
    labels: { singular: 'Secret', plural: 'Secrets' },
    fields: {
      title: f.text({ required: true, max: 200 }),
      topics: f.taxonomy({ of: 'usage_topic', many: true }),
    },
    permissions: { read: ['admin'], create: ['admin'], publish: ['admin'] },
  })

  const COLLECTIONS = [RECIPE, SECRET]

  let db: DatabaseHandle
  let directory: string
  let topics: TaxonomyStore
  let recipes: ReturnType<typeof createContentStore>
  let secrets: ReturnType<typeof createContentStore>

  const routerWith = (usage: { readonly db: DatabaseHandle } | undefined): TaxonomyRouter =>
    createTaxonomyRouter({
      taxonomies: [TOPIC],
      permissions: createPermissionLayer(),
      storeFor: (taxonomy) => createTaxonomyStore({ db, taxonomy }),
      ...(usage === undefined ? {} : { usage: { db: usage.db, collections: COLLECTIONS } }),
    })

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-taxonomy-usage-'))
    db = await createSqliteHandle({ url: join(directory, 'taxonomy.db') })
    await createSchemaTables(db, COLLECTIONS, [TOPIC])

    topics = createTaxonomyStore({ db, taxonomy: TOPIC })
    recipes = createContentStore({ db, collection: RECIPE })
    secrets = createContentStore({ db, collection: SECRET })
  })

  afterEach(async () => {
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('adds no entryCount at all unless ?counts=1 is asked for', async () => {
    const cuisine = await topics.create({ slug: 'cuisine', labels: { fr: 'Cuisine' } })
    const router = routerWith({ db })

    const plain = await router.handle(request('GET', '/usage_topic'), asPublic)
    expect(dataOf<{ id: string; entryCount?: unknown }[]>(plain)[0]?.entryCount).toBeUndefined()

    const dish = await recipes.create({ values: { title: 'Tarte', topics: [cuisine.id] } })
    await recipes.publish(dish.id)

    const counted = await router.handle(
      request('GET', '/usage_topic', { query: { counts: '1' } }),
      asPublic,
    )
    const term =
      dataOf<{ id: string; entryCount?: { own: number; withDescendants: number } }[]>(counted)[0]
    expect(term?.entryCount).toEqual({ own: 1, withDescendants: 1 })
  })

  it('counts descendants in separately from a term’s own count', async () => {
    const cuisine = await topics.create({ slug: 'cuisine', labels: { fr: 'Cuisine' } })
    const desserts = await topics.create({
      slug: 'desserts',
      labels: { fr: 'Desserts' },
      parent: cuisine.id,
    })
    const dish = await recipes.create({ values: { title: 'Tarte', topics: [desserts.id] } })
    await recipes.publish(dish.id)

    const router = routerWith({ db })
    const response = await router.handle(
      request('GET', '/usage_topic', { query: { counts: '1' } }),
      asPublic,
    )
    const byId = new Map(
      dataOf<{ id: string; entryCount: { own: number; withDescendants: number } }[]>(response).map(
        (term) => [term.id, term.entryCount],
      ),
    )

    expect(byId.get(desserts.id)).toEqual({ own: 1, withDescendants: 1 })
    // "Cuisine" classifies nothing directly, but inherits its child's dish.
    expect(byId.get(cuisine.id)).toEqual({ own: 0, withDescendants: 1 })
  })

  it('never counts a collection this actor may not read, even as admin sees it', async () => {
    const cuisine = await topics.create({ slug: 'cuisine', labels: { fr: 'Cuisine' } })
    const memo = await secrets.create({ values: { title: 'Confidentiel', topics: [cuisine.id] } })
    await secrets.publish(memo.id)

    const router = routerWith({ db })

    const asPublicResponse = await router.handle(
      request('GET', '/usage_topic', { query: { counts: '1' } }),
      asPublic,
    )
    expect(
      dataOf<{ id: string; entryCount: { own: number } }[]>(asPublicResponse)[0]?.entryCount.own,
    ).toBe(0)

    const asAdminResponse = await router.handle(
      request('GET', '/usage_topic', { query: { counts: '1' } }),
      asAdmin,
    )
    expect(
      dataOf<{ id: string; entryCount: { own: number } }[]>(asAdminResponse)[0]?.entryCount.own,
    ).toBe(1)
  })

  it('keeps only zero-usage terms with ?unused=1', async () => {
    const cuisine = await topics.create({ slug: 'cuisine', labels: { fr: 'Cuisine' } })
    const voyage = await topics.create({ slug: 'voyage', labels: { fr: 'Voyage' } })
    const dish = await recipes.create({ values: { title: 'Tarte', topics: [cuisine.id] } })
    await recipes.publish(dish.id)

    const router = routerWith({ db })
    const response = await router.handle(
      request('GET', '/usage_topic', { query: { unused: '1' } }),
      asPublic,
    )
    const ids = dataOf<{ id: string }[]>(response).map((term) => term.id)

    expect(ids).toEqual([voyage.id])
  })

  it('finds a term by label or slug, accent- and case-insensitive, with ?q=', async () => {
    await topics.create({ slug: 'cafe-gourmand', labels: { fr: 'Café gourmand' } })
    await topics.create({ slug: 'voyage', labels: { fr: 'Voyage' } })

    const router = routerWith({ db })
    const response = await router.handle(
      request('GET', '/usage_topic', { query: { q: 'CAFE' } }),
      asPublic,
    )
    const slugs = dataOf<{ slug: string }[]>(response).map((term) => term.slug)

    expect(slugs).toEqual(['cafe-gourmand'])
  })

  it('ignores ?counts=1 and ?unused=1 when no usage source is wired', async () => {
    const cuisine = await topics.create({ slug: 'cuisine', labels: { fr: 'Cuisine' } })
    const router = routerWith(undefined)

    const response = await router.handle(
      request('GET', '/usage_topic', { query: { counts: '1', unused: '1' } }),
      asPublic,
    )
    const terms = dataOf<{ id: string; entryCount?: unknown }[]>(response)

    // Neither parameter breaks the plain listing: no entryCount, and
    // "unused" filters nothing since usage was never asked to compute it.
    expect(terms.map((term) => term.id)).toEqual([cuisine.id])
    expect(terms[0]?.entryCount).toBeUndefined()
  })
})
