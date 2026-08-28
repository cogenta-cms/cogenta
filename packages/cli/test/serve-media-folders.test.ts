import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * `cogenta serve`'s own wiring for fiche 46, end to end against a real
 * server and a real SQLite database — not just the router (already covered
 * by `packages/api/test/rest/media-folder-router.test.ts`) or the admin's
 * simulated fetch (`packages/admin/test/media.test.tsx`).
 *
 * Two things only a real server proves: the idempotent `contents` root
 * bootstrap this fiche added to `cogenta serve`'s own startup (never
 * exercised by a router built directly in a test), and `recordMediaAudit`'s
 * new six-way branch — real business logic this fiche wrote, deciding what
 * a folder create/rename/move/delete and an asset move/bulk-move land in
 * the audit log as. A wrong branch here does not throw; it just journals
 * the wrong action name, which only a real read of `/api/audit` catches.
 */

// A 1x1 transparent PNG, real magic bytes — the same fixture the router's
// own test suite uses, since `verifyRealType` sniffs bytes, not the
// declared MIME type.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-media-folders-serve-'))
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
  await writeFile(join(root, 'cogenta.schema.mjs'), 'export default []\n', 'utf8')
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

interface AuditEntry {
  readonly action: string
  readonly entryId: string | null
}

async function auditActions(base: string, admin: Record<string, string>): Promise<AuditEntry[]> {
  const response = await fetch(`${base}/api/audit`, { headers: admin })
  const body = (await response.json()) as { data: readonly AuditEntry[] }
  return [...body.data]
}

describe('cogenta serve — media folders (fiche 46)', () => {
  it('bootstraps a default "contents" root folder on startup', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const admin = { authorization: `Bearer ${token}` }

      const response = await fetch(`${server.base}/api/media/folders`, { headers: admin })
      expect(response.status).toBe(200)
      const body = (await response.json()) as { data: readonly { name: string }[] }
      expect(body.data.map((folder) => folder.name)).toContain('contents')
    } finally {
      await server.stop()
    }
  })

  it('journals folder create/rename/move/delete and asset move/bulk-move under their own audit actions', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const admin = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

      const created = await fetch(`${server.base}/api/media/folders`, {
        method: 'POST',
        headers: admin,
        body: JSON.stringify({ name: 'Docs' }),
      })
      expect(created.status).toBe(201)
      const { data: folder } = (await created.json()) as { data: { id: string } }

      const renamed = await fetch(`${server.base}/api/media/folders/${folder.id}`, {
        method: 'PATCH',
        headers: admin,
        body: JSON.stringify({ name: 'Documents' }),
      })
      expect(renamed.status).toBe(200)

      const sibling = await fetch(`${server.base}/api/media/folders`, {
        method: 'POST',
        headers: admin,
        body: JSON.stringify({ name: 'Archive' }),
      })
      const { data: archiveFolder } = (await sibling.json()) as { data: { id: string } }

      const moved = await fetch(`${server.base}/api/media/folders/${folder.id}/move`, {
        method: 'POST',
        headers: admin,
        body: JSON.stringify({ parentId: archiveFolder.id }),
      })
      expect(moved.status).toBe(200)

      // A real asset, uploaded through the same legacy JSON path a headless
      // client (or, honestly, this admin's own upload form) uses.
      const uploaded = await fetch(`${server.base}/api/media`, {
        method: 'POST',
        headers: admin,
        body: JSON.stringify({
          kind: 'image',
          filename: 'a.png',
          mimeType: 'image/png',
          data: PNG_BASE64,
          alt: 'A single transparent pixel',
        }),
      })
      expect(uploaded.status).toBe(201)
      const { data: asset } = (await uploaded.json()) as { data: { id: string } }

      const assetMoved = await fetch(`${server.base}/api/media/${asset.id}/move`, {
        method: 'POST',
        headers: admin,
        body: JSON.stringify({ folderId: folder.id }),
      })
      expect(assetMoved.status).toBe(200)

      // The library, filtered to that folder, actually finds it — proving
      // the whole chain (router → real `MediaStore` → real SQLite column),
      // not just that the move call itself returned 200.
      const filtered = await fetch(
        `${server.base}/api/media?folderId=${encodeURIComponent(folder.id)}`,
        { headers: admin },
      )
      const filteredBody = (await filtered.json()) as { data: readonly { id: string }[] }
      expect(filteredBody.data.map((item) => item.id)).toEqual([asset.id])

      const bulkMoved = await fetch(`${server.base}/api/media/-/bulk-move`, {
        method: 'POST',
        headers: admin,
        body: JSON.stringify({ ids: [asset.id], folderId: null }),
      })
      expect(bulkMoved.status).toBe(200)

      // Empty again (the asset moved out) — the delete this fiche's own
      // `MEDIA_FOLDER_NOT_EMPTY` guard would otherwise have refused.
      const deleted = await fetch(`${server.base}/api/media/folders/${folder.id}`, {
        method: 'DELETE',
        headers: admin,
      })
      expect(deleted.status).toBe(204)

      // The same id carries four different actions across this test
      // (create, rename, move, delete) — a `Map` keyed by id would only
      // keep the last one, so each is checked as its own `some()`.
      const entries = await auditActions(server.base, admin)
      const hasAction = (entryId: string, action: string): boolean =>
        entries.some((entry) => entry.entryId === entryId && entry.action === action)

      expect(hasAction(folder.id, 'media_folder.create')).toBe(true)
      expect(hasAction(folder.id, 'media_folder.update')).toBe(true)
      expect(hasAction(folder.id, 'media_folder.move')).toBe(true)
      expect(hasAction(folder.id, 'media_folder.delete')).toBe(true)
      expect(hasAction(asset.id, 'media.move')).toBe(true)
      // `bulk-move` names no single id (`recordMediaAudit`'s own documented
      // limit — see `BLOCKERS.md` § fiche 46): it still lands under its own
      // action name rather than falling into the generic `media.upload`
      // branch a plain path-segment read would have produced.
      expect(entries.some((entry) => entry.action === 'media.bulk_move')).toBe(true)
    } finally {
      await server.stop()
    }
  })
})
