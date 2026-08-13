import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ARTICLE,
  asAdmin,
  asEditor,
  asPublic,
  bodyOf,
  createHarness,
  dataOf,
  errorOf,
  type Harness,
  idsOf,
  request,
  valuesOf,
} from './harness.js'

describe('REST routes', () => {
  let harness: Harness

  beforeEach(async () => {
    harness = await createHarness()
  })

  afterEach(async () => {
    await harness.dispose()
  })

  async function createArticle(title: string): Promise<string> {
    const created = await harness.router.handle(
      request('POST', '/rest_article', { body: { values: { title } } }),
      asEditor,
    )
    return String(dataOf(created)['id'])
  }

  it('creates an entry as a draft and records the actor as its author', async () => {
    const response = await harness.router.handle(
      request('POST', '/rest_article', {
        // The body claims an author; the runtime must ignore it and use the
        // resolved actor instead.
        body: { values: { title: 'First' }, createdBy: 'someone-else' },
      }),
      asEditor,
    )

    expect(response.status).toBe(201)
    expect(dataOf(response)['status']).toBe('draft')
    expect(dataOf(response)['createdBy']).toBe('user-editor')
    expect(valuesOf(dataOf(response))['title']).toBe('First')
  })

  it('refuses to create an entry for an actor without the create permission', async () => {
    const response = await harness.router.handle(
      request('POST', '/rest_article', { body: { values: { title: 'Nope' } } }),
      asPublic,
    )

    expect(response.status).toBe(403)
    expect(errorOf(response).code).toBe('FORBIDDEN')
  })

  it('reads a published entry anonymously and hides the same entry while it is a draft', async () => {
    const id = await createArticle('Hidden then visible')

    const draft = await harness.router.handle(request('GET', `/rest_article/${id}`), asPublic)
    expect(draft.status).toBe(404)

    await harness.router.handle(request('POST', `/rest_article/${id}/publish`), asEditor)

    const published = await harness.router.handle(request('GET', `/rest_article/${id}`), asPublic)
    expect(published.status).toBe(200)
    expect(dataOf(published)['id']).toBe(id)
  })

  it('lists only published entries for an anonymous caller', async () => {
    const visible = await createArticle('Out')
    await createArticle('In progress')
    await harness.router.handle(request('POST', `/rest_article/${visible}/publish`), asEditor)

    const response = await harness.router.handle(request('GET', '/rest_article'), asPublic)

    expect(response.status).toBe(200)
    expect(idsOf(response)).toEqual([visible])
    expect(bodyOf(response)['page']).toEqual({ hasMore: false, nextCursor: null })
  })

  it('updates an entry without changing what the public sees until it is published', async () => {
    const id = await createArticle('Original')
    await harness.router.handle(request('POST', `/rest_article/${id}/publish`), asEditor)

    const updated = await harness.router.handle(
      request('PATCH', `/rest_article/${id}`, { body: { values: { title: 'Revised' } } }),
      asEditor,
    )
    expect(updated.status).toBe(200)
    expect(valuesOf(dataOf(updated))['title']).toBe('Revised')

    const seenByPublic = await harness.router.handle(
      request('GET', `/rest_article/${id}`),
      asPublic,
    )
    expect(valuesOf(dataOf(seenByPublic))['title']).toBe('Original')

    await harness.router.handle(request('POST', `/rest_article/${id}/publish`), asEditor)
    const afterPublish = await harness.router.handle(
      request('GET', `/rest_article/${id}`),
      asPublic,
    )
    expect(valuesOf(dataOf(afterPublish))['title']).toBe('Revised')
  })

  it('deletes an entry only for an actor holding the delete permission', async () => {
    const id = await createArticle('Doomed')

    const refused = await harness.router.handle(request('DELETE', `/rest_article/${id}`), asEditor)
    expect(refused.status).toBe(403)

    const removed = await harness.router.handle(request('DELETE', `/rest_article/${id}`), asAdmin)
    expect(removed.status).toBe(204)
    expect(await harness.store(ARTICLE).read(id, { state: 'working' })).toBeNull()
  })

  it('lists the versions of an entry for an editor and refuses them to the public', async () => {
    const id = await createArticle('Versioned')
    await harness.router.handle(
      request('PATCH', `/rest_article/${id}`, { body: { values: { title: 'Second' } } }),
      asEditor,
    )

    const history = await harness.router.handle(
      request('GET', `/rest_article/${id}/history`),
      asEditor,
    )
    expect(history.status).toBe(200)
    expect(Array.isArray(bodyOf(history)['data'])).toBe(true)

    const refused = await harness.router.handle(
      request('GET', `/rest_article/${id}/history`),
      asPublic,
    )
    expect(refused.status).toBe(403)
  })

  it('diffs two versions field by field', async () => {
    const id = await createArticle('One')
    await harness.router.handle(
      request('PATCH', `/rest_article/${id}`, { body: { values: { title: 'Two' } } }),
      asEditor,
    )

    const response = await harness.router.handle(
      request('GET', `/rest_article/${id}/diff`, { query: { from: '1', to: '2' } }),
      asEditor,
    )

    expect(response.status).toBe(200)
    expect(JSON.stringify(bodyOf(response))).toContain('title')
  })

  it('names the parameter when a diff is asked for without a version', async () => {
    const id = await createArticle('One')

    const response = await harness.router.handle(
      request('GET', `/rest_article/${id}/diff`, { query: { from: '1' } }),
      asEditor,
    )

    expect(response.status).toBe(400)
    expect(errorOf(response).code).toBe('QUERY_INVALID')
    expect(errorOf(response).message).toContain('"to"')
  })

  it('restores an earlier version as a new version rather than rewinding the counter', async () => {
    const id = await createArticle('One')
    await harness.router.handle(
      request('PATCH', `/rest_article/${id}`, { body: { values: { title: 'Two' } } }),
      asEditor,
    )

    const response = await harness.router.handle(
      request('POST', `/rest_article/${id}/restore`, { body: { version: 1 } }),
      asEditor,
    )

    expect(response.status).toBe(200)
    expect(valuesOf(dataOf(response))['title']).toBe('One')
    expect(dataOf(response)['version']).toBe(3)
  })

  it('answers 404 for a collection the schema does not declare, without echoing the name', async () => {
    const response = await harness.router.handle(request('GET', '/rest_secret'), asPublic)

    expect(response.status).toBe(404)
    expect(errorOf(response).message).not.toContain('rest_secret')
  })

  it('answers 405 with an allow header when the method does not fit the route', async () => {
    const response = await harness.router.handle(request('DELETE', '/rest_article'), asAdmin)

    expect(response.status).toBe(405)
    expect(response.headers['allow']).toBe('GET, POST')
  })

  it('rejects a body that is not in the shape the route expects', async () => {
    const response = await harness.router.handle(
      request('POST', '/rest_article', { body: { values: 'not an object' } }),
      asEditor,
    )

    expect(response.status).toBe(400)
    expect(errorOf(response).code).toBe('CONTENT_INVALID')
  })
})
