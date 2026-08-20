import { CogentaError } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCommentStore } from '../src/store.js'
import { testDb } from './helpers/db.js'

describe('CommentStore', () => {
  let db: Awaited<ReturnType<typeof testDb>>
  let store: ReturnType<typeof createCommentStore>

  beforeEach(async () => {
    db = await testDb()
    store = createCommentStore({ db })
  })

  afterEach(async () => {
    await db.close()
  })

  it('creates a comment and reads it back with the given status', async () => {
    const created = await store.create({
      collection: 'post',
      entryId: 'e1',
      author: { name: 'Alice', email: 'alice@example.com' },
      body: 'Nice article!',
      status: 'pending',
    })
    expect(created.status).toBe('pending')
    expect(created.body).toBe('Nice article!')
    expect(created.provenance).toBe('human')

    const found = await store.get(created.id)
    expect(found).toEqual(created)
  })

  it('refuses a body containing HTML tags — R3, first line of defense against stored XSS', async () => {
    await expect(
      store.create({
        collection: 'post',
        entryId: 'e1',
        author: { name: 'Eve', email: 'eve@example.com' },
        body: '<script>alert(1)</script>',
        status: 'pending',
      }),
    ).rejects.toMatchObject({ code: 'COMMENT_BODY_INVALID' })
  })

  it('refuses an empty body', async () => {
    await expect(
      store.create({
        collection: 'post',
        entryId: 'e1',
        author: { name: 'Eve', email: 'eve@example.com' },
        body: '   ',
        status: 'pending',
      }),
    ).rejects.toMatchObject({ code: 'COMMENT_BODY_INVALID' })
  })

  it('refuses an author with an invalid e-mail address', async () => {
    await expect(
      store.create({
        collection: 'post',
        entryId: 'e1',
        author: { name: 'Eve', email: 'not-an-email' },
        body: 'Hello.',
        status: 'pending',
      }),
    ).rejects.toMatchObject({ code: 'COMMENT_AUTHOR_INVALID' })
  })

  it('threads a reply under its parent, refusing a parent from a different entry', async () => {
    const parent = await store.create({
      collection: 'post',
      entryId: 'e1',
      author: { name: 'Alice', email: 'alice@example.com' },
      body: 'Top level.',
      status: 'approved',
    })

    const reply = await store.create({
      collection: 'post',
      entryId: 'e1',
      parentId: parent.id,
      author: { name: 'Bob', email: 'bob@example.com' },
      body: 'A reply.',
      status: 'approved',
    })
    expect(reply.parentId).toBe(parent.id)

    await expect(
      store.create({
        collection: 'post',
        entryId: 'e2',
        parentId: parent.id,
        author: { name: 'Carol', email: 'carol@example.com' },
        body: 'Wrong entry.',
        status: 'approved',
      }),
    ).rejects.toMatchObject({ code: 'COMMENT_PARENT_INVALID' })

    await expect(
      store.create({
        collection: 'post',
        entryId: 'e1',
        parentId: 'does-not-exist',
        author: { name: 'Carol', email: 'carol@example.com' },
        body: 'Missing parent.',
        status: 'approved',
      }),
    ).rejects.toMatchObject({ code: 'COMMENT_PARENT_INVALID' })
  })

  it('lists only approved comments for one entry, oldest first, for public rendering', async () => {
    const a = await store.create({
      collection: 'post',
      entryId: 'e1',
      author: { name: 'Alice', email: 'alice@example.com' },
      body: 'First.',
      status: 'approved',
    })
    await store.create({
      collection: 'post',
      entryId: 'e1',
      author: { name: 'Bob', email: 'bob@example.com' },
      body: 'Still pending.',
      status: 'pending',
    })
    const c = await store.create({
      collection: 'post',
      entryId: 'e1',
      author: { name: 'Carol', email: 'carol@example.com' },
      body: 'Second.',
      status: 'approved',
    })

    const thread = await store.listApprovedForEntry('post', 'e1')
    expect(thread.map((comment) => comment.id)).toEqual([a.id, c.id])
  })

  it('filters, searches and paginates the moderation queue', async () => {
    for (let i = 0; i < 3; i += 1) {
      await store.create({
        collection: 'post',
        entryId: 'e1',
        author: { name: `Spammer ${i}`, email: `spam${i}@example.com` },
        body: 'buy pills now',
        status: 'pending',
      })
    }
    await store.create({
      collection: 'post',
      entryId: 'e2',
      author: { name: 'Real Human', email: 'human@example.com' },
      body: 'Great read.',
      status: 'approved',
    })

    const pending = await store.list({ status: 'pending' })
    expect(pending.total).toBe(3)

    const searched = await store.list({ search: 'human' })
    expect(searched.total).toBe(1)
    expect(searched.items[0]?.authorName).toBe('Real Human')

    const page = await store.list({ status: 'pending', limit: 2, offset: 0 })
    expect(page.items).toHaveLength(2)
    expect(page.total).toBe(3)
  })

  it('reports counts by status', async () => {
    await store.create({
      collection: 'post',
      entryId: 'e1',
      author: { name: 'A', email: 'a@example.com' },
      body: 'One.',
      status: 'pending',
    })
    await store.create({
      collection: 'post',
      entryId: 'e1',
      author: { name: 'B', email: 'b@example.com' },
      body: 'Two.',
      status: 'approved',
    })
    const counts = await store.counts()
    expect(counts).toEqual({ pending: 1, approved: 1, spam: 0, trash: 0 })
  })

  it('moves a comment through moderation statuses, and rejects an unknown one', async () => {
    const created = await store.create({
      collection: 'post',
      entryId: 'e1',
      author: { name: 'A', email: 'a@example.com' },
      body: 'One.',
      status: 'pending',
    })
    const approved = await store.setStatus(created.id, 'approved', 'moderator-1')
    expect(approved.status).toBe('approved')
    expect(approved.moderatedBy).toBe('moderator-1')
    expect(approved.moderatedAt).not.toBeNull()

    await expect(store.setStatus(created.id, 'nope' as never, 'moderator-1')).rejects.toMatchObject(
      {
        code: 'COMMENT_STATUS_INVALID',
      },
    )

    await expect(store.setStatus('missing', 'spam', 'moderator-1')).rejects.toMatchObject({
      code: 'COMMENT_NOT_FOUND',
    })
  })

  it('bulk-updates status across many comments, skipping ids that do not exist', async () => {
    const a = await store.create({
      collection: 'post',
      entryId: 'e1',
      author: { name: 'A', email: 'a@example.com' },
      body: 'One.',
      status: 'pending',
    })
    const b = await store.create({
      collection: 'post',
      entryId: 'e1',
      author: { name: 'B', email: 'b@example.com' },
      body: 'Two.',
      status: 'pending',
    })

    const updated = await store.bulkSetStatus([a.id, b.id, 'missing'], 'approved', 'moderator-1')
    expect(updated).toBe(2)
    expect((await store.get(a.id))?.status).toBe('approved')
    expect((await store.get(b.id))?.status).toBe('approved')
  })

  it('records a moderation verdict as an indicator, never changing status by itself', async () => {
    const created = await store.create({
      collection: 'post',
      entryId: 'e1',
      author: { name: 'A', email: 'a@example.com' },
      body: 'One.',
      status: 'pending',
    })
    const moderated = await store.setModeration(created.id, {
      flagged: true,
      severity: 'high',
      reason: 'Looks like spam.',
    })
    expect(moderated.moderation).toEqual({
      flagged: true,
      severity: 'high',
      reason: 'Looks like spam.',
    })
    // Status is untouched — the tool only ever produces an indicator (R6).
    expect(moderated.status).toBe('pending')
  })

  it('purge really deletes — distinct from setStatus(id, "trash")', async () => {
    const created = await store.create({
      collection: 'post',
      entryId: 'e1',
      author: { name: 'A', email: 'a@example.com' },
      body: 'One.',
      status: 'pending',
    })
    await store.purge(created.id)
    expect(await store.get(created.id)).toBeNull()
  })

  it('counts approved comments by hashed IP — the WordPress auto-approve rule', async () => {
    const hash = 'abc123'
    await store.create({
      collection: 'post',
      entryId: 'e1',
      author: { name: 'A', email: 'a@example.com' },
      body: 'One.',
      status: 'approved',
      ipHash: hash,
    })
    await store.create({
      collection: 'post',
      entryId: 'e2',
      author: { name: 'A', email: 'a@example.com' },
      body: 'Two.',
      status: 'pending',
      ipHash: hash,
    })
    expect(await store.countApprovedByIp(hash)).toBe(1)
    expect(await store.countApprovedByIp('other')).toBe(0)
  })
})

describe('CogentaError shape', () => {
  it('COMMENT_NOT_FOUND is a real CogentaError with a stable code', async () => {
    const db = await testDb()
    const store = createCommentStore({ db })
    try {
      await store.setStatus('missing', 'approved', null)
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(CogentaError)
      expect((error as CogentaError).code).toBe('COMMENT_NOT_FOUND')
    }
    await db.close()
  })
})
