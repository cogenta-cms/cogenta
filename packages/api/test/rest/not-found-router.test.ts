import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { createNotFoundLogStore, type NotFoundLogStore } from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RestRequest, RestResponse } from '../../src/rest/http.js'
import { createNotFoundRouter, type NotFoundRouter } from '../../src/rest/not-found-router.js'
import type { AccessContext, Actor } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'

const ADMIN: Actor = { id: 'user-admin', roles: ['admin'] }
const EDITOR: Actor = { id: 'user-editor', roles: ['editor'] }

const asAdmin: AccessContext = { actor: ADMIN }
const asEditor: AccessContext = { actor: EDITOR }
const asPublic: AccessContext = { actor: ANONYMOUS }

function request(
  method: string,
  extra: { readonly query?: RestRequest['query'] } = {},
): RestRequest {
  return { method, path: '/api/not-found', query: extra.query ?? {} }
}

function dataOf<T>(response: RestResponse): T {
  return (response.body as { data: T }).data
}

function errorOf(response: RestResponse): { readonly code: string } {
  return (response.body as { error: { code: string } }).error
}

describe('the not-found log transport', () => {
  let db: DatabaseHandle
  let directory: string
  let router: NotFoundRouter
  let store: NotFoundLogStore

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-not-found-api-'))
    db = await createSqliteHandle({ url: join(directory, 'not-found.db') })
    store = createNotFoundLogStore({ db })
    router = createNotFoundRouter({ store })
  })

  afterEach(async () => {
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('refuses an anonymous read', async () => {
    const response = await router.handle(request('GET'), asPublic)
    expect(response.status).toBe(403)
    expect(errorOf(response).code).toBe('FORBIDDEN')
  })

  it('refuses an editor — this is a routing/operations concern, not content', async () => {
    const response = await router.handle(request('GET'), asEditor)
    expect(response.status).toBe(403)
  })

  it('lists what was already recorded, sorted by hits', async () => {
    await store.record({ path: '/missing-a' })
    await store.record({ path: '/missing-b' })
    await store.record({ path: '/missing-b' })

    const response = await router.handle(request('GET'), asAdmin)
    expect(response.status).toBe(200)
    const rows = dataOf<{ readonly path: string; readonly hits: number }[]>(response)
    expect(rows.map((row) => row.path)).toEqual(['/missing-b', '/missing-a'])
  })

  it('never exposes an IP or a user agent field, because none is ever recorded', async () => {
    await store.record({ path: '/missing' })

    const response = await router.handle(request('GET'), asAdmin)
    const [row] = dataOf<Record<string, unknown>[]>(response)
    expect(row).toBeDefined()
    expect(Object.keys(row as object).sort()).toEqual([
      'firstSeen',
      'hits',
      'lastReferrer',
      'lastSeen',
      'path',
    ])
  })

  it('lets an admin dismiss one tracked path', async () => {
    await store.record({ path: '/missing' })

    const removed = await router.handle(request('DELETE', { query: { path: '/missing' } }), asAdmin)
    expect(removed.status).toBe(204)

    const listed = await router.handle(request('GET'), asAdmin)
    expect(dataOf<unknown[]>(listed)).toHaveLength(0)
  })

  it('404s dismissing a path that was never recorded', async () => {
    const response = await router.handle(
      request('DELETE', { query: { path: '/never-happened' } }),
      asAdmin,
    )
    expect(response.status).toBe(404)
  })

  it('requires "path" on delete', async () => {
    const response = await router.handle(request('DELETE'), asAdmin)
    expect(response.status).toBe(400)
    expect(errorOf(response).code).toBe('QUERY_INVALID')
  })
})
