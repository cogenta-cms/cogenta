import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * The trash, end to end through a real `cogenta serve` (fiche 07 —
 * "Corbeille"). `packages/cli/test/serve-taxonomies-trash.test.ts` already
 * proves the taxonomy half and a first pass at trash/untrash on a draft
 * entry; this file covers what fiche 07 specifically asks be proven for
 * real rather than assumed:
 *
 * - a *published* entry survives a trash/restore round trip exactly
 *   (ADR-0022's core promise — `status` and `deletedAt` are orthogonal),
 * - `purge()` really destroys (re-read afterwards is a 404),
 * - `restrict` blocks removal — the mechanism the fiche calls out — and
 *   `delete()`/`purge()` give the caller the same sentence,
 * - the auto-purge sweep (task 5) actually runs, because before this task
 *   `purgeExpired()` had a test suite of its own and no caller,
 * - `untrash`/`purge` land in the audit log, because before this task they
 *   silently did not (see `contentAuditAction` in `serve.ts`).
 *
 * One correction to the fiche's own text, worth stating plainly: task 2
 * describes "restauration groupée... bloquée par une relation restrict".
 * That is not how the server behaves — `restrict` is checked by `delete()`
 * (trashing) and `purge()` only (`@cogenta/schema`'s `store.ts`,
 * `assertNotReferenced`); `untrash()` never calls it, so a restore cannot be
 * blocked by a relation. The tests below prove `restrict` where it actually
 * applies — trashing and purging — rather than asserting a restore failure
 * the server does not produce.
 */

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'author',
    labels: { singular: 'Author', plural: 'Authors' },
    fields: {
      name: { kind: 'text', required: true, options: { max: 200 } },
    },
    permissions: {
      read: ['public'],
      create: ['editor'],
      update: ['editor'],
      delete: ['editor'],
    },
  },
  {
    name: 'article',
    labels: { singular: 'Article', plural: 'Articles' },
    versioning: { drafts: true, history: true },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      writer: { kind: 'relation', options: { to: 'author', onDelete: 'restrict' } },
      publishedAt: { kind: 'datetime', options: {} },
    },
    permissions: {
      read: ['public'],
      create: ['editor'],
      update: ['editor'],
      delete: ['editor'],
      publish: ['editor'],
    },
  },
  {
    name: 'note',
    labels: { singular: 'Note', plural: 'Notes' },
    // A zero-day window so the auto-purge sweep test does not have to wait
    // out a real retention period — see `DEFAULT_TRASH_RETAIN_DAYS`.
    trash: { retainDays: 0 },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
    },
    permissions: {
      read: ['public'],
      create: ['editor'],
      update: ['editor'],
      delete: ['editor'],
    },
  },
]

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-trash-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Test site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
}
`,
    'utf8',
  )
  await writeFile(
    join(root, 'cogenta.schema.mjs'),
    `export default ${JSON.stringify(COLLECTIONS, null, 2)}\n`,
    'utf8',
  )
  return root
}

const activeServers: AbortController[] = []

afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

async function editorAdminToken(root: string, base: string): Promise<string> {
  // `admin` too, so the same actor can also read `/api/audit` and
  // `/api/trash-status` — this suite is about the trash, not about role
  // separation, which `serve-taxonomies-trash.test.ts` already covers.
  await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor', 'admin'])
  return loginWithMfaSetup(base, 'editor@example.com', 'correct horse battery staple')
}

interface Entry {
  readonly id: string
  readonly status: string
  readonly deletedAt: string | null
}

describe('the trash, end to end', () => {
  it('restores a published entry to exactly what it was — status and deletedAt are orthogonal (ADR-0022)', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await editorAdminToken(root, server.base)
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

      const author = await fetch(`${server.base}/api/content/author`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ values: { name: 'Ada' } }),
      })
      const authorId = ((await author.json()) as { data: { id: string } }).data.id

      const created = await fetch(`${server.base}/api/content/article`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ values: { title: 'A published article', writer: authorId } }),
      })
      expect(created.status).toBe(201)
      const articleId = ((await created.json()) as { data: { id: string } }).data.id

      const published = await fetch(`${server.base}/api/content/article/${articleId}/publish`, {
        method: 'POST',
        headers,
      })
      expect(published.status).toBe(200)
      expect(((await published.json()) as { data: Entry }).data.status).toBe('published')

      // Public reads confirm it is really live before it is thrown away.
      const publicRead = await fetch(`${server.base}/api/content/article/${articleId}`)
      expect(publicRead.status).toBe(200)
      await publicRead.arrayBuffer()

      const trashed = await fetch(`${server.base}/api/content/article/${articleId}`, {
        method: 'DELETE',
        headers,
      })
      expect(trashed.status).toBe(204)

      // Gone from the public face while it sits in the trash.
      const goneNow = await fetch(`${server.base}/api/content/article/${articleId}`)
      expect(goneNow.status).toBe(404)
      await goneNow.arrayBuffer()

      const restored = await fetch(`${server.base}/api/content/article/${articleId}/untrash`, {
        method: 'POST',
        headers,
      })
      expect(restored.status).toBe(200)
      const restoredBody = ((await restored.json()) as { data: Entry }).data
      // The core of ADR-0022: it comes back exactly as it was, not as a draft.
      expect(restoredBody.status).toBe('published')
      expect(restoredBody.deletedAt).toBeNull()

      // And publicly readable again, without a second publish.
      const publicAgain = await fetch(`${server.base}/api/content/article/${articleId}`)
      expect(publicAgain.status).toBe(200)
      await publicAgain.arrayBuffer()
    } finally {
      await server.stop()
    }
  })

  it('purge really destroys — re-reading afterwards is a 404, in the trash or not', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await editorAdminToken(root, server.base)
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

      const created = await fetch(`${server.base}/api/content/article`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ values: { title: 'To be destroyed' } }),
      })
      const articleId = ((await created.json()) as { data: { id: string } }).data.id

      const trashed = await fetch(`${server.base}/api/content/article/${articleId}`, {
        method: 'DELETE',
        headers,
      })
      expect(trashed.status).toBe(204)

      const purged = await fetch(`${server.base}/api/content/article/${articleId}/purge`, {
        method: 'POST',
        headers,
      })
      expect(purged.status).toBe(204)

      const goneEverywhere = await fetch(
        `${server.base}/api/content/article/${articleId}?state=working&trashed=include`,
        { headers },
      )
      expect(goneEverywhere.status).toBe(404)
      await goneEverywhere.arrayBuffer()

      // A second purge of the same (now nonexistent) id is a 404 too, not a
      // 204 that would suggest something was destroyed twice.
      const purgedAgain = await fetch(`${server.base}/api/content/article/${articleId}/purge`, {
        method: 'POST',
        headers,
      })
      expect(purgedAgain.status).toBe(404)
    } finally {
      await server.stop()
    }
  })

  it('refuses to trash or purge an entry a restrict relation still points at, with the same sentence both times', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await editorAdminToken(root, server.base)
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

      const author = await fetch(`${server.base}/api/content/author`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ values: { name: 'Grace' } }),
      })
      const authorId = ((await author.json()) as { data: { id: string } }).data.id

      const article = await fetch(`${server.base}/api/content/article`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ values: { title: 'Cites the author', writer: authorId } }),
      })
      const articleId = ((await article.json()) as { data: { id: string } }).data.id
      expect(article.status).toBe(201)

      // The article is live (never trashed), so it still counts as a
      // reference — trashing the author it cites is refused, named.
      const blockedTrash = await fetch(`${server.base}/api/content/author/${authorId}`, {
        method: 'DELETE',
        headers,
      })
      expect(blockedTrash.status).toBe(409)
      const blockedTrashBody = (await blockedTrash.json()) as {
        error: { code: string; message: string }
      }
      expect(blockedTrashBody.error.code).toBe('CONTENT_REFERENCED')
      expect(blockedTrashBody.error.message).toContain('article')

      // Purge runs the very same check (`assertNotReferenced`) and gives the
      // same sentence, exactly what ADR-0022 promises: two paths to removal,
      // one control.
      const blockedPurge = await fetch(`${server.base}/api/content/author/${authorId}/purge`, {
        method: 'POST',
        headers,
      })
      expect(blockedPurge.status).toBe(409)
      const blockedPurgeBody = (await blockedPurge.json()) as {
        error: { code: string; message: string }
      }
      expect(blockedPurgeBody.error.code).toBe('CONTENT_REFERENCED')
      expect(blockedPurgeBody.error.message).toContain('article')

      // Once the referring article is itself trashed, it no longer counts —
      // a referrer sitting in the trash is not visible content any more
      // (`@cogenta/schema`'s `countColumnReferences`) — and the author can
      // be trashed too.
      const trashArticle = await fetch(`${server.base}/api/content/article/${articleId}`, {
        method: 'DELETE',
        headers,
      })
      expect(trashArticle.status).toBe(204)

      const nowAllowed = await fetch(`${server.base}/api/content/author/${authorId}`, {
        method: 'DELETE',
        headers,
      })
      expect(nowAllowed.status).toBe(204)
    } finally {
      await server.stop()
    }
  })

  it('sweeps expired trash automatically once `runServe` is actually ticking it (fiche 07 task 5)', async () => {
    const root = await project()
    // A fast tick, so the test does not wait a real day for the default
    // cadence — see `ServeOptions.trashPurgeTickMs`.
    const server = await startServer(root, { registry: activeServers, trashPurgeTickMs: 200 })
    try {
      const token = await editorAdminToken(root, server.base)
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

      // `note` declares `trash: { retainDays: 0 }` — expired the instant it
      // is trashed, so the very next sweep removes it for real.
      const created = await fetch(`${server.base}/api/content/note`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ values: { title: 'Ephemeral' } }),
      })
      const noteId = ((await created.json()) as { data: { id: string } }).data.id

      const trashed = await fetch(`${server.base}/api/content/note/${noteId}`, {
        method: 'DELETE',
        headers,
      })
      expect(trashed.status).toBe(204)

      // No "still there right after trashing" assertion here on purpose: at
      // this tick interval (fast, so the test does not wait a real day) the
      // sweep can legitimately land between the DELETE response and the next
      // line, which would make that assertion racy rather than meaningful.
      // What this task promises is that the sweep *eventually* runs, not
      // that it never runs within one HTTP round trip.

      // Past at least a couple of ticks, the sweep has run and destroyed it —
      // `trashed=include` so a plain "it's just not in the trash view any
      // more" cannot be mistaken for "it was actually removed".
      await sleep(900)

      const goneForGood = await fetch(
        `${server.base}/api/content/note/${noteId}?state=working&trashed=include`,
        { headers },
      )
      expect(goneForGood.status).toBe(404)
      await goneForGood.arrayBuffer()

      // The status the admin's trash screen reads to say when the sweep last
      // ran and how many days each collection keeps its trash for.
      const status = await fetch(`${server.base}/api/trash-status`, { headers })
      expect(status.status).toBe(200)
      const statusBody = (await status.json()).data as {
        retainDaysByCollection: Record<string, number>
        lastRunAt: string | null
        lastPurged: number | null
      }
      expect(statusBody.retainDaysByCollection).toEqual({ author: 30, article: 30, note: 0 })
      expect(statusBody.lastRunAt).not.toBeNull()
      // `lastPurged` is the *most recent* tick's count, not a running total —
      // by now several ticks have passed since the one that actually removed
      // the note (proven above by the 404), so asserting a specific number
      // here would be racy against the tick interval rather than meaningful.
      // What matters, and is not racy, is that the field reflects a
      // completed sweep at all.
      expect(typeof statusBody.lastPurged).toBe('number')
    } finally {
      await server.stop()
    }
  }, 20_000)

  it('refuses a non-admin read of the trash purge status', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'viewer@example.com', 'correct horse battery staple', ['viewer'])
      const viewerToken = await loginWithMfaSetup(
        server.base,
        'viewer@example.com',
        'correct horse battery staple',
      )
      const response = await fetch(`${server.base}/api/trash-status`, {
        headers: { authorization: `Bearer ${viewerToken}` },
      })
      expect(response.status).toBe(403)
    } finally {
      await server.stop()
    }
  })

  it('records untrash and purge in the audit log — a real gap this fiche found and closed', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await editorAdminToken(root, server.base)
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

      const created = await fetch(`${server.base}/api/content/article`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ values: { title: 'Audited round trip' } }),
      })
      const articleId = ((await created.json()) as { data: { id: string } }).data.id

      await fetch(`${server.base}/api/content/article/${articleId}`, {
        method: 'DELETE',
        headers,
      })
      await fetch(`${server.base}/api/content/article/${articleId}/untrash`, {
        method: 'POST',
        headers,
      })
      await fetch(`${server.base}/api/content/article/${articleId}`, { method: 'DELETE', headers })
      await fetch(`${server.base}/api/content/article/${articleId}/purge`, {
        method: 'POST',
        headers,
      })

      const audit = await fetch(`${server.base}/api/audit?collection=article`, { headers })
      expect(audit.status).toBe(200)
      const actions = (
        (await audit.json()) as { data: { action: string; entryId: string | null }[] }
      ).data
        .filter((entry) => entry.entryId === articleId)
        .map((entry) => entry.action)

      // Before fiche 07, `untrash` and `purge` fell through to `null` in
      // `contentAuditAction` (then an inline ternary in `recordContentAudit`)
      // alongside the genuinely read-only sub-routes — a real gap despite the
      // function's own header comment claiming every mutation is recorded.
      expect(actions).toContain('content.create')
      expect(actions).toContain('content.delete')
      expect(actions).toContain('content.untrash')
      expect(actions).toContain('content.purge')
    } finally {
      await server.stop()
    }
  })
})
