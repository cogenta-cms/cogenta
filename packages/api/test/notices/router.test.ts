import { type AuthStore, createAuthStore } from '@cogenta/auth'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createNoticeDismissalStore } from '../../src/notices/dismissals.js'
import {
  createMfaRecommendationSource,
  MFA_RECOMMENDATION_ID,
} from '../../src/notices/mfa-recommendation.js'
import { createNoticeRouter } from '../../src/notices/router.js'
import type { AdminNotice, NoticeSource } from '../../src/notices/types.js'
import type { RestRequest } from '../../src/rest/http.js'
import { type Actor, ANONYMOUS } from '../../src/types.js'

const PUBLISH_COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'article',
    labels: { singular: 'Article', plural: 'Articles' },
    fields: {},
    permissions: { publish: ['editor'] },
  },
]

let db: DatabaseHandle
let auth: AuthStore
let dismissals: ReturnType<typeof createNoticeDismissalStore>

beforeEach(async () => {
  db = await createSqliteHandle({ url: ':memory:' })
  auth = await createAuthStore({
    db,
    signingKey: 'test-signing-key-not-a-real-secret',
    collections: PUBLISH_COLLECTIONS,
  })
  dismissals = createNoticeDismissalStore(db)
  await dismissals.ensureTable()
})

afterEach(async () => {
  await db.close()
})

function request(method: string, path: string): RestRequest {
  return { method, path, query: {} }
}

function actorFor(id: string, roles: readonly string[]): Actor {
  return { id, roles }
}

function mfaRouter() {
  return createNoticeRouter({
    sources: [
      createMfaRecommendationSource({
        collections: PUBLISH_COLLECTIONS,
        credentials: auth.credentials,
      }),
    ],
    dismissals,
  })
}

function noticesOf(response: { body: unknown }): AdminNotice[] {
  return (response.body as { data: AdminNotice[] }).data
}

describe('GET /api/notices', () => {
  it('refuses an anonymous caller: a notice belongs to somebody', async () => {
    const response = await mfaRouter().handle(request('GET', '/api/notices'), ANONYMOUS)
    expect(response.status).toBe(401)
    expect((response.body as { error: { code: string } }).error.code).toBe('UNAUTHENTICATED')
  })

  it('recommends MFA to an admin who has none', async () => {
    const user = await auth.users.create({ email: 'root@example.com', roles: ['admin'] })
    const response = await mfaRouter().handle(
      request('GET', '/api/notices'),
      actorFor(user.id, ['admin']),
    )

    expect(response.status).toBe(200)
    const notices = noticesOf(response)
    expect(notices).toHaveLength(1)
    expect(notices[0]?.id).toBe(MFA_RECOMMENDATION_ID)
    expect(notices[0]?.severity).toBe('warning')
    expect(notices[0]?.dismissible).toBe(true)
    // Never prose: the admin translates the code (ADR-0019).
    expect(notices[0]).not.toHaveProperty('message')
  })

  it('recommends MFA to a role that can publish, not only to admin', async () => {
    const user = await auth.users.create({ email: 'ed@example.com', roles: ['editor'] })
    const notices = noticesOf(
      await mfaRouter().handle(request('GET', '/api/notices'), actorFor(user.id, ['editor'])),
    )
    expect(notices.map((notice) => notice.id)).toEqual([MFA_RECOMMENDATION_ID])
  })

  it('says nothing to a role that can neither publish nor administer', async () => {
    const user = await auth.users.create({ email: 'v@example.com', roles: ['viewer'] })
    const notices = noticesOf(
      await mfaRouter().handle(request('GET', '/api/notices'), actorFor(user.id, ['viewer'])),
    )
    expect(notices).toEqual([])
  })

  it('stops recommending once the account actually enrols — no dismissal needed', async () => {
    const user = await auth.users.create({ email: 'root@example.com', roles: ['admin'] })
    await auth.credentials.setTotpSecret(user.id, 'JBSWY3DPEHPK3PXP')
    await auth.credentials.confirmTotp(user.id)

    const notices = noticesOf(
      await mfaRouter().handle(request('GET', '/api/notices'), actorFor(user.id, ['admin'])),
    )
    expect(notices).toEqual([])
  })

  it('keeps recommending while a TOTP secret sits unconfirmed', async () => {
    const user = await auth.users.create({ email: 'root@example.com', roles: ['admin'] })
    await auth.credentials.setTotpSecret(user.id, 'JBSWY3DPEHPK3PXP')

    const notices = noticesOf(
      await mfaRouter().handle(request('GET', '/api/notices'), actorFor(user.id, ['admin'])),
    )
    expect(notices.map((notice) => notice.id)).toEqual([MFA_RECOMMENDATION_ID])
  })

  it('accepts a passkey as the second factor, not only TOTP', async () => {
    const user = await auth.users.create({ email: 'root@example.com', roles: ['admin'] })
    await auth.credentials.addWebAuthnCredential(user.id, {
      credentialId: 'cred-1',
      publicKey: 'key',
      counter: 0,
      transports: [],
      label: undefined,
    })

    const notices = noticesOf(
      await mfaRouter().handle(request('GET', '/api/notices'), actorFor(user.id, ['admin'])),
    )
    expect(notices).toEqual([])
  })

  it('never lets one failing source take the whole list down with it', async () => {
    const exploding: NoticeSource = {
      name: 'exploding',
      list: () => Promise.reject(new Error('the data source is down')),
    }
    const working: NoticeSource = {
      name: 'working',
      list: () =>
        Promise.resolve([
          { id: 'demo', code: 'demo', severity: 'info', dismissible: true } as const,
        ]),
    }
    const router = createNoticeRouter({ sources: [exploding, working], dismissals })

    const response = await router.handle(
      request('GET', '/api/notices'),
      actorFor('user-1', ['admin']),
    )
    expect(response.status).toBe(200)
    expect(noticesOf(response).map((notice) => notice.id)).toEqual(['demo'])
  })
})

describe('POST /api/notices/{id}/dismiss', () => {
  it('refuses an anonymous caller', async () => {
    const response = await mfaRouter().handle(
      request('POST', `/api/notices/${MFA_RECOMMENDATION_ID}/dismiss`),
      ANONYMOUS,
    )
    expect(response.status).toBe(401)
  })

  it('stops the notice coming back for that account', async () => {
    const user = await auth.users.create({ email: 'root@example.com', roles: ['admin'] })
    const actor = actorFor(user.id, ['admin'])
    const router = mfaRouter()

    const dismissal = await router.handle(
      request('POST', `/api/notices/${MFA_RECOMMENDATION_ID}/dismiss`),
      actor,
    )
    expect(dismissal.status).toBe(204)

    expect(noticesOf(await router.handle(request('GET', '/api/notices'), actor))).toEqual([])
  })

  it('leaves every other account still seeing it', async () => {
    const one = await auth.users.create({ email: 'one@example.com', roles: ['admin'] })
    const two = await auth.users.create({ email: 'two@example.com', roles: ['admin'] })
    const router = mfaRouter()

    await router.handle(
      request('POST', `/api/notices/${MFA_RECOMMENDATION_ID}/dismiss`),
      actorFor(one.id, ['admin']),
    )

    const stillShown = noticesOf(
      await router.handle(request('GET', '/api/notices'), actorFor(two.id, ['admin'])),
    )
    expect(stillShown.map((notice) => notice.id)).toEqual([MFA_RECOMMENDATION_ID])
  })

  it('is idempotent: dismissing twice is not an error', async () => {
    const user = await auth.users.create({ email: 'root@example.com', roles: ['admin'] })
    const actor = actorFor(user.id, ['admin'])
    const router = mfaRouter()

    await router.handle(request('POST', `/api/notices/${MFA_RECOMMENDATION_ID}/dismiss`), actor)
    const second = await router.handle(
      request('POST', `/api/notices/${MFA_RECOMMENDATION_ID}/dismiss`),
      actor,
    )
    expect(second.status).toBe(204)
  })

  it('refuses to record a dismissal for a notice this actor is not being shown', async () => {
    const user = await auth.users.create({ email: 'v@example.com', roles: ['viewer'] })
    const response = await mfaRouter().handle(
      request('POST', `/api/notices/${MFA_RECOMMENDATION_ID}/dismiss`),
      actorFor(user.id, ['viewer']),
    )
    expect(response.status).toBe(404)
  })

  it('refuses to dismiss a notice the source says may not be dismissed', async () => {
    const permanent: NoticeSource = {
      name: 'permanent',
      list: () =>
        Promise.resolve([
          { id: 'must-fix', code: 'must-fix', severity: 'danger', dismissible: false } as const,
        ]),
    }
    const router = createNoticeRouter({ sources: [permanent], dismissals })

    const response = await router.handle(
      request('POST', '/api/notices/must-fix/dismiss'),
      actorFor('user-1', ['admin']),
    )
    expect(response.status).toBe(403)
  })

  it('still shows a non-dismissible notice even if a dismissal row exists for its id', async () => {
    const permanent: NoticeSource = {
      name: 'permanent',
      list: () =>
        Promise.resolve([
          { id: 'must-fix', code: 'must-fix', severity: 'danger', dismissible: false } as const,
        ]),
    }
    await dismissals.dismiss('user-1', 'must-fix')
    const router = createNoticeRouter({ sources: [permanent], dismissals })

    const notices = noticesOf(
      await router.handle(request('GET', '/api/notices'), actorFor('user-1', ['admin'])),
    )
    expect(notices.map((notice) => notice.id)).toEqual(['must-fix'])
  })
})
