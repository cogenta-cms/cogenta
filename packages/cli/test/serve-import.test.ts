import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * `POST /api/import/wordpress`, end to end: the admin's counterpart to
 * `cogenta import wordpress` on a terminal, exercised against a real running
 * server and a real SQLite database — not the router in isolation, which
 * `packages/api/test/rest/import-router.test.ts` already covers with a
 * stubbed importer.
 *
 * The importer creates its own tables for the collections it needs
 * (`WORDPRESS_IMPORT_COLLECTIONS`, inside `importWordPress` itself), so the
 * site under test declares none of them in its own schema — proving the
 * route really calls the unmodified `@cogenta/import` package rather than
 * something that only works when the site happens to declare matching
 * collections.
 */

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title' } },
    },
    permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
  },
]

const MINIMAL_WXR = `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE rss>
<rss version="2.0"
  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
  <title>Old Blog</title>
  <link>http://old.example.com</link>
  <description>A classic-editor-only export</description>
  <language>en-US</language>
  <wp:wxr_version>1.2</wp:wxr_version>
  <wp:base_site_url>http://old.example.com</wp:base_site_url>
  <wp:base_blog_url>http://old.example.com</wp:base_blog_url>
  <wp:author>
    <wp:author_id>1</wp:author_id>
    <wp:author_login><![CDATA[editor]]></wp:author_login>
    <wp:author_email>editor@old.example.com</wp:author_email>
    <wp:author_display_name><![CDATA[Editor]]></wp:author_display_name>
  </wp:author>
  <item>
    <title>A note from the archives</title>
    <link>http://old.example.com/a-note-from-the-archives/</link>
    <pubDate>Mon, 05 Jan 2015 08:00:00 +0000</pubDate>
    <dc:creator><![CDATA[editor]]></dc:creator>
    <guid isPermaLink="false">http://old.example.com/?p=9</guid>
    <content:encoded><![CDATA[<p>Written years before Gutenberg existed. Plain &amp; simple HTML, with a <a href="http://example.com">link</a>.</p>]]></content:encoded>
    <excerpt:encoded><![CDATA[]]></excerpt:encoded>
    <wp:post_id>9</wp:post_id>
    <wp:post_date_gmt>2015-01-05 08:00:00</wp:post_date_gmt>
    <wp:post_name>a-note-from-the-archives</wp:post_name>
    <wp:status>publish</wp:status>
    <wp:post_type>post</wp:post_type>
  </item>
</channel>
</rss>
`

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-import-e2e-'))
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

describe('POST /api/import/wordpress', () => {
  it('refuses an editor — only the admin role may import content', async () => {
    const root = await project()
    await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
    const server = await startServer(root, { registry: activeServers })
    const token = await loginWithMfaSetup(
      server.base,
      'editor@example.com',
      'correct horse battery staple',
    )

    const response = await fetch(`${server.base}/api/import/wordpress`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        filename: 'export.xml',
        data: Buffer.from(MINIMAL_WXR, 'utf8').toString('base64'),
      }),
    })

    expect(response.status).toBe(403)
    await server.stop()
  })

  it('refuses an anonymous request', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })

    const response = await fetch(`${server.base}/api/import/wordpress`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        filename: 'export.xml',
        data: Buffer.from(MINIMAL_WXR, 'utf8').toString('base64'),
      }),
    })

    expect(response.status).toBe(403)
    await server.stop()
  })

  it('imports a real WXR file for an admin, and the post becomes real content', async () => {
    const root = await project()
    await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
    const server = await startServer(root, { registry: activeServers })
    const token = await loginWithMfaSetup(
      server.base,
      'admin@example.com',
      'correct horse battery staple',
    )

    const response = await fetch(`${server.base}/api/import/wordpress`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        filename: 'export.xml',
        data: Buffer.from(MINIMAL_WXR, 'utf8').toString('base64'),
      }),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      data: {
        imported: { posts: number; authors: number }
        skipped: readonly unknown[]
        warnings: readonly string[]
      }
    }
    expect(body.data.imported.posts).toBe(1)
    expect(body.data.imported.authors).toBe(1)

    // Real content: the imported post is a real row, on the exact store
    // `@cogenta/import` writes through — not routed through `/api/content`,
    // since the importer's collections (`wpPost` et al.) are created
    // straight into the database rather than declared in the site's own
    // schema, the same way the CLI's `import.test.ts` already treats them.
    const { createSqliteHandle } = await import('@cogenta/core')
    const { createContentStore } = await import('@cogenta/schema')
    const { wpPost } = await import('@cogenta/import')
    const db = await createSqliteHandle({ url: join(root, 'site.db') })
    const postStore = createContentStore({ db, collection: wpPost })
    const posts = await postStore.list({})
    expect(posts.items).toHaveLength(1)
    expect(posts.items[0]?.values.title).toBe('A note from the archives')
    await db.close()

    await server.stop()
  })

  it('rejects a request with no file', async () => {
    const root = await project()
    await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
    const server = await startServer(root, { registry: activeServers })
    const token = await loginWithMfaSetup(
      server.base,
      'admin@example.com',
      'correct horse battery staple',
    )

    const response = await fetch(`${server.base}/api/import/wordpress`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(response.status).toBe(400)
    await server.stop()
  })
})
