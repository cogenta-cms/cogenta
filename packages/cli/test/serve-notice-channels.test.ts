import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * Fiche 38 tasks 2-4, against a real server: the notification centre
 * (history/read) and the channel settings routes (linking, preferences),
 * wired for the first time in `cogenta serve`'s `assembleSite`.
 */

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'article',
    labels: { singular: 'Article', plural: 'Articles' },
    fields: { title: { kind: 'text', required: true, options: { max: 200 } } },
    permissions: { read: ['public'] },
  },
]

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-notice-channels-'))
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

describe('cogenta serve — notice history', () => {
  it('records the MFA recommendation into history, findable after the board has moved on', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const headers = { authorization: `Bearer ${token}` }

      const board = await fetch(`${server.base}/api/notices`, { headers })
      expect(board.status).toBe(200)
      const boardBody = (await board.json()) as { data: Array<{ id: string }> }
      expect(boardBody.data.map((n) => n.id)).toContain('security.mfa-recommended')

      const history = await fetch(`${server.base}/api/notices/history`, { headers })
      expect(history.status).toBe(200)
      const historyBody = (await history.json()) as {
        data: Array<{ code: string; resolvedAt: string | null; readAt: string | null }>
      }
      const entry = historyBody.data.find((e) => e.code === 'security.mfa-recommended')
      expect(entry).toBeDefined()
      expect(entry?.resolvedAt).toBeNull()
      expect(entry?.readAt).toBeNull()
    } finally {
      await server.stop()
    }
  })

  it('marks the notification centre read with POST /api/notices/read', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const headers = { authorization: `Bearer ${token}` }

      await fetch(`${server.base}/api/notices`, { headers })
      const markRead = await fetch(`${server.base}/api/notices/read`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      expect(markRead.status).toBe(204)

      const history = await fetch(`${server.base}/api/notices/history`, { headers })
      const historyBody = (await history.json()) as { data: Array<{ readAt: string | null }> }
      expect(historyBody.data.every((entry) => entry.readAt !== null)).toBe(true)
    } finally {
      await server.stop()
    }
  })

  it('refuses an anonymous caller on both new routes', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const history = await fetch(`${server.base}/api/notices/history`)
      expect(history.status).toBe(401)

      const read = await fetch(`${server.base}/api/notices/read`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      expect(read.status).toBe(401)
    } finally {
      await server.stop()
    }
  })
})

describe('cogenta serve — notice channel settings', () => {
  it('starts with no linked channel', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const response = await fetch(`${server.base}/api/notices/channels`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(response.status).toBe(200)
      expect((await response.json()) as { data: unknown[] }).toEqual({ data: [] })
    } finally {
      await server.stop()
    }
  })

  it('generates a real linking code, and reads/writes preferences for that channel', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

      const codeResponse = await fetch(`${server.base}/api/notices/channels/telegram/link-code`, {
        method: 'POST',
        headers,
      })
      expect(codeResponse.status).toBe(201)
      const codeBody = (await codeResponse.json()) as { data: { code: string } }
      expect(codeBody.data.code).toMatch(/^[A-Z0-9]{8}$/)

      const prefsBody = {
        eventTypes: ['admin-notice'],
        minSeverity: 'warning',
        grouping: 'hourly',
        quietHours: null,
      }
      const put = await fetch(`${server.base}/api/notices/channels/telegram/preferences`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(prefsBody),
      })
      expect(put.status).toBe(200)

      const get = await fetch(`${server.base}/api/notices/channels/telegram/preferences`, {
        headers,
      })
      expect((await get.json()) as { data: unknown }).toEqual({ data: prefsBody })
    } finally {
      await server.stop()
    }
  })

  it('refuses an anonymous caller', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const response = await fetch(`${server.base}/api/notices/channels`)
      expect(response.status).toBe(401)
    } finally {
      await server.stop()
    }
  })
})
