import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import {
  type CollectionDefinition,
  type ContentStore,
  createContentStore,
  createMenuStore,
  createRedirectStore,
  createSchemaTables,
  createTaxonomyStore,
  defineCollection,
  defineTaxonomy,
  ensureMenuTables,
  f,
  type MenuStore,
  type RedirectStore,
  type TaxonomyDefinition,
  type TaxonomyStore,
} from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { exportContent } from '../src/content-export.js'
import { importContent } from '../src/content-import.js'
import { decodeRecord } from '../src/format.js'

const category: TaxonomyDefinition = defineTaxonomy({
  name: 'category',
  labels: { singular: { en: 'Category' }, plural: { en: 'Categories' } },
  hierarchical: true,
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
})

const author: CollectionDefinition = defineCollection({
  name: 'author',
  labels: { singular: 'Author', plural: 'Authors' },
  fields: { name: f.text({ required: true, max: 120 }) },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
})

const article: CollectionDefinition = defineCollection({
  name: 'article',
  labels: { singular: 'Article', plural: 'Articles' },
  routing: { pattern: '/blog/:slug', locale: true },
  fields: {
    title: f.text({ required: true, max: 200, localized: true }),
    slug: f.slug({ from: 'title' }),
    author: f.relation({ to: 'author', onDelete: 'restrict' }),
    categories: f.taxonomy({ of: 'category' }),
    main: f.blocks({ allow: '*' }),
  },
  permissions: {
    read: ['public'],
    create: ['editor'],
    update: ['editor'],
    delete: ['admin'],
    publish: ['admin'],
  },
})

const collections = [author, article]
const taxonomies = [category]

interface Site {
  readonly db: DatabaseHandle
  readonly authorStore: ContentStore
  readonly articleStore: ContentStore
  readonly categoryStore: TaxonomyStore
  readonly menus: MenuStore
  readonly redirects: RedirectStore
}

async function makeSite(path: string): Promise<Site> {
  const db = await createSqliteHandle({ url: path })
  await createSchemaTables(db, collections, taxonomies)
  const authorStore = createContentStore({ db, collection: author, siblings: collections })
  const articleStore = createContentStore({ db, collection: article, siblings: collections })
  const categoryStore = createTaxonomyStore({ db, taxonomy: category })
  await ensureMenuTables(db)
  const menus = createMenuStore({ db })
  const redirects = createRedirectStore({ db })
  await redirects.ensureTable()
  return { db, authorStore, articleStore, categoryStore, menus, redirects }
}

function storeFor(site: Site) {
  return (collection: CollectionDefinition): ContentStore =>
    collection.name === 'author' ? site.authorStore : site.articleStore
}

function taxonomyStoreFor(site: Site) {
  return (): TaxonomyStore => site.categoryStore
}

describe('exportContent / importContent — a full round trip', () => {
  let directory: string
  let source: Site
  let target: Site

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-export-'))
    source = await makeSite(join(directory, 'source.db'))
    target = await makeSite(join(directory, 'target.db'))
  })

  afterEach(async () => {
    await source.db.close()
    await target.db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('reproduces entries, taxonomy terms, menus and redirects in an empty site', async () => {
    const news = await source.categoryStore.create({ slug: 'news', labels: { en: 'News' } })
    const tech = await source.categoryStore.create({
      slug: 'tech',
      labels: { en: 'Tech' },
      parent: news.id,
    })

    const ada = await source.authorStore.create({
      status: 'published',
      values: { name: 'Ada Lovelace' },
    })
    const post = await source.articleStore.create({
      status: 'published',
      locale: 'en',
      values: {
        title: 'Hello, Cogenta',
        author: ada.id,
        categories: [news.id, tech.id],
      },
      blocks: { main: [{ key: 'b1', type: 'richText', data: { document: { children: [] } } }] },
    })
    const translation = await source.articleStore.create({
      status: 'published',
      locale: 'fr',
      translationOf: post.id,
      values: { title: 'Bonjour, Cogenta', author: ada.id, categories: [] },
    })

    const menu = await source.menus.create({ name: 'main', locale: 'en', label: 'Main menu' })
    await source.menus.createItem(menu.id, {
      label: 'Home',
      kind: 'url',
      url: '/',
    })

    await source.redirects.add({ from: '/old-url', to: '/blog/hello-cogenta' })

    const lines: string[] = []
    const generator = exportContent({
      db: source.db,
      site: { name: 'Test site', url: 'https://example.test' },
      collections,
      taxonomies,
      storeFor: storeFor(source),
      taxonomyStoreFor: taxonomyStoreFor(source),
      menus: source.menus,
      redirects: source.redirects,
    })
    for (;;) {
      const step = await generator.next()
      if (step.done === true) break
      lines.push(step.value)
    }

    async function* asLines(): AsyncGenerator<string> {
      for (const line of lines) yield line
    }

    const report = await importContent(asLines(), {
      collections,
      taxonomies,
      storeFor: storeFor(target),
      taxonomyStoreFor: taxonomyStoreFor(target),
      menus: target.menus,
      redirects: target.redirects,
    })

    expect(report.errors).toEqual([])
    expect(report.entries).toBe(3) // author + 2 articles (source + translation)
    expect(report.terms).toBe(2)
    expect(report.menus).toBe(1)
    expect(report.menuItems).toBe(1)
    expect(report.redirects).toBe(1)

    const importedAda = await target.authorStore.read(ada.id, { state: 'working' })
    expect(importedAda?.values.name).toBe('Ada Lovelace')

    const importedPost = await target.articleStore.read(post.id, { state: 'working' })
    expect(importedPost?.values.title).toBe('Hello, Cogenta')
    expect(importedPost?.values.author).toBe(ada.id)
    const importedCategories =
      importedPost === null ? [] : (importedPost.values.categories as string[])
    expect([...importedCategories].sort()).toEqual([news.id, tech.id].sort())
    expect(importedPost?.blocks.main).toHaveLength(1)

    const importedTranslation = await target.articleStore.read(translation.id, {
      state: 'working',
    })
    expect(importedTranslation?.translationOf).toBe(post.id)
    expect(importedTranslation?.locale).toBe('fr')

    const importedTech = await target.categoryStore.read(tech.id)
    expect(importedTech?.parent).toBe(news.id)

    const importedMenus = await target.menus.list()
    expect(importedMenus).toHaveLength(1)
    const importedItems = await target.menus.listItems(importedMenus[0]?.id ?? '')
    expect(importedItems.map((item) => item.label)).toEqual(['Home'])

    const importedRedirects = await target.redirects.list()
    expect(importedRedirects.map((redirect) => redirect.from)).toEqual(['/old-url'])
  })

  it('starts the stream with a manifest record naming the format and version', async () => {
    const first = await exportContent({
      db: source.db,
      site: { name: 'Test site', url: 'https://example.test' },
      collections,
      taxonomies,
      storeFor: storeFor(source),
      taxonomyStoreFor: taxonomyStoreFor(source),
    }).next()

    const record = decodeRecord(first.value as string, 1)
    expect(record.kind).toBe('manifest')
    if (record.kind === 'manifest') {
      expect(record.format).toBe('cogenta-export')
      expect(record.version).toBe('1.0')
    }
  })

  it('skips a collection the caller may not read (R4 — an export is a bulk read)', async () => {
    await source.authorStore.create({ status: 'published', values: { name: 'Secret Author' } })

    const generator = exportContent({
      db: source.db,
      site: { name: 'Test site', url: 'https://example.test' },
      collections,
      taxonomies: [],
      storeFor: storeFor(source),
      taxonomyStoreFor: taxonomyStoreFor(source),
      canReadCollection: (collection) => collection.name !== 'author',
    })

    let sawAuthor = false
    for (;;) {
      const step = await generator.next()
      if (step.done === true) break
      const record = decodeRecord(step.value, 1)
      if (record.kind === 'entry' && record.collection === 'author') sawAuthor = true
    }
    expect(sawAuthor).toBe(false)
  })

  it('rejects onConflict: "fail" when the target already has the entry', async () => {
    const ada = await source.authorStore.create({
      status: 'published',
      values: { name: 'Ada' },
    })
    await target.authorStore.create({
      id: ada.id,
      status: 'published',
      values: { name: 'Already here' },
    })

    const lines: string[] = []
    const generator = exportContent({
      db: source.db,
      site: { name: 'Test site', url: 'https://example.test' },
      collections: [author],
      taxonomies: [],
      storeFor: storeFor(source),
      taxonomyStoreFor: taxonomyStoreFor(source),
    })
    for (;;) {
      const step = await generator.next()
      if (step.done === true) break
      lines.push(step.value)
    }
    async function* asLines(): AsyncGenerator<string> {
      for (const line of lines) yield line
    }

    await expect(
      importContent(asLines(), {
        collections: [author],
        taxonomies: [],
        storeFor: storeFor(target),
        taxonomyStoreFor: taxonomyStoreFor(target),
        onConflict: 'fail',
      }),
    ).rejects.toMatchObject({ code: 'RESTORE_CONFLICT' })
  })
})
