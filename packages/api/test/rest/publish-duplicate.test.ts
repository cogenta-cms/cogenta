import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ARTICLE,
  asEditor,
  asPublic,
  asViewer,
  createHarness,
  dataOf,
  errorOf,
  type Harness,
  request,
  valuesOf,
} from './harness.js'

/**
 * `POST /{collection}/{id}/unpublish` and `POST /{collection}/{id}/duplicate`
 * — the two routes the admin's status control and duplicate button need.
 *
 * Both reuse an existing action of contract A's frozen five rather than
 * inventing a sixth: `unpublish` is guarded by `publish` (it is publish's
 * direct inverse, same reasoning `untrash`/`purge` reuse `delete`), and
 * `duplicate` is guarded by `create` (it produces a new entry, not a change
 * to the source).
 */
describe('unpublish and duplicate', () => {
  let harness: Harness

  beforeEach(async () => {
    harness = await createHarness()
    const articles = harness.store(ARTICLE)
    await articles.create({ id: 'live-a', status: 'published', values: { title: 'Live A' } })
  })

  afterEach(async () => {
    await harness.dispose()
  })

  describe('unpublish', () => {
    it('refuses an anonymous caller', async () => {
      const response = await harness.router.handle(
        request('POST', '/rest_article/live-a/unpublish'),
        asPublic,
      )
      expect(response.status).toBe(403)
      expect(errorOf(response).code).toBe('FORBIDDEN')
    })

    it('refuses a role without publish', async () => {
      const response = await harness.router.handle(
        request('POST', '/rest_article/live-a/unpublish'),
        asViewer,
      )
      expect(response.status).toBe(403)
    })

    it('moves a published entry back to draft for a role with publish', async () => {
      const response = await harness.router.handle(
        request('POST', '/rest_article/live-a/unpublish'),
        asEditor,
      )
      expect(response.status).toBe(200)
      expect(dataOf(response)['status']).toBe('draft')

      // The working state, since an unpublished entry no longer has a
      // published face to read.
      const read = await harness.router.handle(
        request('GET', '/rest_article/live-a', { query: { state: 'working' } }),
        asEditor,
      )
      expect(valuesOf(dataOf(read))['title']).toBe('Live A')
    })

    it('accepts an explicit "archived" status', async () => {
      const response = await harness.router.handle(
        request('POST', '/rest_article/live-a/unpublish', { body: { status: 'archived' } }),
        asEditor,
      )
      expect(response.status).toBe(200)
      expect(dataOf(response)['status']).toBe('archived')
    })

    it('rejects a status outside draft, archived or scheduled', async () => {
      const response = await harness.router.handle(
        request('POST', '/rest_article/live-a/unpublish', { body: { status: 'published' } }),
        asEditor,
      )
      expect(response.status).toBe(400)
    })

    /**
     * Scheduling: an admin sets an existing entry's status to "Programmé"
     * with a future date. `update()` never touches `status`, so this is the
     * only route that can do it — `schedulePublication`/
     * `registerScheduledPublishing` (`@cogenta/schema`) were written and
     * tested from L1 but never had a write path in front of them.
     */
    describe('scheduling', () => {
      it('moves an entry to scheduled with a future publishedAt', async () => {
        const publishAt = new Date(Date.now() + 3600_000).toISOString()
        const response = await harness.router.handle(
          request('POST', '/rest_article/live-a/unpublish', {
            body: { status: 'scheduled', publishedAt: publishAt },
          }),
          asEditor,
        )
        expect(response.status).toBe(200)
        expect(dataOf(response)['status']).toBe('scheduled')
        expect(dataOf(response)['publishedAt']).toBe(publishAt)

        // Not public: a scheduled entry has no published face yet.
        const read = await harness.router.handle(request('GET', '/rest_article/live-a'), asPublic)
        expect(read.status).toBe(404)
      })

      it('refuses to schedule without a date', async () => {
        const response = await harness.router.handle(
          request('POST', '/rest_article/live-a/unpublish', { body: { status: 'scheduled' } }),
          asEditor,
        )
        expect(response.status).toBe(400)
      })

      it('refuses an anonymous caller too, like every other unpublish', async () => {
        const response = await harness.router.handle(
          request('POST', '/rest_article/live-a/unpublish', {
            body: { status: 'scheduled', publishedAt: new Date().toISOString() },
          }),
          asPublic,
        )
        expect(response.status).toBe(403)
      })
    })
  })

  describe('duplicate', () => {
    it('refuses an anonymous caller', async () => {
      const response = await harness.router.handle(
        request('POST', '/rest_article/live-a/duplicate'),
        asPublic,
      )
      expect(response.status).toBe(403)
      expect(errorOf(response).code).toBe('FORBIDDEN')
    })

    it('refuses a role without create', async () => {
      const response = await harness.router.handle(
        request('POST', '/rest_article/live-a/duplicate'),
        asViewer,
      )
      expect(response.status).toBe(403)
    })

    it('creates a new draft copy for a role with create', async () => {
      const response = await harness.router.handle(
        request('POST', '/rest_article/live-a/duplicate'),
        asEditor,
      )
      expect(response.status).toBe(201)
      const copy = dataOf(response)
      expect(copy['id']).not.toBe('live-a')
      expect(copy['status']).toBe('draft')
      expect(valuesOf(copy)['title']).toBe('Live A')

      // The source is untouched.
      const source = await harness.router.handle(request('GET', '/rest_article/live-a'), asEditor)
      expect(dataOf(source)['status']).toBe('published')
    })

    it('applies value overrides from the request body', async () => {
      const response = await harness.router.handle(
        request('POST', '/rest_article/live-a/duplicate', {
          body: { values: { title: 'Live A (copy)' } },
        }),
        asEditor,
      )
      expect(response.status).toBe(201)
      expect(valuesOf(dataOf(response))['title']).toBe('Live A (copy)')
    })
  })
})
