import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * An entry written without a locale — by an agent, the MCP server or a
 * headless client — belongs to the site's default language. `cogenta serve`
 * built its stores without it, so a French site's API created English
 * entries its French pages never listed (found during the L36 page builder
 * audit).
 */

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'article',
    labels: { singular: 'Article', plural: 'Articles' },
    fields: { title: { kind: 'text', required: true, options: { max: 200 } } },
    permissions: {
      read: ['public'],
      create: ['editor'],
      update: ['editor'],
      delete: ['editor'],
      publish: ['editor'],
    },
  },
]

const activeServers: AbortController[] = []

afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

describe('cogenta serve — default locale', () => {
  it("creates an entry sent without a locale in the site's default language", async () => {
    const root = await mkdtemp(join(tmpdir(), 'cogenta-default-locale-'))
    await writeFile(
      join(root, 'cogenta.config.mjs'),
      `export default {
  site: { name: 'Site', url: 'https://example.com', locales: ['fr', 'en'], defaultLocale: 'fr' },
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
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
    const token = await loginWithMfaSetup(
      server.base,
      'editor@example.com',
      'correct horse battery staple',
    )

    const created = await fetch(`${server.base}/api/content/article`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ values: { title: 'Bonjour' } }),
    })
    expect(created.status).toBe(201)
    const body = (await created.json()) as { data: { locale: string } }
    expect(body.data.locale).toBe('fr')
  })
})
