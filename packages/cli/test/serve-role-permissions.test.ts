import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * `/api/role-permissions`, end to end, against a real running server (fiche
 * 63, ADR-0028). This is the acceptance bar the fiche itself sets: not "the
 * table can be written to", but "an admin writes an override and the very
 * next request already reasons about it — no restart — and the file stays
 * what a deployment cannot silently reopen".
 *
 * `article.read` is closed to `admin` only in the file, deliberately —
 * public visibility is entirely earned by an override in this test, so a
 * change actually observed on the public read path is proof the whole chain
 * (router → store → overlay.refresh() → PermissionLayer) really moved.
 */

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'article',
    labels: { singular: 'Article', plural: 'Articles' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
    },
    permissions: {
      read: ['admin'],
      create: ['admin'],
      update: ['admin'],
      delete: ['admin'],
      publish: ['admin'],
    },
  },
]

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-role-permissions-serve-'))
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

async function adminToken(root: string, base: string): Promise<string> {
  await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
  return loginWithMfaSetup(base, 'admin@example.com', 'correct horse battery staple')
}

async function editorToken(root: string, base: string): Promise<string> {
  await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
  return loginWithMfaSetup(base, 'editor@example.com', 'correct horse battery staple')
}

describe('cogenta serve — /api/role-permissions (fiche 63, ADR-0028)', () => {
  it('widens, then narrows, a role permission at runtime — with no restart and a real audit entry', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const admin = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

      const created = await fetch(`${server.base}/api/content/article`, {
        method: 'POST',
        headers: admin,
        body: JSON.stringify({ values: { title: 'Hello' } }),
      })
      expect(created.status).toBe(201)
      const {
        data: { id },
      } = (await created.json()) as { data: { id: string } }
      const published = await fetch(`${server.base}/api/content/article/${id}/publish`, {
        method: 'POST',
        headers: admin,
      })
      expect(published.status).toBe(200)

      // The file alone (`read: ['admin']`) refuses an anonymous read.
      const beforeAnonymous = await fetch(`${server.base}/api/content/article/${id}`)
      expect(beforeAnonymous.status).toBe(403)

      // An admin widens it in the database, without touching cogenta.schema.*.
      const widen = await fetch(`${server.base}/api/role-permissions`, {
        method: 'PUT',
        headers: admin,
        body: JSON.stringify({
          targetType: 'collection',
          targetName: 'article',
          action: 'read',
          roles: ['public'],
        }),
      })
      expect(widen.status).toBe(200)

      // The very next request — no restart — already sees it.
      const afterWiden = await fetch(`${server.base}/api/content/article/${id}`)
      expect(afterWiden.status).toBe(200)

      // The write is journaled unconditionally (task 2: "aucun changement de
      // permission sans... entrée d'audit systématique").
      const audit = await fetch(`${server.base}/api/audit?action=role_permission.set`, {
        headers: admin,
      })
      const auditBody = (await audit.json()) as {
        data: readonly { action: string; diff: unknown }[]
      }
      expect(auditBody.data).toHaveLength(1)
      expect(auditBody.data[0]?.diff).toMatchObject({ targetName: 'article', action: 'read' })

      // An admin narrows it again — an explicit "nobody" override, which
      // must actually deny everyone, including admin: the table is the
      // authority once it holds a row for this (collection, action), not
      // merely a widening mechanism.
      const narrow = await fetch(`${server.base}/api/role-permissions`, {
        method: 'PUT',
        headers: admin,
        body: JSON.stringify({
          targetType: 'collection',
          targetName: 'article',
          action: 'read',
          roles: [],
        }),
      })
      expect(narrow.status).toBe(200)

      const afterNarrow = await fetch(`${server.base}/api/content/article/${id}`, {
        headers: admin,
      })
      expect(afterNarrow.status).toBe(403)

      // Reverting to the file restores admin's own access — proving the
      // fallback direction really is table-then-file, not the other way.
      const reverted = await fetch(`${server.base}/api/role-permissions/collection/article/read`, {
        method: 'DELETE',
        headers: admin,
      })
      expect(reverted.status).toBe(200)
      const afterRevert = await fetch(`${server.base}/api/content/article/${id}`, {
        headers: admin,
      })
      expect(afterRevert.status).toBe(200)
    } finally {
      await server.stop()
    }
  })

  it('R4: refuses a non-admin role on every write route, over a real server', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await editorToken(root, server.base)
      const editor = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

      const get = await fetch(`${server.base}/api/role-permissions`, { headers: editor })
      expect(get.status).toBe(403)

      const put = await fetch(`${server.base}/api/role-permissions`, {
        method: 'PUT',
        headers: editor,
        body: JSON.stringify({
          targetType: 'collection',
          targetName: 'article',
          action: 'read',
          roles: ['public'],
        }),
      })
      expect(put.status).toBe(403)

      const del = await fetch(`${server.base}/api/role-permissions/collection/article/read`, {
        method: 'DELETE',
        headers: editor,
      })
      expect(del.status).toBe(403)
    } finally {
      await server.stop()
    }
  })
})
