import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { startServer } from './helpers/serve-harness.js'

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-security-txt-'))
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

const CONTACT = 'Contact: mailto:security@example.com\nExpires: 2027-10-26T00:00:00.000Z\n'

describe('cogenta serve — /.well-known/security.txt', () => {
  it("serves the site's own file as plain text", async () => {
    const root = await project()
    await mkdir(join(root, 'public', '.well-known'), { recursive: true })
    await writeFile(join(root, 'public', '.well-known', 'security.txt'), CONTACT, 'utf8')
    const server = await startServer(root, { registry: activeServers })
    try {
      const response = await fetch(`${server.base}/.well-known/security.txt`)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
      expect(await response.text()).toBe(CONTACT)
    } finally {
      await server.stop()
    }
  })

  it('falls back to a security.txt at the project root', async () => {
    const root = await project()
    await writeFile(join(root, 'security.txt'), CONTACT, 'utf8')
    const server = await startServer(root, { registry: activeServers })
    try {
      const response = await fetch(`${server.base}/.well-known/security.txt`)
      expect(response.status).toBe(200)
      expect(await response.text()).toBe(CONTACT)
    } finally {
      await server.stop()
    }
  })

  it('answers 404, never a contact of its own, when the site has no such file', async () => {
    const server = await startServer(await project(), { registry: activeServers })
    try {
      const response = await fetch(`${server.base}/.well-known/security.txt`)
      expect(response.status).toBe(404)
      expect(await response.text()).not.toContain('Contact:')
    } finally {
      await server.stop()
    }
  })
})
