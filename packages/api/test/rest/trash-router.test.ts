import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ARTICLE,
  asAdmin,
  asEditor,
  asPublic,
  asViewer,
  bodyOf,
  createHarness,
  type Harness,
  request,
} from './harness.js'

/**
 * The trash over REST (`schema@2.0`, ADR-0022).
 *
 * `rest_article` grants `delete` to `admin` only, and `create`/`update` to
 * `editor` — which makes it the right fixture for the question rule R4 asks:
 * the runtime checks, and it checks the *right* action. Trashing, restoring,
 * purging and even *seeing* the trash are all `delete`, because contract A
 * freezes the five actions and the trash borrows the one that fills it.
 */

describe('the trash over REST', () => {
  let harness: Harness

  const seed = async (title: string): Promise<string> => {
    const created = await harness.router.handle(
      request('POST', '/rest_article', { body: { values: { title } } }),
      asEditor,
    )
    const data = bodyOf(created)['data'] as { id: string }
    return data.id
  }

  beforeEach(async () => {
    harness = await createHarness()
  })

  afterEach(async () => {
    await harness.dispose()
  })

  it('moves an entry to the trash on DELETE, and keeps it recoverable', async () => {
    const id = await seed('À jeter')

    const deleted = await harness.router.handle(request('DELETE', `/rest_article/${id}`), asAdmin)
    expect(deleted.status).toBe(204)

    // Gone from every ordinary read…
    const read = await harness.router.handle(
      request('GET', `/rest_article/${id}`, { query: { state: 'working' } }),
      asEditor,
    )
    expect(read.status).toBe(404)

    // …but still there for whoever may look in the trash.
    const trash = await harness.router.handle(
      request('GET', '/rest_article', { query: { state: 'working', trashed: 'only' } }),
      asAdmin,
    )
    const items = bodyOf(trash)['data'] as readonly { id: string; deletedAt: string | null }[]
    expect(items.map((item) => item.id)).toEqual([id])
    expect(items[0]?.deletedAt).not.toBeNull()
  })

  it('takes an entry back out of the trash with the status it went in with', async () => {
    const id = await seed('Publié puis jeté')
    await harness.router.handle(request('POST', `/rest_article/${id}/publish`), asEditor)
    await harness.router.handle(request('DELETE', `/rest_article/${id}`), asAdmin)

    const restored = await harness.router.handle(
      request('POST', `/rest_article/${id}/untrash`),
      asAdmin,
    )
    expect(restored.status).toBe(200)
    const entry = bodyOf(restored)['data'] as { status: string; deletedAt: string | null }
    expect(entry.status).toBe('published')
    expect(entry.deletedAt).toBeNull()

    const read = await harness.router.handle(request('GET', `/rest_article/${id}`), asPublic)
    expect(read.status).toBe(200)
  })

  it('purges for good, and only through its own route', async () => {
    const id = await seed('Définitif')
    await harness.router.handle(request('DELETE', `/rest_article/${id}`), asAdmin)

    const purged = await harness.router.handle(
      request('POST', `/rest_article/${id}/purge`),
      asAdmin,
    )
    expect(purged.status).toBe(204)

    const trash = await harness.router.handle(
      request('GET', '/rest_article', { query: { state: 'working', trashed: 'only' } }),
      asAdmin,
    )
    expect(bodyOf(trash)['data']).toEqual([])

    // DELETE on the entry means "trash it"; destroying content is never the
    // same verb on the same path.
    const gone = await harness.router.handle(request('POST', `/rest_article/${id}/purge`), asAdmin)
    expect(gone.status).toBe(404)
  })

  it('refuses GET on the purge route rather than treating it as a read', async () => {
    const id = await seed('Méthode')
    const response = await harness.router.handle(
      request('GET', `/rest_article/${id}/purge`),
      asAdmin,
    )
    expect(response.status).toBe(405)
  })

  describe('permissions, by role', () => {
    it('refuses to trash an entry to an actor without delete', async () => {
      const id = await seed('Protégé')

      // The editor may create and update this collection, and may not delete
      // it. Trashing is deleting.
      const response = await harness.router.handle(
        request('DELETE', `/rest_article/${id}`),
        asEditor,
      )
      expect(response.status).toBe(403)

      const still = await harness.router.handle(
        request('GET', `/rest_article/${id}`, { query: { state: 'working' } }),
        asEditor,
      )
      expect(still.status).toBe(200)
    })

    it('refuses to show the trash to an actor without delete', async () => {
      const id = await seed('Caché')
      await harness.router.handle(request('DELETE', `/rest_article/${id}`), asAdmin)

      for (const [label, actor] of [
        ['public', asPublic],
        ['viewer', asViewer],
        ['editor', asEditor],
      ] as const) {
        const response = await harness.router.handle(
          request('GET', '/rest_article', { query: { state: 'working', trashed: 'only' } }),
          actor,
        )
        expect(response.status, `${label} must not see the trash`).toBe(403)
      }
    })

    it('refuses to untrash or purge to an actor without delete', async () => {
      const id = await seed('Verrouillé')
      await harness.router.handle(request('DELETE', `/rest_article/${id}`), asAdmin)

      expect(
        (await harness.router.handle(request('POST', `/rest_article/${id}/untrash`), asEditor))
          .status,
      ).toBe(403)
      expect(
        (await harness.router.handle(request('POST', `/rest_article/${id}/purge`), asEditor))
          .status,
      ).toBe(403)

      // Neither refusal wrote anything: the entry is still in the trash.
      const trash = await harness.router.handle(
        request('GET', '/rest_article', { query: { state: 'working', trashed: 'only' } }),
        asAdmin,
      )
      expect((bodyOf(trash)['data'] as readonly unknown[]).length).toBe(1)
    })

    it('never serves a trashed entry to the public, even published', async () => {
      const id = await seed('Publié')
      await harness.router.handle(request('POST', `/rest_article/${id}/publish`), asEditor)
      await harness.router.handle(request('DELETE', `/rest_article/${id}`), asAdmin)

      expect(
        (await harness.router.handle(request('GET', `/rest_article/${id}`), asPublic)).status,
      ).toBe(404)

      const listed = await harness.router.handle(request('GET', '/rest_article'), asPublic)
      expect(bodyOf(listed)['data']).toEqual([])
    })

    it('rejects a trashed value it does not understand rather than guessing', async () => {
      const response = await harness.router.handle(
        request('GET', '/rest_article', { query: { trashed: 'maybe' } }),
        asAdmin,
      )
      expect(response.status).toBe(400)
    })
  })

  it('leaves the collection definition unchanged for a client that never asks', async () => {
    // The whole reason the filter defaults to excluding: this request is
    // written exactly as it was before 2.0, and it still means what it meant.
    const id = await seed('Vivant')
    const trashed = await seed('Jeté')
    await harness.router.handle(request('DELETE', `/rest_article/${trashed}`), asAdmin)

    const listed = await harness.router.handle(
      request('GET', '/rest_article', { query: { state: 'working' } }),
      asEditor,
    )
    const items = bodyOf(listed)['data'] as readonly { id: string }[]
    expect(items.map((item) => item.id)).toEqual([id])
  })
})

/** The definition ARTICLE is exported for readers of this file; assert its shape. */
it('is written against a collection whose delete is admin-only', () => {
  expect(ARTICLE.permissions.delete).toEqual(['admin'])
  expect(ARTICLE.permissions.update).toEqual(['editor'])
})
