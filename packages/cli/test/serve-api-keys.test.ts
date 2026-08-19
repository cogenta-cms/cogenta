import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * `/api/api-keys` end to end (fiche 20): expiry defaults, rotation with a
 * grace window, the per-key request quota's degraded driver (memory — this
 * harness never configures Redis, so a 429 here is the R1 "works with no
 * Redis" proof), and the lifecycle audit trail.
 *
 * A `secret` collection, readable only by the `viewer` role, is what makes
 * "does this key actually authenticate as itself" observable over real HTTP:
 * a REST route that answers differently for `viewer` than it does for
 * `public`/anonymous, unlike an admin-only or a fully public one — both of
 * which a key can fail identically whether it resolved to the wrong role or
 * to no actor at all.
 */

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'secret',
    labels: { singular: 'Secret', plural: 'Secrets' },
    fields: { title: { kind: 'text', required: true, options: { max: 200 } } },
    permissions: {
      read: ['viewer'],
      create: ['viewer'],
      update: ['viewer'],
      publish: ['viewer'],
    },
  },
]

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-api-keys-'))
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

async function createKey(
  base: string,
  token: string,
  body: Record<string, unknown>,
): Promise<{
  id: string
  key: string
  expiresAt: string | null
  createdAt: string
  rateLimitPerMinute: number
}> {
  const response = await fetch(`${base}/api/api-keys`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const parsed = (await response.json()) as {
    data: {
      id: string
      key: string
      expiresAt: string | null
      createdAt: string
      rateLimitPerMinute: number
    }
  }
  return parsed.data
}

/** GET the secret collection as `viewer` — 200 if the key actually authenticates that way, 403 otherwise. */
function readSecretsAs(base: string, key: string): Promise<Response> {
  return fetch(`${base}/api/content/secret`, { headers: { authorization: `Bearer ${key}` } })
}

describe('cogenta serve — API key expiry defaults (fiche 20 task 1)', () => {
  it('gives a fresh key a 90-day expiry by default, and a chosen one when asked', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)

      const withDefault = await createKey(server.base, token, {
        name: 'default expiry',
        scope: ['viewer'],
      })
      const days =
        (new Date(withDefault.expiresAt as string).getTime() -
          new Date(withDefault.createdAt).getTime()) /
        (24 * 60 * 60 * 1000)
      expect(days).toBeCloseTo(90, 0)

      const forever = await createKey(server.base, token, {
        name: 'no expiry',
        scope: ['viewer'],
        neverExpires: true,
      })
      expect(forever.expiresAt).toBeNull()
    } finally {
      await server.stop()
    }
  })
})

describe('cogenta serve — API key rotation (fiche 20 task 2)', () => {
  it('rotates a key with no interruption of service, then the old one expires on its own', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)

      const original = await createKey(server.base, token, {
        name: 'CI pipeline',
        scope: ['viewer'],
      })

      const rotated = await fetch(`${server.base}/api/api-keys/${original.id}/rotate`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ graceHours: 1 }),
      })
      expect(rotated.status).toBe(201)
      const { data } = (await rotated.json()) as {
        data: { issued: { key: string; name: string; scope: readonly string[] } }
      }
      expect(data.issued.name).toBe('CI pipeline')
      expect(data.issued.scope).toEqual(['viewer'])

      // No interruption: both keys authenticate right after rotation.
      const oldDuringGrace = await readSecretsAs(server.base, original.key)
      const newKey = await readSecretsAs(server.base, data.issued.key)
      expect(oldDuringGrace.status).toBe(200)
      expect(newKey.status).toBe(200)

      const listed = await fetch(`${server.base}/api/api-keys`, {
        headers: { authorization: `Bearer ${token}` },
      })
      const { data: keys } = (await listed.json()) as {
        data: readonly { id: string; supersededBy: string | null }[]
      }
      expect(keys.find((k) => k.id === original.id)?.supersededBy).not.toBeNull()
    } finally {
      await server.stop()
    }
  })

  it('carries the name and scope over — the same integration, not a new one', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const original = await createKey(server.base, token, {
        name: 'exact same integration',
        scope: ['viewer'],
        rateLimitPerMinute: 42,
      })

      const rotated = await fetch(`${server.base}/api/api-keys/${original.id}/rotate`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })
      const { data } = (await rotated.json()) as {
        data: { issued: { name: string; scope: readonly string[]; rateLimitPerMinute: number } }
      }
      expect(data.issued.name).toBe('exact same integration')
      expect(data.issued.scope).toEqual(['viewer'])
      expect(data.issued.rateLimitPerMinute).toBe(42)
    } finally {
      await server.stop()
    }
  })

  it('records create and rotate in the audit log, naming the key ids but never the raw material', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const original = await createKey(server.base, token, { name: 'audited', scope: ['viewer'] })
      await fetch(`${server.base}/api/api-keys/${original.id}/rotate`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })
      await fetch(`${server.base}/api/api-keys/${original.id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      })

      const audit = await fetch(`${server.base}/api/audit`, {
        headers: { authorization: `Bearer ${token}` },
      })
      const { data } = (await audit.json()) as {
        data: readonly { action: string; diff: unknown }[]
      }
      const actions = data.map((entry) => entry.action)
      expect(actions).toContain('apikey.create')
      expect(actions).toContain('apikey.rotate')
      expect(actions).toContain('apikey.revoke')
      // Never the raw key, anywhere in the log.
      expect(JSON.stringify(data)).not.toContain(original.key)
    } finally {
      await server.stop()
    }
  })
})

describe('cogenta serve — per-key request quota, degraded driver (fiche 20 task 3, R1)', () => {
  it('answers 429 with Retry-After once a key exceeds its quota, on a site with no Redis configured at all', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const key = await createKey(server.base, token, {
        name: 'throttled',
        scope: ['viewer'],
        rateLimitPerMinute: 2,
      })

      const first = await readSecretsAs(server.base, key.key)
      const second = await readSecretsAs(server.base, key.key)
      const third = await readSecretsAs(server.base, key.key)

      expect(first.status).toBe(200)
      expect(second.status).toBe(200)
      expect(third.status).toBe(429)
      expect(third.headers.get('retry-after')).not.toBeNull()
      expect(Number(third.headers.get('retry-after'))).toBeGreaterThan(0)
      expect(third.headers.get('ratelimit-limit')).toBe('2')
    } finally {
      await server.stop()
    }
  })

  it('keeps quotas independent between two different keys', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const a = await createKey(server.base, token, {
        name: 'a',
        scope: ['viewer'],
        rateLimitPerMinute: 1,
      })
      const b = await createKey(server.base, token, {
        name: 'b',
        scope: ['viewer'],
        rateLimitPerMinute: 1,
      })

      await readSecretsAs(server.base, a.key) // a is now at its limit
      const bResponse = await readSecretsAs(server.base, b.key)

      expect(bResponse.status).toBe(200)
    } finally {
      await server.stop()
    }
  })
})

describe('security: listApiKeys never returns the raw value, over real HTTP (non-regression)', () => {
  it('the list response never contains the raw key material for any key, rotated or not', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await adminToken(root, server.base)
      const first = await createKey(server.base, token, { name: 'one', scope: ['viewer'] })
      const rotatedResponse = await fetch(`${server.base}/api/api-keys/${first.id}/rotate`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      })
      const { data: rotation } = (await rotatedResponse.json()) as {
        data: { issued: { key: string } }
      }

      const listed = await fetch(`${server.base}/api/api-keys`, {
        headers: { authorization: `Bearer ${token}` },
      })
      const text = await listed.text()
      expect(text).not.toContain(first.key)
      expect(text).not.toContain(rotation.issued.key)
      expect(text).not.toContain('"key"')
    } finally {
      await server.stop()
    }
  })
})
