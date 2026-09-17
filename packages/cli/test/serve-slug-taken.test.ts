import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * A slug another entry already holds in the same language reached the admin
 * as a 500 (`DB_UNREACHABLE`, the index's own refusal) naming no field (found
 * during the L36 page builder audit). It is a 409 naming `slug`.
 */

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'article',
    labels: { singular: 'Article', plural: 'Articles' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', unique: true, options: { from: 'title' } },
    },
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

describe('cogenta serve — a slug already in use', () => {
  it('refuses it with a conflict that names the field', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cogenta-slug-taken-'))
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

    const create = () =>
      fetch(`${server.base}/api/content/article`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ values: { title: 'Contact', slug: 'contact' } }),
      })
    expect((await create()).status).toBe(201)
    const second = await create()
    expect(second.status).toBe(409)
    const body = (await second.json()) as { error: { code: string; field?: string } }
    expect(body.error).toMatchObject({ code: 'CONTENT_SLUG_TAKEN', field: 'slug' })
  })
})
