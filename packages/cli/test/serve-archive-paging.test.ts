import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * Date archives past the first page of 100 entries. The archives widget and
 * the `/archive/{collection}/{year}` page walk the gateway page by page; both
 * passed the next position as `cursor`, which the gateway does not read (it
 * takes `after`), so every "next page" was the first page again. On a live
 * site with 116 posts the widget said 1000 for the year, its scan cap.
 */

const ARTICLES = 105

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-archive-paging-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Archive Site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
}
`,
    'utf8',
  )
  await writeFile(
    join(root, 'cogenta.schema.mjs'),
    `export default [
  {
    name: 'article',
    labels: { singular: 'Article', plural: 'Articles' },
    routing: { pattern: '/blog/:slug' },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title' } },
    },
    permissions: {
      read: ['public'],
      create: ['editor'],
      update: ['editor'],
      publish: ['editor'],
      delete: ['editor'],
    },
  },
]
`,
    'utf8',
  )
  return root
}

const activeServers: AbortController[] = []
afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

describe('date archives beyond one page of entries', () => {
  it('counts and lists every published entry once', { timeout: 120_000 }, async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    await createUser(root, 'admin@example.com', 'correct-horse-battery', ['admin', 'editor'])
    const token = await loginWithMfaSetup(server.base, 'admin@example.com', 'correct-horse-battery')

    for (let index = 0; index < ARTICLES; index += 1) {
      const created = await fetch(`${server.base}/api/content/article`, {
        method: 'POST',
        headers: auth(token),
        body: JSON.stringify({ values: { title: `Story ${index}`, slug: `story-${index}` } }),
      })
      expect(created.status).toBe(201)
      const id = ((await created.json()) as { data: { id: string } }).data.id
      const published = await fetch(`${server.base}/api/content/article/${id}/publish`, {
        method: 'POST',
        headers: auth(token),
      })
      expect(published.status).toBe(200)
    }

    const placed = await fetch(`${server.base}/api/widgets`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({
        area: 'sidebar',
        type: 'archives',
        title: 'By year',
        settings: { collection: 'article', granularity: 'year', showCounts: true },
      }),
    })
    expect(placed.status).toBe(201)

    const year = String(new Date().getUTCFullYear())
    const story = await (await fetch(`${server.base}/blog/story-0`)).text()
    const counts = [...story.matchAll(/class="cg-widget__archives-count"[^>]*>(\d+)</gu)].map(
      (match) => Number(match[1]),
    )
    expect(counts).toEqual([ARTICLES])

    // The archive page shows 12 entries a page: 105 entries are 9 pages, each
    // entry on exactly one of them, and a 10th page does not exist.
    const listed: string[] = []
    for (let page = 1; page <= 9; page += 1) {
      const archive = await fetch(`${server.base}/archive/article/${year}?page=${page}`)
      expect(archive.status).toBe(200)
      const html = await archive.text()
      const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'))
      const onPage = new Set(
        [...main.matchAll(/href="\/blog\/(story-\d+)"/gu)].map((match) => match[1] as string),
      )
      listed.push(...onPage)
    }
    expect(listed).toHaveLength(ARTICLES)
    expect(new Set(listed).size).toBe(ARTICLES)
    expect((await fetch(`${server.base}/archive/article/${year}?page=10`)).status).toBe(404)
  })
})
