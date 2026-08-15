import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import type { CollectionDefinition, SearchDriver, SearchHit } from '@cogenta/schema'
import {
  createContentStore,
  createSchemaTables,
  createSqliteSearch,
  withSearchIndexing,
} from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPermissionLayer } from '../../src/access/index.js'
import type { RestResponse } from '../../src/rest/http.js'
import { createSearchRouter, type SearchRouter } from '../../src/rest/search-router.js'
import type { AccessContext, Actor } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'

/**
 * Real SQLite, real search driver, real content store, real permission layer.
 *
 * The route's own job is the one thing neither the driver nor `normaliseQuery`
 * can do — decide which collections this actor may read — so the assertions
 * are about roles, not about ranking.
 */

/** Readable by everyone. Drafts only for editor and admin. */
const PUBLIC_ARTICLE: CollectionDefinition = {
  name: 'search_article',
  labels: { singular: 'Article', plural: 'Articles' },
  versioning: { drafts: true, history: true },
  fields: { title: { kind: 'text', required: true, options: { max: 200 } } },
  permissions: {
    read: ['public'],
    create: ['editor'],
    update: ['editor'],
    publish: ['editor'],
  },
}

/** Behind a login: `public` may not read it at all. */
const PRIVATE_MEMO: CollectionDefinition = {
  name: 'search_memo',
  labels: { singular: 'Memo', plural: 'Memos' },
  fields: { title: { kind: 'text', required: true, options: { max: 200 } } },
  permissions: { read: ['editor', 'admin'], create: ['editor'], publish: ['editor'] },
}

const COLLECTIONS = [PUBLIC_ARTICLE, PRIVATE_MEMO]

function actor(...roles: readonly string[]): AccessContext {
  const value: Actor = { id: roles.length === 0 ? null : 'user-1', roles }
  return { actor: value }
}

describe('GET /api/search', () => {
  let directory: string
  let db: DatabaseHandle
  let index: SearchDriver
  let router: SearchRouter

  const ask = async (
    query: Readonly<Record<string, string>>,
    context: AccessContext = { actor: ANONYMOUS },
  ): Promise<RestResponse> => router.handle({ method: 'GET', path: '/api/search', query }, context)

  const hitsOf = (response: RestResponse): readonly string[] =>
    ((response.body as { data: readonly SearchHit[] }).data ?? []).map((hit) => hit.collection)

  const titlesOf = (response: RestResponse): readonly string[] =>
    ((response.body as { data: readonly SearchHit[] }).data ?? []).map((hit) => hit.title)

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-search-route-'))
    db = await createSqliteHandle({ url: join(directory, 'search.db') })
    await createSchemaTables(db, COLLECTIONS)
    index = await createSqliteSearch({ db })

    for (const collection of COLLECTIONS) {
      const store = withSearchIndexing(createContentStore({ db, collection }), {
        collection,
        index,
      })
      const published = await store.create({
        values: { title: `Cathedral ${collection.name} published` },
      })
      await store.publish(published.id)
      await store.create({ values: { title: `Cathedral ${collection.name} draft` } })
    }

    router = createSearchRouter({
      index,
      collections: COLLECTIONS,
      permissions: createPermissionLayer({ collections: COLLECTIONS }),
      defaultLocale: 'en',
    })
  })

  afterEach(async () => {
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('refuses a query with no text rather than returning the whole site', async () => {
    const response = await ask({})
    expect(response.status).toBe(400)
    expect((response.body as { error: { code: string } }).error.code).toBe('QUERY_INVALID')
  })

  it('an anonymous reader gets published hits only, and never a collection it may not read', async () => {
    const response = await ask({ q: 'cathedral' })
    expect(response.status).toBe(200)

    expect(new Set(hitsOf(response))).toEqual(new Set(['search_article']))
    expect(titlesOf(response)).toEqual(['Cathedral search_article published'])
  })

  it('an editor sees both collections, and reaches drafts only by asking for them', async () => {
    const published = await ask({ q: 'cathedral' }, actor('editor'))
    expect(new Set(hitsOf(published))).toEqual(new Set(['search_article', 'search_memo']))
    expect(titlesOf(published).every((title) => title.endsWith('published'))).toBe(true)

    const drafts = await ask({ q: 'cathedral', status: 'draft' }, actor('editor'))
    expect(drafts.status).toBe(200)
    expect(titlesOf(drafts).every((title) => title.endsWith('draft'))).toBe(true)
  })

  it('refuses a draft search from a role that may not read drafts', async () => {
    const response = await ask({ q: 'cathedral', status: 'draft' })
    expect(response.status).toBe(403)
    expect((response.body as { error: { code: string } }).error.code).toBe('FORBIDDEN')
  })

  it('refuses an explicit scope the actor may not read, instead of quietly narrowing it', async () => {
    const response = await ask({ q: 'cathedral', collections: 'search_memo' })
    expect(response.status).toBe(403)

    const allowed = await ask({ q: 'cathedral', collections: 'search_memo' }, actor('editor'))
    expect(allowed.status).toBe(200)
    expect(new Set(hitsOf(allowed))).toEqual(new Set(['search_memo']))
  })

  it('404s an unknown collection without echoing the name back', async () => {
    const response = await ask({ q: 'cathedral', collections: 'no_such_thing' })
    expect(response.status).toBe(404)
    expect(JSON.stringify(response.body)).not.toContain('no_such_thing')
  })

  it('never crosses a locale, because the driver is asked for one', async () => {
    const response = await ask({ q: 'cathedral', locale: 'fr' })
    expect(response.status).toBe(200)
    expect(hitsOf(response)).toEqual([])
  })

  it('rejects a nonsense page size rather than sending it to the database', async () => {
    expect((await ask({ q: 'cathedral', limit: 'lots' })).status).toBe(400)
    expect((await ask({ q: 'cathedral', offset: '-3' })).status).toBe(400)
  })

  it('allows GET only', async () => {
    const response = await router.handle({
      method: 'POST',
      path: '/api/search',
      query: { q: 'cathedral' },
    })
    expect(response.status).toBe(405)
    expect(response.headers['allow']).toBe('GET')
  })
})
