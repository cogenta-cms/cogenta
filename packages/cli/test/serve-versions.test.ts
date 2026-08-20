import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * L10 task 4, verified rather than assumed.
 *
 * The task as written asks for a version-history tab in the admin. Reading
 * the code shows it already exists and is wired: `packages/admin/src/
 * versions/version-history.tsx`, mounted by `routes/entry-edit.tsx`, calling
 * `getHistory`/`getDiff`/`restoreVersion` — built in L2 task 10, before the
 * L10 audit was written.
 *
 * What did *not* exist is the lot's acceptance criterion for it: "restaurer
 * une ancienne version depuis l'admin fonctionne de bout en bout, vérifié par
 * un test réel (pas mocké)". The admin's own suite stubs `fetch`. This one
 * makes the exact three HTTP calls that component makes, in the same order,
 * against a real server on a real database — so the flow is proven, not the
 * component's stub.
 */

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug' },
    versioning: { drafts: true, history: true, keep: 10 },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title' } },
    },
    permissions: {
      read: ['public'],
      create: ['editor'],
      update: ['editor'],
      delete: ['admin'],
      publish: ['editor'],
    },
  },
]

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-versions-'))
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

interface VersionSummary {
  readonly version: number
  readonly status: string
  readonly live: boolean
}

interface FieldChange {
  readonly field: string
  readonly change: string
  readonly before: unknown
  readonly after: unknown
}

interface ContentDiff {
  readonly fields: readonly FieldChange[]
  readonly changed: boolean
}

interface Entry {
  readonly id: string
  readonly version: number
  readonly values: Readonly<Record<string, unknown>>
}

describe('cogenta serve — history, diff and restore, the calls the admin makes (L10 task 4)', () => {
  it('restores an earlier version end to end, and the restore is itself a new version', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const token = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

      const created = (await (
        await fetch(`${server.base}/api/content/page`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ values: { title: 'First title', slug: 'first-title' } }),
        })
      ).json()) as { data: Entry }
      const id = created.data.id

      await fetch(`${server.base}/api/content/page/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ values: { title: 'Second title' } }),
      })
      await fetch(`${server.base}/api/content/page/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ values: { title: 'Third title' } }),
      })

      // 1. What `VersionHistory` loads first.
      const history = (await (
        await fetch(`${server.base}/api/content/page/${id}/history`, { headers })
      ).json()) as { data: readonly VersionSummary[] }
      expect(history.data.length).toBeGreaterThanOrEqual(3)
      const live = history.data.find((version) => version.live)
      const oldest = history.data.at(-1)
      if (live === undefined || oldest === undefined) throw new Error('no history to work from')

      // 2. What its "compare" button asks for.
      const diff = (await (
        await fetch(
          `${server.base}/api/content/page/${id}/diff?from=${oldest.version}&to=${live.version}`,
          { headers },
        )
      ).json()) as { data: ContentDiff }
      expect(diff.data.changed).toBe(true)
      expect(diff.data.fields.some((change) => change.field === 'title')).toBe(true)

      // 3. What its "restore" button posts.
      const restored = (await (
        await fetch(`${server.base}/api/content/page/${id}/restore`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ version: oldest.version }),
        })
      ).json()) as { data: Entry }
      expect(restored.data.values['title']).toBe('First title')
      // Restoring is itself an edit, never a rewind: the counter only ever
      // goes forward, so the restore is undoable in turn (R6).
      expect(restored.data.version).toBeGreaterThan(live.version)

      // And the change really landed in the database, not only in the reply.
      const readBack = (await (
        await fetch(`${server.base}/api/content/page/${id}?state=working`, { headers })
      ).json()) as { data: Entry }
      expect(readBack.data.values['title']).toBe('First title')
    } finally {
      await server.stop()
    }
  })

  it('compares two arbitrary versions, neither the oldest nor the live one (fiche 06 task 1)', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const token = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

      const created = (await (
        await fetch(`${server.base}/api/content/page`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ values: { title: 'v1', slug: 'arbitrary-compare' } }),
        })
      ).json()) as { data: Entry }
      const id = created.data.id

      for (const title of ['v2', 'v3', 'v4', 'v5']) {
        await fetch(`${server.base}/api/content/page/${id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ values: { title } }),
        })
      }

      const history = (await (
        await fetch(`${server.base}/api/content/page/${id}/history`, { headers })
      ).json()) as { data: readonly VersionSummary[] }
      // Five versions: neither v3 nor v5 is the oldest (v1) or necessarily live.
      const middleFrom = history.data.find((v) => v.version === 2)
      const middleTo = history.data.find((v) => v.version === 4)
      if (middleFrom === undefined || middleTo === undefined) {
        throw new Error('expected versions 2 and 4 in the history')
      }

      const diff = (await (
        await fetch(
          `${server.base}/api/content/page/${id}/diff?from=${middleFrom.version}&to=${middleTo.version}`,
          { headers },
        )
      ).json()) as { data: ContentDiff }
      expect(diff.data.changed).toBe(true)
      const titleChange = diff.data.fields.find((change) => change.field === 'title')
      expect(titleChange).toMatchObject({ before: 'v2', after: 'v4' })
    } finally {
      await server.stop()
    }
  })

  it('reports a word-level diff for a changed text field (fiche 06 task 3)', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const token = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

      const created = (await (
        await fetch(`${server.base}/api/content/page`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            values: { title: 'The quick brown fox', slug: 'word-diff' },
          }),
        })
      ).json()) as { data: Entry }
      const id = created.data.id

      await fetch(`${server.base}/api/content/page/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ values: { title: 'The quick red fox' } }),
      })

      const history = (await (
        await fetch(`${server.base}/api/content/page/${id}/history`, { headers })
      ).json()) as { data: readonly VersionSummary[] }
      const oldest = history.data.at(-1)
      const live = history.data.find((v) => v.live)
      if (oldest === undefined || live === undefined) throw new Error('no history to work from')

      const diff = (await (
        await fetch(
          `${server.base}/api/content/page/${id}/diff?from=${oldest.version}&to=${live.version}`,
          { headers },
        )
      ).json()) as {
        data: {
          readonly fields: readonly {
            readonly field: string
            readonly words?: readonly { readonly op: string; readonly text: string }[]
          }[]
        }
      }
      const titleChange = diff.data.fields.find((change) => change.field === 'title')
      expect(titleChange?.words).toBeDefined()
      const removed = titleChange?.words?.filter((word) => word.op === 'removed').map((w) => w.text)
      const added = titleChange?.words?.filter((word) => word.op === 'added').map((w) => w.text)
      expect(removed).toEqual(['brown'])
      expect(added).toEqual(['red'])
    } finally {
      await server.stop()
    }
  })

  it('restores an earlier version, then undoes the restore by restoring the version that was live before it', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const token = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

      const created = (await (
        await fetch(`${server.base}/api/content/page`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ values: { title: 'First title', slug: 'undo-restore' } }),
        })
      ).json()) as { data: Entry }
      const id = created.data.id

      await fetch(`${server.base}/api/content/page/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ values: { title: 'Second title' } }),
      })

      const beforeRestore = (await (
        await fetch(`${server.base}/api/content/page/${id}/history`, { headers })
      ).json()) as { data: readonly VersionSummary[] }
      const liveBeforeRestore = beforeRestore.data.find((v) => v.live)
      const oldest = beforeRestore.data.at(-1)
      if (liveBeforeRestore === undefined || oldest === undefined) {
        throw new Error('no history to work from')
      }

      await fetch(`${server.base}/api/content/page/${id}/restore`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ version: oldest.version }),
      })

      const afterRestore = (await (
        await fetch(`${server.base}/api/content/page/${id}?state=working`, { headers })
      ).json()) as { data: Entry }
      expect(afterRestore.data.values.title).toBe('First title')

      // The undo: restore the version that was live right before the restore.
      // It is exactly what `VersionHistory`'s "Undo" action does, and it must
      // still be in the history — restoring never destroys anything (R6).
      const undone = (await (
        await fetch(`${server.base}/api/content/page/${id}/restore`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ version: liveBeforeRestore.version }),
        })
      ).json()) as { data: Entry }
      expect(undone.data.values.title).toBe('Second title')

      const readBack = (await (
        await fetch(`${server.base}/api/content/page/${id}?state=working`, { headers })
      ).json()) as { data: Entry }
      expect(readBack.data.values.title).toBe('Second title')

      // Both restores are real, separate versions — nothing was rewound.
      const finalHistory = (await (
        await fetch(`${server.base}/api/content/page/${id}/history`, { headers })
      ).json()) as { data: readonly VersionSummary[] }
      expect(finalHistory.data.length).toBeGreaterThanOrEqual(4)
    } finally {
      await server.stop()
    }
  })

  it('refuses history, diff and restore to an actor who may not read drafts', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const token = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

      const created = (await (
        await fetch(`${server.base}/api/content/page`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ values: { title: 'Private history', slug: 'private-history' } }),
        })
      ).json()) as { data: Entry }
      const id = created.data.id

      // A published entry: even then the *history* is the list of drafts by
      // another name, so it stays behind the same permission.
      await fetch(`${server.base}/api/content/page/${id}/publish`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })

      expect((await fetch(`${server.base}/api/content/page/${id}/history`)).status).toBe(403)
      expect((await fetch(`${server.base}/api/content/page/${id}/diff?from=1&to=2`)).status).toBe(
        403,
      )
      const restore = await fetch(`${server.base}/api/content/page/${id}/restore`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: 1 }),
      })
      expect(restore.status).toBe(403)
    } finally {
      await server.stop()
    }
  })

  it('a restored version is re-indexed, so search reflects what was restored', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const token = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

      const created = (await (
        await fetch(`${server.base}/api/content/page`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ values: { title: 'Alpaca census', slug: 'census' } }),
        })
      ).json()) as { data: Entry }
      const id = created.data.id
      await fetch(`${server.base}/api/content/page/${id}/publish`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })
      await fetch(`${server.base}/api/content/page/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ values: { title: 'Llama census' } }),
      })
      await fetch(`${server.base}/api/content/page/${id}/publish`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })

      const history = (await (
        await fetch(`${server.base}/api/content/page/${id}/history`, { headers })
      ).json()) as { data: readonly VersionSummary[] }
      const oldest = history.data.at(-1)
      if (oldest === undefined) throw new Error('no history to restore from')

      await fetch(`${server.base}/api/content/page/${id}/restore`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ version: oldest.version }),
      })
      await fetch(`${server.base}/api/content/page/${id}/publish`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })

      const found = (await (await fetch(`${server.base}/api/search?q=alpaca`)).json()) as {
        data: readonly { readonly id: string }[]
      }
      expect(found.data.map((hit) => hit.id)).toEqual([id])
    } finally {
      await server.stop()
    }
  })
})
