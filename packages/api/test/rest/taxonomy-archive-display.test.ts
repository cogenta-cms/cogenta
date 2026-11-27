import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import {
  createSchemaTables,
  createTaxonomyStore,
  createTermArchiveDisplayStore,
  defineTaxonomy,
  ensureTermArchiveDisplayTable,
  type TaxonomyDefinition,
  type TaxonomyStore,
  type TermArchiveDisplayStore,
} from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPermissionLayer } from '../../src/access/index.js'
import type { RestRequest, RestResponse } from '../../src/rest/http.js'
import { createTaxonomyRouter, type TaxonomyRouter } from '../../src/rest/taxonomy-router.js'
import type { AccessContext, Actor } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'

/**
 * `GET`/`PUT /{taxonomy}/{id}/archive-display` — what a term's public page
 * shows — against a real SQLite database. The setting is a host-owned
 * presentation setting kept outside contract A, so these tests also prove a
 * term's own shape is untouched by it.
 */

const SECTION: TaxonomyDefinition = defineTaxonomy({
  name: 'display_section',
  labels: { singular: { fr: 'Rubrique', en: 'Section' } },
  hierarchical: true,
  permissions: {
    read: ['public'],
    create: ['editor', 'admin'],
    update: ['editor', 'admin'],
    delete: ['admin'],
  },
})

const INTERNAL: TaxonomyDefinition = defineTaxonomy({
  name: 'display_internal',
  labels: { singular: { en: 'Internal' } },
  permissions: { read: ['admin'], create: ['admin'], update: ['admin'] },
})

const TAXONOMIES = [SECTION, INTERNAL]

const EDITOR: Actor = { id: 'user-editor', roles: ['editor'] }
const ADMIN: Actor = { id: 'user-admin', roles: ['admin'] }
const VIEWER: Actor = { id: 'user-viewer', roles: ['viewer'] }

const asPublic: AccessContext = { actor: ANONYMOUS }
const asEditor: AccessContext = { actor: EDITOR }
const asAdmin: AccessContext = { actor: ADMIN }
const asViewer: AccessContext = { actor: VIEWER }

function request(method: string, path: string, body?: unknown): RestRequest {
  return {
    method,
    path: `/api/taxonomies${path}`,
    query: {},
    ...(body === undefined ? {} : { body }),
  }
}

function errorCode(response: RestResponse): string | undefined {
  return (response.body as { error?: { code?: string } } | null)?.error?.code
}

describe('the term archive display routes', () => {
  let db: DatabaseHandle
  let directory: string
  let router: TaxonomyRouter
  let sections: TaxonomyStore
  let display: TermArchiveDisplayStore

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-archive-display-api-'))
    db = await createSqliteHandle({ url: join(directory, 'display.db') })
    await createSchemaTables(db, [], TAXONOMIES)
    await ensureTermArchiveDisplayTable(db)

    const stores = new Map<string, TaxonomyStore>()
    const storeFor = (taxonomy: TaxonomyDefinition): TaxonomyStore => {
      const existing = stores.get(taxonomy.name)
      if (existing !== undefined) return existing
      const created = createTaxonomyStore({ db, taxonomy })
      stores.set(taxonomy.name, created)
      return created
    }
    sections = storeFor(SECTION)
    display = createTermArchiveDisplayStore({ db })
    router = createTaxonomyRouter({
      taxonomies: TAXONOMIES,
      permissions: createPermissionLayer(),
      storeFor,
      archiveDisplay: display,
    })
  })

  afterEach(async () => {
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('answers entries for a term nobody configured', async () => {
    const term = await sections.create({ slug: 'tutorials', labels: { en: 'Tutorials' } })
    const response = await router.handle(
      request('GET', `/display_section/${term.id}/archive-display`),
      asPublic,
    )
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ data: { mode: 'entries' } })
  })

  it('lets an editor change the mode, and reads it back', async () => {
    const term = await sections.create({ slug: 'tutorials', labels: { en: 'Tutorials' } })
    const put = await router.handle(
      request('PUT', `/display_section/${term.id}/archive-display`, { mode: 'subtree' }),
      asEditor,
    )
    expect(put.status).toBe(200)
    expect(put.body).toEqual({ data: { mode: 'subtree' } })
    expect(await display.get('display_section', term.id)).toBe('subtree')

    const get = await router.handle(
      request('GET', `/display_section/${term.id}/archive-display`),
      asPublic,
    )
    expect(get.body).toEqual({ data: { mode: 'subtree' } })
  })

  it('lets an admin change the mode', async () => {
    const term = await sections.create({ slug: 'tutorials', labels: { en: 'Tutorials' } })
    const put = await router.handle(
      request('PUT', `/display_section/${term.id}/archive-display`, { mode: 'subterms' }),
      asAdmin,
    )
    expect(put.status).toBe(200)
  })

  it('refuses a viewer and the public, and stores nothing', async () => {
    const term = await sections.create({ slug: 'tutorials', labels: { en: 'Tutorials' } })
    for (const context of [asViewer, asPublic]) {
      const put = await router.handle(
        request('PUT', `/display_section/${term.id}/archive-display`, { mode: 'subtree' }),
        context,
      )
      expect([401, 403]).toContain(put.status)
    }
    expect(await display.get('display_section', term.id)).toBe('entries')
  })

  it('refuses to read the mode of a taxonomy the reader may not read', async () => {
    const terms = createTaxonomyStore({ db, taxonomy: INTERNAL })
    const term = await terms.create({ slug: 'secret', labels: { en: 'Secret' } })
    const response = await router.handle(
      request('GET', `/display_internal/${term.id}/archive-display`),
      asPublic,
    )
    expect([401, 403]).toContain(response.status)
  })

  it('refuses an unknown mode with a 400 naming the valid ones', async () => {
    const term = await sections.create({ slug: 'tutorials', labels: { en: 'Tutorials' } })
    const response = await router.handle(
      request('PUT', `/display_section/${term.id}/archive-display`, { mode: 'everything' }),
      asEditor,
    )
    expect(response.status).toBe(400)
    expect(errorCode(response)).toBe('TERM_ARCHIVE_DISPLAY_INVALID')
  })

  it('answers the router’s not-found error for an unknown term', async () => {
    const missing = '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'
    const get = await router.handle(
      request('GET', `/display_section/${missing}/archive-display`),
      asPublic,
    )
    expect(get.status).toBe(404)
    expect(errorCode(get)).toBe('TAXONOMY_TERM_NOT_FOUND')

    const put = await router.handle(
      request('PUT', `/display_section/${missing}/archive-display`, { mode: 'subtree' }),
      asEditor,
    )
    expect(put.status).toBe(404)
    expect(await display.getMany('display_section')).toEqual(new Map())
  })

  it('does not change the term itself', async () => {
    const term = await sections.create({ slug: 'tutorials', labels: { en: 'Tutorials' } })
    await router.handle(
      request('PUT', `/display_section/${term.id}/archive-display`, { mode: 'subtree' }),
      asEditor,
    )
    const read = await router.handle(request('GET', `/display_section/${term.id}`), asPublic)
    const data = (read.body as { data: Record<string, unknown> }).data
    expect(Object.keys(data)).not.toContain('mode')
    expect(Object.keys(data)).not.toContain('archiveDisplay')
  })

  it('forgets the setting when its term is deleted', async () => {
    const term = await sections.create({ slug: 'tutorials', labels: { en: 'Tutorials' } })
    await display.set('display_section', term.id, 'subtree')
    const response = await router.handle(request('DELETE', `/display_section/${term.id}`), asAdmin)
    expect(response.status).toBe(204)
    expect((await display.getMany('display_section')).size).toBe(0)
  })

  it('forgets the settings of a whole branch deleted with cascade', async () => {
    const parent = await sections.create({ slug: 'guides', labels: { en: 'Guides' } })
    const child = await sections.create({
      slug: 'beginners',
      labels: { en: 'Beginners' },
      parent: parent.id,
    })
    const keeper = await sections.create({ slug: 'news', labels: { en: 'News' } })
    await display.set('display_section', parent.id, 'subtree')
    await display.set('display_section', child.id, 'subterms')
    await display.set('display_section', keeper.id, 'subtree')

    const response = await router.handle(
      { ...request('DELETE', `/display_section/${parent.id}`), query: { cascade: 'true' } },
      asAdmin,
    )
    expect(response.status).toBe(204)
    expect([...(await display.getMany('display_section')).keys()]).toEqual([keeper.id])
  })

  it('has no such route when the setting is not wired', async () => {
    const bare = createTaxonomyRouter({
      taxonomies: TAXONOMIES,
      permissions: createPermissionLayer(),
      storeFor: () => sections,
    })
    const term = await sections.create({ slug: 'tutorials', labels: { en: 'Tutorials' } })
    const response = await bare.handle(
      request('GET', `/display_section/${term.id}/archive-display`),
      asPublic,
    )
    expect(response.status).toBe(404)
  })
})
