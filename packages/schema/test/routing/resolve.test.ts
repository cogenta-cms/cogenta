import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRedirectStore, type RedirectStore } from '../../src/routing/redirects.js'
import { resolveUrl } from '../../src/routing/resolve.js'
import type { CollectionDefinition } from '../../src/types.js'

const article: CollectionDefinition = {
  name: 'article',
  labels: { singular: 'Article', plural: 'Articles' },
  routing: { pattern: '/blog/:slug', locale: true },
  fields: {},
  permissions: { read: ['public'] },
}

describe('resolving a URL', () => {
  let db: DatabaseHandle
  let redirects: RedirectStore

  /** Stands in for the persistence layer: two published articles. */
  const stored = new Set(['fr:bonjour', 'en:hello'])

  beforeEach(async () => {
    db = await createSqliteHandle({ url: ':memory:' })
    redirects = createRedirectStore({ db })
  })

  afterEach(async () => {
    await db.close()
  })

  async function resolve(path: string) {
    return resolveUrl(path, {
      collections: [article],
      redirects,
      locales: ['fr', 'en'],
      defaultLocale: 'en',
      lookup: async (match) =>
        stored.has(`${match.locale ?? ''}:${match.params.slug ?? ''}`) ? { id: 'x' } : null,
    })
  }

  it('finds the entry behind a locale-prefixed URL', async () => {
    await expect(resolve('/fr/blog/bonjour')).resolves.toMatchObject({
      kind: 'entry',
      match: { collection: 'article', locale: 'fr', params: { slug: 'bonjour' } },
    })
  })

  it('finds the entry behind an unprefixed URL in the default locale', async () => {
    await expect(resolve('/blog/hello')).resolves.toMatchObject({
      kind: 'entry',
      match: { collection: 'article', locale: 'en', params: { slug: 'hello' } },
    })
  })

  it('redirects a URL whose entry has moved', async () => {
    await redirects.add({ from: '/fr/blog/ancien', to: '/fr/blog/bonjour' })

    await expect(resolve('/fr/blog/ancien')).resolves.toEqual({
      kind: 'redirect',
      to: '/fr/blog/bonjour',
      status: 301,
    })
  })

  it('serves the entry rather than a stale redirect when both exist', async () => {
    // A rule left behind by an import, pointing away from a URL that is live.
    await redirects.add({ from: '/fr/blog/bonjour', to: '/fr/blog/autre' })

    await expect(resolve('/fr/blog/bonjour')).resolves.toMatchObject({ kind: 'entry' })
  })

  it('is a 404 when nothing matches and nothing redirects', async () => {
    await expect(resolve('/fr/blog/jamais-vu')).resolves.toEqual({ kind: 'notFound' })
  })

  it('is a 404 when the path is not a route at all', async () => {
    await expect(resolve('/wp-admin/index.php')).resolves.toEqual({ kind: 'notFound' })
  })
})
