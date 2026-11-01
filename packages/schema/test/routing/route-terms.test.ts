import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineCollection } from '../../src/define-collection.js'
import { defineTaxonomy } from '../../src/define-taxonomy.js'
import { f } from '../../src/fields.js'
import { createRedirectStore, type RedirectStore } from '../../src/routing/redirects.js'
import { routeParamsOf, taxonomySegments, termSegmentsOf } from '../../src/routing/route-terms.js'
import { buildPath, matchPath } from '../../src/routing/router.js'
import {
  type ContentLifecycleEvent,
  withLifecycleEvents,
} from '../../src/store/lifecycle-events.js'
import { withRedirectTracking } from '../../src/store/redirect-tracking.js'
import { createContentStore } from '../../src/store/store.js'
import { createSchemaTables, dropSchemaTables } from '../../src/store/tables.js'
import { createTaxonomyStore } from '../../src/store/taxonomy-store.js'
import { createTermSlugResolver } from '../../src/store/term-slugs.js'

/**
 * The category segment of an entry URL (`schema@2.5`): `/blog/:category/:slug`,
 * where `:category` is a single-valued taxonomy field and the segment is the
 * slug of the assigned term.
 */

const category = defineTaxonomy({
  name: 'route_category',
  labels: { singular: { en: 'Category' }, plural: { en: 'Categories' } },
  hierarchical: false,
  permissions: { read: ['public'] },
})

const post = defineCollection({
  name: 'route_post',
  labels: { singular: 'Post', plural: 'Posts' },
  routing: { pattern: '/blog/:category/:slug', locale: true },
  fields: {
    title: f.text({ required: true }),
    slug: f.slug({ from: 'title' }),
    category: f.taxonomy({ of: 'route_category', many: false }),
  },
  permissions: { read: ['public'] },
})

const options = { locales: ['fr', 'en'], defaultLocale: 'fr' }

describe('buildPath — a category segment', () => {
  it('puts the term slug between the prefix and the slug', () => {
    expect(buildPath(post, { category: 'devops', slug: 'hello' }, 'fr', options)).toBe(
      '/blog/devops/hello',
    )
    expect(buildPath(post, { category: 'devops', slug: 'hello' }, 'en', options)).toBe(
      '/en/blog/devops/hello',
    )
  })

  it('leaves the segment out for an entry that has no category', () => {
    expect(buildPath(post, { slug: 'hello' }, 'fr', options)).toBe('/blog/hello')
    expect(buildPath(post, { slug: 'hello', category: '' }, 'en', options)).toBe('/en/blog/hello')
  })

  it('still refuses a missing slug', () => {
    expect(() => buildPath(post, { category: 'devops' }, 'fr', options)).toThrow(/slug/u)
  })

  it('percent-encodes a slug that is not URL-safe', () => {
    expect(buildPath(post, { category: 'r&d', slug: 'a' }, 'fr', options)).toBe('/blog/r%26d/a')
  })
})

describe('matchPath — a category segment', () => {
  it('reads the category and the slug of the full address', () => {
    expect(matchPath([post], '/blog/devops/hello', options)).toEqual({
      collection: 'route_post',
      locale: 'fr',
      params: { category: 'devops', slug: 'hello' },
    })
    expect(matchPath([post], '/en/blog/devops/hello', options)?.locale).toBe('en')
  })

  it('also answers the address without the segment, with no category param', () => {
    expect(matchPath([post], '/blog/hello', options)).toEqual({
      collection: 'route_post',
      locale: 'fr',
      params: { slug: 'hello' },
    })
    expect(matchPath([post], '/en/blog/hello', options)?.params).toEqual({ slug: 'hello' })
  })

  it('decodes an encoded category', () => {
    expect(matchPath([post], '/blog/r%26d/a', options)?.params).toEqual({
      category: 'r&d',
      slug: 'a',
    })
  })

  it('does not match a path with the wrong number of segments', () => {
    expect(matchPath([post], '/blog', options)).toBeNull()
    expect(matchPath([post], '/blog/a/b/c', options)).toBeNull()
  })

  it('leaves a collection without a category segment strict', () => {
    const plain = defineCollection({
      name: 'route_plain',
      labels: { singular: 'Plain', plural: 'Plain' },
      routing: { pattern: '/p/:year/:slug' },
      fields: { year: f.text(), slug: f.slug({}) },
      permissions: { read: ['public'] },
    })
    expect(matchPath([plain], '/p/hello')).toBeNull()
  })
})

describe('taxonomySegments', () => {
  it('names only the single-valued taxonomy fields of the pattern', () => {
    expect([...taxonomySegments(post)]).toEqual([['category', 'route_category']])
  })
})

describe('defineCollection — a category segment', () => {
  it('refuses a taxonomy field that takes several terms', () => {
    expect(() =>
      defineCollection({
        name: 'route_many',
        labels: { singular: 'Post', plural: 'Posts' },
        routing: { pattern: '/blog/:tags/:slug' },
        fields: { slug: f.slug({}), tags: f.taxonomy({ of: 'route_category' }) },
        permissions: { read: ['public'] },
      }),
    ).toThrow(/several categories/u)
  })

  it('refuses two category segments in one route', () => {
    expect(() =>
      defineCollection({
        name: 'route_two',
        labels: { singular: 'Post', plural: 'Posts' },
        routing: { pattern: '/blog/:a/:b/:slug' },
        fields: {
          slug: f.slug({}),
          a: f.taxonomy({ of: 'route_category', many: false }),
          b: f.taxonomy({ of: 'route_category', many: false }),
        },
        permissions: { read: ['public'] },
      }),
    ).toThrow(/at most one category segment/u)
  })
})

describe('routeParamsOf and the term slug resolver', () => {
  let directory: string
  let db: DatabaseHandle
  let redirects: RedirectStore

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-route-terms-'))
    db = await createSqliteHandle({ url: join(directory, 'store.db') })
    await createSchemaTables(db, [post], [category])
    redirects = createRedirectStore({ db })
  })

  afterEach(async () => {
    await dropSchemaTables(db, [post])
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  function resolverOver(terms: ReturnType<typeof createTaxonomyStore>) {
    return createTermSlugResolver({
      termsOf: (name) => (name === 'route_category' ? terms.list() : undefined),
      missRefreshMs: 0,
    })
  }

  it('replaces the term id by its slug and drops it when the term is unknown', async () => {
    const terms = createTaxonomyStore({ db, taxonomy: category })
    const devops = await terms.create({ slug: 'devops', labels: { en: 'DevOps' } })
    const resolver = resolverOver(terms)

    await expect(
      routeParamsOf(post, { values: { slug: 'hello', category: devops.id } }, resolver),
    ).resolves.toEqual({ slug: 'hello', category: 'devops' })
    await expect(
      routeParamsOf(post, { values: { slug: 'hello', category: 'gone' } }, resolver),
    ).resolves.toEqual({ slug: 'hello' })
    await expect(routeParamsOf(post, { values: { slug: 'hello' } }, resolver)).resolves.toEqual({
      slug: 'hello',
    })
    // Without a resolver the raw id must never reach the URL.
    await expect(
      routeParamsOf(post, { values: { slug: 'hello', category: devops.id } }, undefined),
    ).resolves.toEqual({ slug: 'hello' })
    await expect(
      termSegmentsOf(post, { values: { category: devops.id } }, resolver),
    ).resolves.toEqual({ category: 'devops' })
  })

  it('reads a taxonomy once for many lookups and finds a term created afterwards', async () => {
    const terms = createTaxonomyStore({ db, taxonomy: category })
    let reads = 0
    const resolver = createTermSlugResolver({
      termsOf: (name) => {
        reads += 1
        return name === 'route_category' ? terms.list() : undefined
      },
      missRefreshMs: 0,
    })
    const first = await terms.create({ slug: 'one', labels: { en: 'One' } })
    await resolver.slug('route_category', first.id)
    await resolver.slug('route_category', first.id)
    await resolver.slug('route_category', first.id)
    expect(reads).toBe(1)

    const second = await terms.create({ slug: 'two', labels: { en: 'Two' } })
    await expect(resolver.slug('route_category', second.id)).resolves.toBe('two')
    expect(reads).toBe(2)
  })

  it('forgets a renamed term when told to', async () => {
    const terms = createTaxonomyStore({ db, taxonomy: category })
    const term = await terms.create({ slug: 'old', labels: { en: 'Old' } })
    const resolver = resolverOver(terms)
    await expect(resolver.slug('route_category', term.id)).resolves.toBe('old')
    await terms.update(term.id, { slug: 'new' })
    resolver.invalidate('route_category')
    await expect(resolver.slug('route_category', term.id)).resolves.toBe('new')
  })

  it('writes a 301 when a published entry moves to another category, slug unchanged', async () => {
    const terms = createTaxonomyStore({ db, taxonomy: category })
    const devops = await terms.create({ slug: 'devops', labels: { en: 'DevOps' } })
    const cloud = await terms.create({ slug: 'cloud', labels: { en: 'Cloud' } })
    const store = withRedirectTracking(
      createContentStore({ db, collection: post, defaultLocale: 'fr' }),
      { collection: post, redirects, defaultLocale: 'fr', terms: resolverOver(terms) },
    )

    const entry = await store.create({
      status: 'published',
      locale: 'fr',
      values: { title: 'Hello', slug: 'hello', category: devops.id },
    })
    await store.update(entry.id, { values: { category: cloud.id } })

    await expect(redirects.resolve('/blog/devops/hello')).resolves.toEqual({
      to: '/blog/cloud/hello',
      status: 301,
    })
  })

  it('writes the redirect from the old category and old slug when both change', async () => {
    const terms = createTaxonomyStore({ db, taxonomy: category })
    const devops = await terms.create({ slug: 'devops', labels: { en: 'DevOps' } })
    const cloud = await terms.create({ slug: 'cloud', labels: { en: 'Cloud' } })
    const store = withRedirectTracking(
      createContentStore({ db, collection: post, defaultLocale: 'fr' }),
      { collection: post, redirects, defaultLocale: 'fr', terms: resolverOver(terms) },
    )

    const entry = await store.create({
      status: 'published',
      locale: 'fr',
      values: { title: 'Hello', slug: 'hello', category: devops.id },
    })
    await store.update(entry.id, { values: { slug: 'bonjour', category: cloud.id } })

    await expect(redirects.resolve('/blog/devops/hello')).resolves.toEqual({
      to: '/blog/cloud/bonjour',
      status: 301,
    })
  })

  it('writes a redirect to the address without a category when the category is removed', async () => {
    const terms = createTaxonomyStore({ db, taxonomy: category })
    const devops = await terms.create({ slug: 'devops', labels: { en: 'DevOps' } })
    const store = withRedirectTracking(
      createContentStore({ db, collection: post, defaultLocale: 'fr' }),
      { collection: post, redirects, defaultLocale: 'fr', terms: resolverOver(terms) },
    )
    const entry = await store.create({
      status: 'published',
      locale: 'fr',
      values: { title: 'Hello', slug: 'hello', category: devops.id },
    })
    await store.update(entry.id, { values: { category: null } })

    await expect(redirects.resolve('/blog/devops/hello')).resolves.toEqual({
      to: '/blog/hello',
      status: 301,
    })
  })

  it('names the canonical address, category included, in the event a publication fires', async () => {
    const terms = createTaxonomyStore({ db, taxonomy: category })
    const devops = await terms.create({ slug: 'devops', labels: { en: 'DevOps' } })
    const events: ContentLifecycleEvent[] = []
    const store = withLifecycleEvents(
      createContentStore({ db, collection: post, defaultLocale: 'fr' }),
      {
        collection: post,
        defaultLocale: 'fr',
        terms: resolverOver(terms),
        emit: (event) => {
          events.push(event)
        },
      },
    )

    await store.create({
      status: 'published',
      locale: 'fr',
      values: { title: 'Hello', slug: 'hello', category: devops.id },
    })

    expect(events.map((event) => event.path)).toEqual(['/blog/devops/hello'])
  })
})
