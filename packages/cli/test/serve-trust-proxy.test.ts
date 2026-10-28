import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, startServer } from './helpers/serve-harness.js'

/**
 * `security.trustProxy` against a real server, through the one consumer a
 * deployment feels first: the login limiter, which backs an account off per
 * calling address. Behind an ingress every socket is the ingress, so without
 * the setting five wrong passwords from one visitor would be five from
 * "everyone" — and with the setting wrongly believed, a visitor could pick a
 * fresh address per guess.
 */

async function project(security: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-trust-proxy-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Proxy site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
  security: ${security},
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

async function wrongPassword(base: string, headers: Record<string, string>): Promise<number> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ email: 'editor@example.com', password: 'definitely not the password' }),
  })
  await response.arrayBuffer()
  return response.status
}

/** Burns the five allowed failures from one address; the sixth is the refusal. */
async function exhaust(base: string, headers: Record<string, string>): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) await wrongPassword(base, headers)
}

describe('cogenta serve — security.trustProxy', () => {
  it('gives each visitor behind a trusted header their own login allowance', async () => {
    const root = await project('{ trustProxy: "cloudflare" }')
    await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
    const server = await startServer(root, { registry: activeServers })
    try {
      await exhaust(server.base, { 'cf-connecting-ip': '203.0.113.1' })
      expect(await wrongPassword(server.base, { 'cf-connecting-ip': '203.0.113.1' })).toBe(429)
      // Same socket, another visitor: not refused, only wrong.
      expect(await wrongPassword(server.base, { 'cf-connecting-ip': '203.0.113.2' })).toBe(401)
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('counts proxies from the right of x-forwarded-for, so a prepended address buys nothing', async () => {
    const root = await project('{ trustProxy: 1 }')
    await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
    const server = await startServer(root, { registry: activeServers })
    try {
      // The visitor invents a new left-hand entry every time; the proxy's
      // own, right-hand entry never changes.
      for (let attempt = 0; attempt < 5; attempt++) {
        await wrongPassword(server.base, {
          'x-forwarded-for': `10.9.9.${attempt}, 198.51.100.4`,
        })
      }
      expect(
        await wrongPassword(server.base, { 'x-forwarded-for': '10.9.9.99, 198.51.100.4' }),
      ).toBe(429)
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('ignores forwarding headers entirely by default', async () => {
    const root = await project('{}')
    await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
    const server = await startServer(root, { registry: activeServers })
    try {
      // A fresh claimed address on every attempt must not reset the count.
      for (let attempt = 0; attempt < 5; attempt++) {
        await wrongPassword(server.base, {
          'cf-connecting-ip': `203.0.113.${attempt + 10}`,
          'x-forwarded-for': `198.51.100.${attempt + 10}`,
        })
      }
      expect(
        await wrongPassword(server.base, {
          'cf-connecting-ip': '203.0.113.200',
          'x-forwarded-for': '198.51.100.200',
        }),
      ).toBe(429)
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('sends HSTS behind a proxy that terminated TLS, only when a hop count says whose word to take', async () => {
    const root = await project('{ trustProxy: 1, hstsMaxAge: 31536000 }')
    const server = await startServer(root, { registry: activeServers })
    try {
      const behindProxy = await fetch(`${server.base}/robots.txt`, {
        headers: { 'x-forwarded-proto': 'https' },
      })
      expect(behindProxy.headers.get('strict-transport-security')).toBe(
        'max-age=31536000; includeSubDomains',
      )
      await behindProxy.arrayBuffer()

      const plain = await fetch(`${server.base}/robots.txt`)
      expect(plain.headers.get('strict-transport-security')).toBeNull()
      await plain.arrayBuffer()
    } finally {
      await server.stop()
    }
  }, 60_000)
})
