import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCommentPermissions } from '../src/permissions.js'
import { createCommentRateLimiter } from '../src/rate-limit.js'
import { type CommentsRequest, type CommentsRouter, createCommentsRouter } from '../src/router.js'
import { createCommentSettingsStore } from '../src/settings-store.js'
import { createCommentStore } from '../src/store.js'
import { testDb } from './helpers/db.js'

const ADMIN = { id: 'admin-1', roles: ['admin'] }
const VIEWER = { id: 'viewer-1', roles: ['viewer'] }
const EDITOR = { id: 'editor-1', roles: ['editor'] }

function baseRequest(overrides: Partial<CommentsRequest> = {}): CommentsRequest {
  return { method: 'POST', path: '/api/comments', ...overrides }
}

describe('CommentsRouter — public POST /api/comments', () => {
  let db: Awaited<ReturnType<typeof testDb>>
  let router: CommentsRouter
  let now: number

  beforeEach(async () => {
    db = await testDb()
    now = Date.parse('2026-01-01T00:00:00Z')
    const store = createCommentStore({ db, now: () => new Date(now) })
    const settings = createCommentSettingsStore(db, () => new Date(now))
    const rateLimiter = createCommentRateLimiter(db, () => now)
    router = createCommentsRouter({
      store,
      settings,
      rateLimiter,
      permissions: createCommentPermissions(),
      siteDefaults: async () => ({ enabled: true, moderationRequired: true }),
      ipHashSecret: 'test-secret',
      now: () => new Date(now),
    })
  })

  afterEach(async () => {
    await db.close()
  })

  function validForm(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      collection: 'post',
      entryId: 'e1',
      name: 'Alice',
      email: 'alice@example.com',
      body: 'A perfectly normal comment.',
      website: '', // honeypot, empty
      _ts: String(now - 5_000), // rendered 5s ago — past the 3s minimum
      ...overrides,
    }
  }

  it('accepts a well-formed submission and queues it pending under mandatory moderation', async () => {
    const response = await router.handle(baseRequest({ body: validForm(), ip: '203.0.113.5' }))
    expect(response.status).toBe(201)
    const body = response.body as { status: string }
    expect(body.status).toBe('pending')
  })

  it('rejects a submission with the honeypot filled in, without saying why', async () => {
    const response = await router.handle(
      baseRequest({ body: validForm({ website: 'http://spam.example' }), ip: '203.0.113.5' }),
    )
    expect(response.status).toBe(422)
    expect((response.body as { error: { code: string } }).error.code).toBe('COMMENT_SPAM_DETECTED')
  })

  it('rejects a submission that arrives faster than the minimum fill delay', async () => {
    const response = await router.handle(
      baseRequest({ body: validForm({ _ts: String(now - 500) }), ip: '203.0.113.5' }),
    )
    expect(response.status).toBe(422)
    expect((response.body as { error: { code: string } }).error.code).toBe('COMMENT_SPAM_DETECTED')
  })

  it('rejects HTML in the body, refusing before the write', async () => {
    const response = await router.handle(
      baseRequest({ body: validForm({ body: '<img src=x onerror=alert(1)>' }), ip: '203.0.113.5' }),
    )
    expect(response.status).toBe(400)
    expect((response.body as { error: { code: string } }).error.code).toBe('COMMENT_BODY_INVALID')
  })

  it('flags a heuristically spammy body as spam rather than queuing it pending', async () => {
    const response = await router.handle(
      baseRequest({ body: validForm({ body: 'buy cheap viagra now' }), ip: '203.0.113.5' }),
    )
    expect(response.status).toBe(201)
    expect((response.body as { status: string }).status).toBe('spam')
  })

  it('rate-limits repeated submissions from the same IP, and it really applies', async () => {
    for (let i = 0; i < 5; i += 1) {
      now += 4_000
      const response = await router.handle(
        baseRequest({ body: validForm({ _ts: String(now - 4_000) }), ip: '203.0.113.9' }),
      )
      expect(response.status).toBe(201)
    }
    now += 4_000
    const blocked = await router.handle(
      baseRequest({ body: validForm({ _ts: String(now - 4_000) }), ip: '203.0.113.9' }),
    )
    expect(blocked.status).toBe(429)
    expect((blocked.body as { error: { code: string } }).error.code).toBe('COMMENT_RATE_LIMITED')
  })

  it('refuses a comment on an entry with comments disabled', async () => {
    const settings = createCommentSettingsStore(db, () => new Date(now))
    await settings.setCollection('post', { enabled: false })
    const response = await router.handle(baseRequest({ body: validForm(), ip: '203.0.113.5' }))
    expect(response.status).toBe(403)
    expect((response.body as { error: { code: string } }).error.code).toBe('COMMENT_TARGET_CLOSED')
  })

  it('auto-approves a returning commenter with a prior approved comment under mandatory moderation', async () => {
    const store = createCommentStore({ db, now: () => new Date(now) })
    await store.create({
      collection: 'post',
      entryId: 'other',
      author: { name: 'Alice', email: 'alice@example.com' },
      body: 'Earlier, approved.',
      status: 'approved',
      ipHash: (await import('../src/ip-hash.js')).hashIp('test-secret', '203.0.113.5'),
    })

    const response = await router.handle(baseRequest({ body: validForm(), ip: '203.0.113.5' }))
    expect((response.body as { status: string }).status).toBe('approved')
  })

  it('redirects back to the page (303) when the form supplies redirectTo, instead of a JSON body', async () => {
    const response = await router.handle(
      baseRequest({ body: validForm({ redirectTo: '/blog/hello-world' }), ip: '203.0.113.6' }),
    )
    expect(response.status).toBe(303)
    expect(response.headers?.location).toBe('/blog/hello-world?comment=pending')
    expect(response.body).toBeNull()
  })

  it('refuses an unsafe redirectTo (protocol-relative //) by falling back to the JSON body', async () => {
    const response = await router.handle(
      baseRequest({ body: validForm({ redirectTo: '//evil.example' }), ip: '203.0.113.7' }),
    )
    expect(response.status).toBe(201)
    expect(response.headers).toBeUndefined()
  })

  it('refuses a backslash-based open redirect (/\\evil.example)', async () => {
    const response = await router.handle(
      baseRequest({ body: validForm({ redirectTo: '/\\evil.example' }), ip: '203.0.113.71' }),
    )
    expect(response.status).toBe(201)
    expect(response.headers).toBeUndefined()
  })

  it('refuses a redirectTo carrying a tab, which a browser strips before it becomes //evil.example', async () => {
    // "/\t/evil.example" is neither "//" nor "/\\" as a raw string, so a
    // check narrower than "any ASCII control character" would accept it --
    // but a real URL parser strips the tab first and the value resolves to
    // a protocol-relative "//evil.example", a genuine open redirect.
    const response = await router.handle(
      baseRequest({ body: validForm({ redirectTo: '/\t/evil.example' }), ip: '203.0.113.73' }),
    )
    expect(response.status).toBe(201)
    expect(response.headers).toBeUndefined()
  })

  it('refuses a redirectTo carrying CR/LF, which would otherwise split the HTTP response', async () => {
    const response = await router.handle(
      baseRequest({
        body: validForm({ redirectTo: '/ok\r\nSet-Cookie: pwned=1' }),
        ip: '203.0.113.72',
      }),
    )
    expect(response.status).toBe(201)
    expect(response.headers).toBeUndefined()
  })

  it('refuses an absolute URL disguised as a path', async () => {
    const response = await router.handle(
      baseRequest({
        body: validForm({ redirectTo: 'https://evil.example/x' }),
        ip: '203.0.113.73',
      }),
    )
    expect(response.status).toBe(201)
    expect(response.headers).toBeUndefined()
  })

  it('a redirectTo submission that fails still redirects, with the failure named in the query', async () => {
    const response = await router.handle(
      baseRequest({
        body: validForm({ website: 'spam', redirectTo: '/blog/hello-world' }),
        ip: '203.0.113.8',
      }),
    )
    expect(response.status).toBe(303)
    expect(response.headers?.location).toBe(
      '/blog/hello-world?comment=error&reason=COMMENT_SPAM_DETECTED',
    )
  })

  it('never stores the raw IP — only a hash', async () => {
    await router.handle(baseRequest({ body: validForm(), ip: '203.0.113.77' }))
    const store = createCommentStore({ db })
    const page = await store.list({})
    expect(page.items[0]?.ipHash).not.toContain('203.0.113.77')
    expect(page.items[0]?.ipHash).toMatch(/^[0-9a-f]{64}$/u)
  })
})

describe('CommentsRouter — moderation queue, permissions by role', () => {
  let db: Awaited<ReturnType<typeof testDb>>
  let router: CommentsRouter
  let commentId: string

  beforeEach(async () => {
    db = await testDb()
    const store = createCommentStore({ db })
    const settings = createCommentSettingsStore(db)
    router = createCommentsRouter({
      store,
      settings,
      rateLimiter: createCommentRateLimiter(db),
      permissions: createCommentPermissions(),
      siteDefaults: async () => ({ enabled: true, moderationRequired: true }),
      ipHashSecret: 'test-secret',
    })
    const created = await store.create({
      collection: 'post',
      entryId: 'e1',
      author: { name: 'Alice', email: 'alice@example.com' },
      body: 'Pending review.',
      status: 'pending',
    })
    commentId = created.id
  })

  afterEach(async () => {
    await db.close()
  })

  it('a viewer can list and read but not moderate', async () => {
    const list = await router.handle({ method: 'GET', path: '/api/comments' }, VIEWER)
    expect(list.status).toBe(200)

    const approve = await router.handle(
      { method: 'POST', path: `/api/comments/${commentId}/status`, body: { status: 'approved' } },
      VIEWER,
    )
    expect(approve.status).toBe(403)
  })

  it('an editor can approve, reply, but not purge', async () => {
    const approve = await router.handle(
      { method: 'POST', path: `/api/comments/${commentId}/status`, body: { status: 'approved' } },
      EDITOR,
    )
    expect(approve.status).toBe(200)

    const reply = await router.handle(
      {
        method: 'POST',
        path: `/api/comments/${commentId}/reply`,
        body: { authorName: 'The editor', authorEmail: 'ed@example.com', body: 'Thanks!' },
      },
      EDITOR,
    )
    expect(reply.status).toBe(201)

    const purge = await router.handle(
      { method: 'DELETE', path: `/api/comments/${commentId}` },
      EDITOR,
    )
    expect(purge.status).toBe(403)
  })

  it('admin can bulk-moderate', async () => {
    const bulk = await router.handle(
      { method: 'POST', path: '/api/comments/bulk', body: { ids: [commentId], status: 'spam' } },
      ADMIN,
    )
    expect(bulk.status).toBe(200)
    expect((bulk.body as { updated: number }).updated).toBe(1)
  })

  it('an anonymous actor gets 401, not 403, on a route that needs a session', async () => {
    const response = await router.handle({ method: 'GET', path: '/api/comments' })
    expect(response.status).toBe(401)
  })

  it('records a moderation verdict via POST .../moderation without changing status', async () => {
    const response = await router.handle(
      {
        method: 'POST',
        path: `/api/comments/${commentId}/moderation`,
        body: { flagged: true, severity: 'high', reason: 'Looks off.' },
      },
      ADMIN,
    )
    expect(response.status).toBe(200)
    const body = response.body as { status: string; moderation: { flagged: boolean } }
    expect(body.status).toBe('pending')
    expect(body.moderation.flagged).toBe(true)
  })

  it('settings: only comments.settings (admin) can write, comments.read can view', async () => {
    const readByViewer = await router.handle(
      { method: 'GET', path: '/api/comments/settings/collection', query: { collection: 'post' } },
      VIEWER,
    )
    expect(readByViewer.status).toBe(200)

    const writeByEditor = await router.handle(
      {
        method: 'PUT',
        path: '/api/comments/settings/collection',
        body: { collection: 'post', enabled: false },
      },
      EDITOR,
    )
    expect(writeByEditor.status).toBe(403)

    const writeByAdmin = await router.handle(
      {
        method: 'PUT',
        path: '/api/comments/settings/collection',
        body: { collection: 'post', enabled: false },
      },
      ADMIN,
    )
    expect(writeByAdmin.status).toBe(200)
  })

  it('purge is a real delete, admin only', async () => {
    const response = await router.handle(
      { method: 'DELETE', path: `/api/comments/${commentId}` },
      ADMIN,
    )
    expect(response.status).toBe(204)
    const after = await router.handle({ method: 'GET', path: `/api/comments/${commentId}` }, ADMIN)
    expect(after.status).toBe(404)
  })

  it('an unknown route answers 404', async () => {
    const response = await router.handle({ method: 'GET', path: '/api/comments/x/y/z' }, ADMIN)
    expect(response.status).toBe(404)
  })
})
