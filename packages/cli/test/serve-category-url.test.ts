import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * The category in the address of an entry (`schema@2.5`): an article filed
 * under "DevOps" is served at `/blog/devops/<slug>` (`/en/blog/devops/<slug>`
 * in English), the segment being the slug of its term. Every address that
 * worked before — and every wrong one — answers with a 301 to the canonical
 * address, never a second 200.
 */

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-category-url-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Categories', url: 'https://example.com', locales: ['fr', 'en'], defaultLocale: 'fr' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
}
`,
    'utf8',
  )
  const permissions = `{ read: ['public'], create: ['editor'], update: ['editor'], publish: ['editor'], delete: ['editor'] }`
  await writeFile(
    join(root, 'cogenta.schema.mjs'),
    `export const taxonomies = [
  {
    name: 'rubrique',
    labels: { singular: { fr: 'Rubrique', en: 'Category' } },
    hierarchical: false,
    permissions: ${permissions},
  },
]

export default [
  {
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug', locale: true },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title' } },
    },
    permissions: ${permissions},
  },
  {
    name: 'post',
    labels: { singular: 'Post', plural: 'Posts' },
    routing: { pattern: '/blog/:category/:slug', locale: true },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title' } },
      category: { kind: 'taxonomy', options: { of: 'rubrique', many: false } },
    },
    permissions: ${permissions},
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

async function created(response: Response): Promise<string> {
  expect(response.status).toBe(201)
  return ((await response.json()) as { data: { id: string } }).data.id
}

async function publishEntry(
  base: string,
  token: string,
  collection: string,
  body: Record<string, unknown>,
): Promise<string> {
  const id = await created(
    await fetch(`${base}/api/content/${collection}`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify(body),
    }),
  )
  const published = await fetch(`${base}/api/content/${collection}/${id}/publish`, {
    method: 'POST',
    headers: auth(token),
  })
  expect(published.status).toBe(200)
  return id
}

interface Fixture {
  readonly base: string
  readonly token: string
  readonly devops: string
  readonly cloud: string
  readonly articleFr: string
  readonly stop: () => Promise<void>
  moved(path: string): Promise<{ status: number; location: string | null }>
}

async function categorisedSite(): Promise<Fixture> {
  const root = await project()
  const server = await startServer(root, { registry: activeServers })
  await createUser(root, 'admin@example.com', 'correct-horse-battery', ['admin', 'editor'])
  const token = await loginWithMfaSetup(server.base, 'admin@example.com', 'correct-horse-battery')

  const term = async (slug: string, label: string): Promise<string> =>
    created(
      await fetch(`${server.base}/api/taxonomies/rubrique`, {
        method: 'POST',
        headers: auth(token),
        body: JSON.stringify({ slug, labels: { fr: label, en: label } }),
      }),
    )
  const devops = await term('devops', 'DevOps')
  const cloud = await term('cloud', 'Cloud')

  await publishEntry(server.base, token, 'page', {
    values: { title: 'Accueil', slug: 'home' },
    locale: 'fr',
  })
  const articleFr = await publishEntry(server.base, token, 'post', {
    values: { title: 'Mon article', slug: 'mon-article', category: devops },
    locale: 'fr',
  })
  await publishEntry(server.base, token, 'post', {
    values: { title: 'My article', slug: 'my-article', category: devops },
    locale: 'en',
    translationOf: articleFr,
  })
  await publishEntry(server.base, token, 'post', {
    values: { title: 'Sans rubrique', slug: 'sans-rubrique' },
    locale: 'fr',
  })

  return {
    base: server.base,
    token,
    devops,
    cloud,
    articleFr,
    stop: server.stop,
    moved: async (path) => {
      const response = await fetch(`${server.base}${path}`, { redirect: 'manual' })
      return { status: response.status, location: response.headers.get('location') }
    },
  }
}

describe('the category in the address of an entry', () => {
  it('serves an article at /blog/<category>/<slug>, in each language', async () => {
    const site = await categorisedSite()
    try {
      const french = await fetch(`${site.base}/blog/devops/mon-article`)
      expect(french.status).toBe(200)
      expect(await french.text()).toContain('<html lang="fr"')

      const english = await fetch(`${site.base}/en/blog/devops/my-article`)
      expect(english.status).toBe(200)
      expect(await english.text()).toContain('<html lang="en"')
    } finally {
      await site.stop()
    }
  }, 90_000)

  it('answers the old address, a wrong category and a stray slash with a 301 to the canonical one', async () => {
    const site = await categorisedSite()
    try {
      expect(await site.moved('/blog/mon-article')).toEqual({
        status: 301,
        location: '/blog/devops/mon-article',
      })
      expect(await site.moved('/blog/cloud/mon-article')).toEqual({
        status: 301,
        location: '/blog/devops/mon-article',
      })
      expect(await site.moved('/en/blog/my-article')).toEqual({
        status: 301,
        location: '/en/blog/devops/my-article',
      })
      expect(await site.moved('/en/blog/cloud/my-article')).toEqual({
        status: 301,
        location: '/en/blog/devops/my-article',
      })
      // The query string travels with the redirect.
      expect(await site.moved('/blog/mon-article?utm_source=x')).toEqual({
        status: 301,
        location: '/blog/devops/mon-article?utm_source=x',
      })
    } finally {
      await site.stop()
    }
  }, 90_000)

  it('keeps an unknown slug a 404, whatever the category', async () => {
    const site = await categorisedSite()
    try {
      expect((await site.moved('/blog/devops/nope')).status).toBe(404)
      expect((await site.moved('/blog/nope')).status).toBe(404)
    } finally {
      await site.stop()
    }
  }, 90_000)

  it('serves an entry with no category at /blog/<slug> and redirects a category it does not have', async () => {
    const site = await categorisedSite()
    try {
      expect((await site.moved('/blog/sans-rubrique')).status).toBe(200)
      expect(await site.moved('/blog/devops/sans-rubrique')).toEqual({
        status: 301,
        location: '/blog/sans-rubrique',
      })
    } finally {
      await site.stop()
    }
  }, 90_000)

  it('names the canonical address in the canonical link, the hreflang pair and the sitemap', async () => {
    const site = await categorisedSite()
    try {
      const html = await (await fetch(`${site.base}/blog/devops/mon-article`)).text()
      expect(html).toContain(
        '<link rel="canonical" href="https://example.com/blog/devops/mon-article" />',
      )
      expect(html).toContain(
        '<link rel="alternate" hreflang="en" href="https://example.com/en/blog/devops/my-article" />',
      )

      const sitemap = await (await fetch(`${site.base}/sitemap.xml`)).text()
      expect(sitemap).toContain('<loc>https://example.com/blog/devops/mon-article</loc>')
      expect(sitemap).toContain('<loc>https://example.com/en/blog/devops/my-article</loc>')
      expect(sitemap).toContain('<loc>https://example.com/blog/sans-rubrique</loc>')
      expect(sitemap).not.toContain('<loc>https://example.com/blog/mon-article</loc>')
    } finally {
      await site.stop()
    }
  }, 90_000)

  it('links the entry from the term archive at its canonical address', async () => {
    const site = await categorisedSite()
    try {
      const archive = await (await fetch(`${site.base}/rubrique/devops`)).text()
      expect(archive).toContain('href="/blog/devops/mon-article"')
      expect(archive).not.toContain('href="/blog/mon-article"')
    } finally {
      await site.stop()
    }
  }, 90_000)

  it('moves the address with the entry: another category, a renamed term', async () => {
    const site = await categorisedSite()
    try {
      const update = await fetch(`${site.base}/api/content/post/${site.articleFr}`, {
        method: 'PUT',
        headers: auth(site.token),
        body: JSON.stringify({ values: { category: site.cloud } }),
      })
      expect(update.status).toBe(200)

      expect((await site.moved('/blog/cloud/mon-article')).status).toBe(200)
      expect(await site.moved('/blog/devops/mon-article')).toEqual({
        status: 301,
        location: '/blog/cloud/mon-article',
      })

      const rename = await fetch(`${site.base}/api/taxonomies/rubrique/${site.cloud}`, {
        method: 'PATCH',
        headers: auth(site.token),
        body: JSON.stringify({ slug: 'infrastructure' }),
      })
      expect(rename.status).toBe(200)
      expect(await site.moved('/blog/cloud/mon-article')).toEqual({
        status: 301,
        location: '/blog/infrastructure/mon-article',
      })
      expect((await site.moved('/blog/infrastructure/mon-article')).status).toBe(200)
    } finally {
      await site.stop()
    }
  }, 90_000)

  it('sends the visitor of the old address to the new one when category and slug change together', async () => {
    const site = await categorisedSite()
    try {
      const update = await fetch(`${site.base}/api/content/post/${site.articleFr}`, {
        method: 'PUT',
        headers: auth(site.token),
        body: JSON.stringify({ values: { slug: 'nouveau-titre', category: site.cloud } }),
      })
      expect(update.status).toBe(200)

      expect(await site.moved('/blog/devops/mon-article')).toEqual({
        status: 301,
        location: '/blog/cloud/nouveau-titre',
      })
    } finally {
      await site.stop()
    }
  }, 90_000)
})
