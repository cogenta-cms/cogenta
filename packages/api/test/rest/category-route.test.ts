import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import {
  type CollectionDefinition,
  type ContentStore,
  createContentStore,
  createSchemaTables,
  createTaxonomyStore,
  createTermSlugResolver,
  defineCollection,
  defineTaxonomy,
  f,
  type TaxonomyStore,
} from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPermissionLayer, PREVIEW_SIGNING_KEY_ENV } from '../../src/access/index.js'
import { createContentService } from '../../src/rest/content-service.js'
import { createRestRouter } from '../../src/rest/router.js'
import { ANONYMOUS } from '../../src/types.js'
import { bodyOf, dataOf, request } from './harness.js'

/**
 * A route that carries a category (`/blog/:category/:slug`, `schema@2.5`): the
 * path API answers the canonical address with the entry and any other address
 * of the same entry — wrong category, no category — with a 301 to it. A wrong
 * segment must never be a second 200.
 */

const topic = defineTaxonomy({
  name: 'api_topic',
  labels: { singular: { en: 'Topic' }, plural: { en: 'Topics' } },
  hierarchical: false,
  permissions: { read: ['public'] },
})

const post: CollectionDefinition = defineCollection({
  name: 'api_post',
  labels: { singular: 'Post', plural: 'Posts' },
  routing: { pattern: '/blog/:category/:slug' },
  fields: {
    title: f.text({ required: true }),
    slug: f.slug({ from: 'title' }),
    category: f.taxonomy({ of: 'api_topic', many: false }),
  },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'] },
})

describe('resolving an address that carries a category', () => {
  let directory: string
  let db: DatabaseHandle
  let store: ContentStore
  let terms: TaxonomyStore
  let devopsId: string
  let router: ReturnType<typeof createRestRouter>

  const byPath = (path: string) =>
    router.handle(request('GET', '/-/by-path', { query: { path } }), { actor: ANONYMOUS })

  const savedKey = process.env[PREVIEW_SIGNING_KEY_ENV]

  beforeEach(async () => {
    process.env[PREVIEW_SIGNING_KEY_ENV] = 'k'.repeat(40)
    directory = await mkdtemp(join(tmpdir(), 'cogenta-category-route-'))
    db = await createSqliteHandle({ url: join(directory, 'category.db') })
    await createSchemaTables(db, [post], [topic])
    store = createContentStore({ db, collection: post })
    terms = createTaxonomyStore({ db, taxonomy: topic })
    const resolver = createTermSlugResolver({
      termsOf: (name) => (name === 'api_topic' ? terms.list() : undefined),
      missRefreshMs: 0,
    })

    devopsId = (await terms.create({ slug: 'devops', labels: { en: 'DevOps' } })).id
    await terms.create({ slug: 'cloud', labels: { en: 'Cloud' } })
    await store.create({
      id: 'post-categorised',
      status: 'published',
      values: { title: 'Pipelines', slug: 'pipelines', category: devopsId },
    })
    await store.create({
      id: 'post-bare',
      status: 'published',
      values: { title: 'Bare', slug: 'bare' },
    })

    const service = createContentService({
      collections: [post],
      permissions: createPermissionLayer({ collections: [post] }),
      storeFor: () => store,
      routing: { terms: resolver },
    })
    router = createRestRouter({ service, terms: resolver })
  })

  afterEach(async () => {
    if (savedKey === undefined) delete process.env[PREVIEW_SIGNING_KEY_ENV]
    else process.env[PREVIEW_SIGNING_KEY_ENV] = savedKey
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('serves the canonical address with the entry', async () => {
    const response = await byPath('/blog/devops/pipelines')

    expect(response.status).toBe(200)
    expect(dataOf(response)['id']).toBe('post-categorised')
  })

  it('answers the address without the category with a 301 to the canonical one', async () => {
    const response = await byPath('/blog/pipelines')

    expect(response.status).toBe(200)
    expect(bodyOf(response)['redirect']).toEqual({ to: '/blog/devops/pipelines', status: 301 })
  })

  it('answers a wrong category with a 301 and never a second 200', async () => {
    const response = await byPath('/blog/cloud/pipelines')

    expect(bodyOf(response)['data']).toBeNull()
    expect(bodyOf(response)['redirect']).toEqual({ to: '/blog/devops/pipelines', status: 301 })
  })

  it('serves an entry that has no category at the address without the segment', async () => {
    const response = await byPath('/blog/bare')

    expect(dataOf(response)['id']).toBe('post-bare')
    // A category in the address of an entry that has none is a duplicate too.
    const wrong = await byPath('/blog/devops/bare')
    expect(bodyOf(wrong)['redirect']).toEqual({ to: '/blog/bare', status: 301 })
  })

  it('stays a 404 for a slug that does not exist, whatever the category', async () => {
    expect((await byPath('/blog/devops/missing')).status).toBe(404)
    expect((await byPath('/blog/missing')).status).toBe(404)
  })

  it('names the canonical address in a preview link', async () => {
    const editor = { actor: { id: 'user-editor', roles: ['editor'] } }
    const response = await router.handle(
      request('POST', '/api_post/post-categorised/preview'),
      editor,
    )

    expect(response.status).toBe(201)
    expect(dataOf(response)['path']).toBe('/blog/devops/pipelines')
  })
})
