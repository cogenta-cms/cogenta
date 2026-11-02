import { type AuthStore, createAuthStore, type User } from '@cogenta/auth'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RestRequest, RestResponse } from '../../src/rest/http.js'
import { createUsersRouter } from '../../src/rest/users-router.js'

/**
 * Pentest 2026-11-01, AUTH-02: "at least one active admin" is an invariant of
 * the whole account table, not of one request. Each mutation used to read the
 * other admins, decide, and write — so two changes in flight (one bulk call
 * naming every admin, or two single calls at once) each saw the other still
 * active and together left the site with nobody able to administer it.
 */

let db: DatabaseHandle
let auth: AuthStore

beforeEach(async () => {
  db = await createSqliteHandle({ url: ':memory:' })
  auth = await createAuthStore({
    db,
    signingKey: 'test-signing-key-not-a-real-secret',
    collections: [],
  })
})

afterEach(async () => {
  await db.close()
})

function router() {
  return createUsersRouter({ auth })
}

function request(method: string, path: string, body?: unknown): RestRequest {
  return { method, path, query: {}, ...(body === undefined ? {} : { body }) }
}

async function activeAdmins(): Promise<readonly User[]> {
  return (await auth.users.list()).filter(
    (user) => user.status === 'active' && user.roles.includes('admin'),
  )
}

function dataOf<T>(response: RestResponse): T {
  return (response.body as { data: T }).data
}

function errorCodeOf(response: RestResponse): string {
  return (response.body as { error: { code: string } }).error.code
}

async function twoAdmins() {
  const first = await auth.users.create({ email: 'first@example.com', roles: ['admin'] })
  const second = await auth.users.create({ email: 'second@example.com', roles: ['admin'] })
  return { first, second, actor: { id: first.id, roles: ['admin'] } }
}

describe('POST /api/users/bulk and the last admin', () => {
  it('disabling every admin at once leaves one active and reports the refused account', async () => {
    const { first, second, actor } = await twoAdmins()

    const response = await router().handle(
      request('POST', '/api/users/bulk', { ids: [first.id, second.id], action: 'disable' }),
      actor,
    )

    expect(response.status).toBe(200)
    const report = dataOf<{
      succeeded: string[]
      failed: { id: string; code: string | undefined }[]
    }>(response)
    expect(report.succeeded).toHaveLength(1)
    expect(report.failed).toHaveLength(1)
    expect(report.failed[0]?.code).toBe('FORBIDDEN')
    expect(await activeAdmins()).toHaveLength(1)
  })

  it('demoting every admin at once leaves one active', async () => {
    const { first, second, actor } = await twoAdmins()

    const response = await router().handle(
      request('POST', '/api/users/bulk', {
        ids: [first.id, second.id],
        action: 'setRoles',
        roles: ['viewer'],
      }),
      actor,
    )

    expect(dataOf<{ failed: unknown[] }>(response).failed).toHaveLength(1)
    expect(await activeAdmins()).toHaveLength(1)
  })

  it('still applies a batch that leaves an admin standing', async () => {
    const { first, second, actor } = await twoAdmins()
    const third = await auth.users.create({ email: 'third@example.com', roles: ['admin'] })

    const response = await router().handle(
      request('POST', '/api/users/bulk', { ids: [first.id, second.id], action: 'disable' }),
      actor,
    )

    expect(dataOf<{ succeeded: string[]; failed: unknown[] }>(response).succeeded).toHaveLength(2)
    expect((await activeAdmins()).map((user) => user.id)).toEqual([third.id])
  })
})

describe('simultaneous single changes and the last admin', () => {
  it('two concurrent disables of the only two admins: one is refused', async () => {
    const { first, second, actor } = await twoAdmins()
    const users = router()

    const responses = await Promise.all([
      users.handle(request('PATCH', `/api/users/${first.id}`, { status: 'disabled' }), actor),
      users.handle(request('PATCH', `/api/users/${second.id}`, { status: 'disabled' }), actor),
    ])

    expect(responses.map((response) => response.status).sort()).toEqual([200, 403])
    expect(errorCodeOf(responses.find((response) => response.status === 403) as RestResponse)).toBe(
      'FORBIDDEN',
    )
    expect(await activeAdmins()).toHaveLength(1)
  })

  it('two concurrent demotions of the only two admins: one is refused', async () => {
    const { first, second, actor } = await twoAdmins()
    const users = router()

    const responses = await Promise.all([
      users.handle(request('PATCH', `/api/users/${first.id}`, { roles: ['editor'] }), actor),
      users.handle(request('PATCH', `/api/users/${second.id}`, { roles: ['editor'] }), actor),
    ])

    expect(responses.map((response) => response.status).sort()).toEqual([200, 403])
    expect(await activeAdmins()).toHaveLength(1)
  })

  it('a disable racing an anonymization of the other admin: one is refused', async () => {
    const { first, second, actor } = await twoAdmins()
    const users = router()

    const responses = await Promise.all([
      users.handle(request('PATCH', `/api/users/${first.id}`, { status: 'disabled' }), actor),
      users.handle(
        request('POST', `/api/users/${second.id}/anonymize`, { confirmEmail: second.email }),
        actor,
      ),
    ])

    expect(responses.map((response) => response.status).sort()).toEqual([200, 403])
    expect(await activeAdmins()).toHaveLength(1)
  })

  it('two concurrent anonymizations of the only two admins: one is refused', async () => {
    const { first, second, actor } = await twoAdmins()
    const users = router()

    const responses = await Promise.all([
      users.handle(
        request('POST', `/api/users/${first.id}/anonymize`, { confirmEmail: first.email }),
        actor,
      ),
      users.handle(
        request('POST', `/api/users/${second.id}/anonymize`, { confirmEmail: second.email }),
        actor,
      ),
    ])

    expect(responses.map((response) => response.status).sort()).toEqual([200, 403])
    expect(await activeAdmins()).toHaveLength(1)
  })
})
