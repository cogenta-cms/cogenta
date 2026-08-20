import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import type { CollectionDefinition, ContentStore } from '@cogenta/schema'
import { createContentStore, createSchemaTables } from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPermissionLayer } from '../../src/access/index.js'
import type { ReviewQueueItem } from '../../src/rest/review-router.js'
import { createReviewRouter, type ReviewRouter } from '../../src/rest/review-router.js'
import type { AccessContext, Actor } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'

/**
 * `GET /api/review` — real SQLite, real stores, real permission layer.
 *
 * `review_article` has the workflow on; `review_page` deliberately does not
 * — the queue must never surface it, whatever the scope.
 */

const ARTICLE: CollectionDefinition = {
  name: 'review_article',
  labels: { singular: 'Article', plural: 'Articles' },
  workflow: { enabled: true },
  fields: { title: { kind: 'text', required: true, options: { max: 200 } } },
  permissions: {
    read: ['public'],
    create: ['contributor'],
    update: { roles: ['contributor'], own: true },
    publish: ['reviewer'],
  },
}

const PAGE: CollectionDefinition = {
  name: 'review_page',
  labels: { singular: 'Page', plural: 'Pages' },
  fields: { title: { kind: 'text', required: true, options: { max: 200 } } },
  permissions: {
    read: ['public'],
    create: ['contributor'],
    update: ['contributor'],
    publish: ['reviewer'],
  },
}

const COLLECTIONS = [ARTICLE, PAGE]
const ROLES = ['public', 'contributor', 'reviewer', 'admin']

const CONTRIBUTOR: Actor = { id: 'user-contributor', roles: ['contributor'] }
const REVIEWER: Actor = { id: 'user-reviewer', roles: ['reviewer'] }
const asContributor: AccessContext = { actor: CONTRIBUTOR }
const asReviewer: AccessContext = { actor: REVIEWER }

describe('GET /api/review', () => {
  let directory: string
  let db: DatabaseHandle
  let router: ReviewRouter
  let article: ContentStore

  const ask = async (
    query: Readonly<Record<string, string>>,
    context: AccessContext = { actor: ANONYMOUS },
  ): Promise<readonly ReviewQueueItem[]> => {
    const response = await router.handle({ method: 'GET', path: '/api/review', query }, context)
    expect(response.status, JSON.stringify(response.body)).toBe(200)
    return (response.body as { data: readonly ReviewQueueItem[] }).data
  }

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-review-'))
    db = await createSqliteHandle({ url: join(directory, 'review.db') })
    await createSchemaTables(db, COLLECTIONS)

    const stores = new Map<string, ContentStore>()
    const storeFor = (collection: CollectionDefinition): ContentStore => {
      const existing = stores.get(collection.name)
      if (existing !== undefined) return existing
      const created = createContentStore({ db, collection, siblings: COLLECTIONS })
      stores.set(collection.name, created)
      return created
    }
    article = storeFor(ARTICLE)

    router = createReviewRouter({
      collections: COLLECTIONS,
      permissions: createPermissionLayer({ collections: COLLECTIONS, roles: ROLES }),
      storeFor,
    })
  })

  afterEach(async () => {
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('lists everything pending, to a reviewer', async () => {
    const entry = await article.create({
      values: { title: 'À relire' },
      createdBy: CONTRIBUTOR.id,
    })
    await article.submitForReview(entry.id, { by: CONTRIBUTOR.id })

    const items = await ask({ scope: 'pending' }, asReviewer)
    expect(items.map((item) => item.entry.id)).toEqual([entry.id])
    expect(items[0]?.collection).toBe('review_article')
  })

  it('narrows to "assigned to me" by the assigned reviewer, not just pending', async () => {
    const mine = await article.create({ values: { title: 'Pour moi' }, createdBy: CONTRIBUTOR.id })
    await article.submitForReview(mine.id, { by: CONTRIBUTOR.id, reviewerId: REVIEWER.id })

    const someone = await article.create({
      values: { title: 'Pour un autre' },
      createdBy: CONTRIBUTOR.id,
    })
    await article.submitForReview(someone.id, {
      by: CONTRIBUTOR.id,
      reviewerId: 'user-other-reviewer',
    })

    const items = await ask({ scope: 'assigned' }, asReviewer)
    expect(items.map((item) => item.entry.id)).toEqual([mine.id])
  })

  it('lists "my submissions" by author, across every workflow state but none', async () => {
    const untouched = await article.create({
      values: { title: 'Jamais soumis' },
      createdBy: CONTRIBUTOR.id,
    })
    const submitted = await article.create({
      values: { title: 'Soumis' },
      createdBy: CONTRIBUTOR.id,
    })
    await article.submitForReview(submitted.id, { by: CONTRIBUTOR.id })

    const items = await ask({ scope: 'mine' }, asContributor)
    expect(items.map((item) => item.entry.id)).toEqual([submitted.id])
    expect(items.map((item) => item.entry.id)).not.toContain(untouched.id)
  })

  it('never surfaces a collection that never turned the workflow on', async () => {
    const page = createContentStore({ db, collection: PAGE, siblings: COLLECTIONS })
    await page.create({ values: { title: 'Page' }, createdBy: CONTRIBUTOR.id })

    const items = await ask({ scope: 'pending' }, asReviewer)
    expect(items.every((item) => item.collection !== 'review_page')).toBe(true)
  })

  it('refuses a role with neither publish nor update by returning an empty queue, not an error', async () => {
    const entry = await article.create({ values: { title: 'X' }, createdBy: CONTRIBUTOR.id })
    await article.submitForReview(entry.id, { by: CONTRIBUTOR.id })

    // `public` holds neither `publish` nor `update` on this collection —
    // the queue is empty because no collection is in scope, not a 403: the
    // same "ask, get nothing readable" answer `/api/search` gives.
    const items = await ask({ scope: 'pending' }, { actor: ANONYMOUS })
    expect(items).toEqual([])
  })

  it('rejects an unknown scope rather than guessing', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/review', query: { scope: 'urgent' } },
      asReviewer,
    )
    expect(response.status).toBe(400)
  })

  it('refuses a method other than GET', async () => {
    const response = await router.handle(
      { method: 'POST', path: '/api/review', query: {} },
      asReviewer,
    )
    expect(response.status).toBe(405)
  })
})
