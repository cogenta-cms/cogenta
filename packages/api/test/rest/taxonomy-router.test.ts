import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import {
  createSchemaTables,
  createTaxonomyStore,
  defineTaxonomy,
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
