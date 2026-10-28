import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * The pages the host owns — search, taxonomy archives, the 404 — and the
 * canonical address of a page, on a bilingual site (0.22.0 end-to-end
 * campaign, D9, D10, D11 and D16). French is the default language and is
 * served unprefixed; English lives under `/en/`.
 */

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-locale-routing-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Bilingual', url: 'https://example.com', locales: ['fr', 'en'], defaultLocale: 'fr' },
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
    name: 'categorie',
    labels: { singular: { fr: 'Catégorie', en: 'Category' } },
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
    name: 'article',
    labels: { singular: 'Article', plural: 'Articles' },
    routing: { pattern: '/blog/:slug', locale: true },
    fields: {
      title: { kind: 'text', required: true, options: { max: 200 } },
      slug: { kind: 'slug', required: true, options: { from: 'title' } },
      topics: { kind: 'taxonomy', options: { of: 'categorie', many: true } },
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
  readonly stop: () => Promise<void>
}

async function bilingualSite(): Promise<Fixture> {
  const root = await project()
  const server = await startServer(root, { registry: activeServers })
  await createUser(root, 'admin@example.com', 'correct-horse-battery', ['admin', 'editor'])
  const token = await loginWithMfaSetup(server.base, 'admin@example.com', 'correct-horse-battery')

  const term = await created(
    await fetch(`${server.base}/api/taxonomies/categorie`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ slug: 'ia', labels: { fr: 'Intelligence artificielle', en: 'AI' } }),
    }),
  )

  const homeFr = await publishEntry(server.base, token, 'page', {
    values: { title: 'Accueil', slug: 'home' },
    locale: 'fr',
  })
  await publishEntry(server.base, token, 'page', {
    values: { title: 'Welcome', slug: 'home' },
    locale: 'en',
    translationOf: homeFr,
  })
  const articleFr = await publishEntry(server.base, token, 'article', {
    values: { title: 'Petits modèles', slug: 'petits-modeles', topics: [term] },
    locale: 'fr',
  })
  await publishEntry(server.base, token, 'article', {
    values: { title: 'Small models', slug: 'small-models', topics: [term] },
    locale: 'en',
    translationOf: articleFr,
  })
  for (const body of [
    { area: 'sidebar', type: 'search', title: 'Find' },
    { area: 'sidebar', type: 'terms', title: 'Topics', settings: { taxonomy: 'categorie' } },
  ]) {
    const widget = await fetch(`${server.base}/api/widgets`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify(body),
    })
    expect(widget.status).toBe(201)
  }
  return { base: server.base, stop: server.stop }
}

describe('the search page, per language (D9)', () => {
  it('serves /en/search in English, searches the English entries and posts to itself', async () => {
    const site = await bilingualSite()
    try {
      const english = await fetch(`${site.base}/en/search?q=models`)
      expect(english.status).toBe(200)
      const html = await english.text()
      expect(html).toContain('<html lang="en"')
      expect(html).toContain('Small models')
      expect(html).not.toContain('Petits modèles')
      expect(html).toContain('action="/en/search"')
      expect(html).toContain('Search results for')

      // The search widget of an English page posts to the English search.
      const page = await (await fetch(`${site.base}/en/blog/small-models`)).text()
      expect(page).toContain('action="/en/search"')
      expect(page).not.toContain('action="/search"')

      const french = await (await fetch(`${site.base}/search?q=petits`)).text()
      expect(french).toContain('<html lang="fr"')
      expect(french).toContain('Petits modèles')
      expect(french).toContain('action="/search"')
    } finally {
      await site.stop()
    }
  }, 90_000)
})

describe('the taxonomy archive, per language (D11)', () => {
  it("lists each language's entries with its own labels, links and hreflang pair", async () => {
    const site = await bilingualSite()
    try {
      const french = await (await fetch(`${site.base}/categorie/ia`)).text()
      expect(french).toContain('Intelligence artificielle')
      expect(french).toContain('Petits modèles')
      expect(french).not.toContain('Small models')
      expect(french).toContain(
        '<link rel="alternate" hreflang="en" href="https://example.com/en/categorie/ia">',
      )

      const response = await fetch(`${site.base}/en/categorie/ia`)
      expect(response.status).toBe(200)
      const english = await response.text()
      expect(english).toContain('<html lang="en"')
      expect(english).toContain('>AI<')
      expect(english).toContain('Small models')
      expect(english).not.toContain('Petits modèles')
      expect(english).toContain('href="/en/blog/small-models"')
      expect(english).toContain('<link rel="canonical" href="https://example.com/en/categorie/ia">')
      expect(english).toContain(
        '<link rel="alternate" hreflang="fr" href="https://example.com/categorie/ia">',
      )
      // The machine name of the taxonomy is an address, not a word to print.
      expect(english).not.toMatch(/>categorie</)

      // The chips of an English entry lead to the English archive.
      const entry = await (await fetch(`${site.base}/en/blog/small-models`)).text()
      expect(entry).toContain('href="/en/categorie/ia"')
      const entryFr = await (await fetch(`${site.base}/blog/petits-modeles`)).text()
      expect(entryFr).toContain('href="/categorie/ia"')
      // So does the topics widget.
      expect(entry).toMatch(/href="\/en\/categorie\/ia"[^>]*>\s*AI/u)

      const sitemap = await (await fetch(`${site.base}/sitemap.xml`)).text()
      expect(sitemap).toContain('<loc>https://example.com/categorie/ia</loc>')
      expect(sitemap).toContain('<loc>https://example.com/en/categorie/ia</loc>')
    } finally {
      await site.stop()
    }
  }, 90_000)
})

describe('the 404 page, per language (D10)', () => {
  it('answers in the language of the path', async () => {
    const site = await bilingualSite()
    try {
      const english = await fetch(`${site.base}/en/nope-404`)
      expect(english.status).toBe(404)
      const html = await english.text()
      expect(html).toContain('<html lang="en"')
      expect(html).toContain('This page could not be found')
      expect(html).toContain('action="/en/search"')
      expect(html).toContain('href="/en/"')

      const french = await (await fetch(`${site.base}/nope-404`)).text()
      expect(french).toContain('<html lang="fr"')
      expect(french).toContain('Cette page est introuvable')
    } finally {
      await site.stop()
    }
  }, 90_000)
})

describe('one address per page (D16)', () => {
  it('redirects the duplicate addresses permanently, query string kept', async () => {
    const site = await bilingualSite()
    try {
      const moved = async (path: string): Promise<{ status: number; location: string | null }> => {
        const response = await fetch(`${site.base}${path}`, { redirect: 'manual' })
        return { status: response.status, location: response.headers.get('location') }
      }
      expect(await moved('/en')).toEqual({ status: 301, location: '/en/' })
      expect(await moved('/fr')).toEqual({ status: 301, location: '/' })
      expect(await moved('/fr/')).toEqual({ status: 301, location: '/' })
      expect(await moved('/home')).toEqual({ status: 301, location: '/' })
      expect(await moved('/fr/home')).toEqual({ status: 301, location: '/' })
      expect(await moved('/en/home')).toEqual({ status: 301, location: '/en/' })
      expect(await moved('/blog/petits-modeles/')).toEqual({
        status: 301,
        location: '/blog/petits-modeles',
      })
      expect(await moved('/fr/blog/petits-modeles')).toEqual({
        status: 301,
        location: '/blog/petits-modeles',
      })
      expect(await moved('/en/blog/small-models/?utm=x')).toEqual({
        status: 301,
        location: '/en/blog/small-models?utm=x',
      })

      // The canonical addresses are served, not redirected.
      for (const path of ['/', '/en/', '/blog/petits-modeles', '/en/blog/small-models']) {
        expect((await moved(path)).status, path).toBe(200)
      }
    } finally {
      await site.stop()
    }
  }, 90_000)
})
