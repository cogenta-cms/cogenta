import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { VocabularyBlock } from '@cogenta/blocks'
import { loadCollections } from '@cogenta/cli'
import { createDatabaseRegistry, createLogger } from '@cogenta/core'
import { buildPath, createContentStore, matchPath } from '@cogenta/schema'
import {
  type FetchedEntries,
  type HtmlNode,
  type PageContent,
  type RenderContext,
  renderPage,
  serialize,
  type ContentEntry as ThemeContentEntry,
} from '@cogenta/theme-canonical'
import { afterEach, describe, expect, it } from 'vitest'
import { ASSOCIATION_COLLECTIONS, event, page } from '../src/blueprints/association.js'
import { scaffoldSite } from '../src/scaffold.js'

describe('scaffoldSite — association blueprint', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  // Audit fiche 06, T01 (P0): without these four fields, the admin's SEO
  // panel (`seo-panel.tsx`) renders nothing for every entry of every routed
  // collection this blueprint scaffolds.
  it('declares the four conventional SEO override fields on every routed collection', () => {
    for (const collection of [event, page]) {
      expect(Object.keys(collection.fields)).toEqual(
        expect.arrayContaining(['seoTitle', 'seoDescription', 'seoImage', 'seoNoindex']),
      )
    }
  })

  // This blueprint's `scaffoldSite` now renders and ingests 19 real demo
  // images through the real media pipeline (`seedDemoMedia` — hero, six
  // event covers, six gallery photos, one avatar, five partner marks) —
  // measured well past the default 5s, not a hang (see `store-blueprint
  // .test.ts`'s own note on the same trade-off with 7 images).
  it('writes a schema file loadCollections can load back, with event/page', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-association-'))
    dirs.push(targetDir)

    const result = await scaffoldSite({
      targetDir,
      siteName: 'My Association',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'association',
    })

    expect(result.blueprintId).toBe('association')
    expect(result.fellBackToBlank).toBe(false)

    const collections = await loadCollections(targetDir)
    expect(collections.map((c) => c.name).sort()).toEqual(['event', 'page'])
  }, 120_000)

  it('seeds real demo events and pages into real SQLite', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-association-'))
    dirs.push(targetDir)

    const result = await scaffoldSite({
      targetDir,
      siteName: 'My Association',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'association',
    })
    expect(result.migrateExitCode).toBe(0)
    expect(result.usersExitCode).toBe(0)

    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: 'sqlite',
      url: join(targetDir, '.cogenta', 'site.db'),
    })
    try {
      const eventStore = createContentStore({ db: selection.instance, collection: event })
      const pageStore = createContentStore({ db: selection.instance, collection: page })

      const events = await eventStore.list()
      expect(events.items.length).toBeGreaterThanOrEqual(3)

      const pages = await pageStore.list()
      expect(pages.items.map((entry) => entry.values.slug).sort()).toEqual([
        'about',
        'events',
        'get-involved',
        'home',
        'privacy',
        'programmes',
      ])
    } finally {
      await selection.dispose()
    }
  }, 120_000)

  it('resolves /events/:slug and /:slug generically through @cogenta/schema routing', () => {
    expect(matchPath(ASSOCIATION_COLLECTIONS, '/events/community-clean-up-day')).toEqual({
      collection: 'event',
      locale: null,
      params: { slug: 'community-clean-up-day' },
    })
    expect(matchPath(ASSOCIATION_COLLECTIONS, '/mission')).toEqual({
      collection: 'page',
      locale: null,
      params: { slug: 'mission' },
    })
  })

  it('renders the seeded home page into real HTML through the real theme-canonical pipeline', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-association-'))
    dirs.push(targetDir)

    await scaffoldSite({
      targetDir,
      siteName: 'My Association',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'association',
    })

    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: 'sqlite',
      url: join(targetDir, '.cogenta', 'site.db'),
    })
    try {
      const pageStore = createContentStore({ db: selection.instance, collection: page })
      const eventStore = createContentStore({ db: selection.instance, collection: event })

      const home = (await pageStore.list()).items.find((entry) => entry.values.slug === 'home')
      expect(home).toBeDefined()
      if (home === undefined) throw new Error('unreachable')

      const pageContent: PageContent = {
        title: home.values.title as string,
        blocks: (home.blocks.blocks ?? []).map(
          (block): VocabularyBlock =>
            ({
              _key: block.key,
              _type: block.type,
              _version: '1.0.0',
              ...block.data,
            }) as VocabularyBlock,
        ),
      }

      const events = await eventStore.list()
      const slugById = new Map(events.items.map((entry) => [entry.id, entry.values.slug as string]))
      const themeEntries: readonly ThemeContentEntry[] = events.items.map((entry) => ({
        id: entry.id,
        collection: 'event',
        locale: entry.locale,
        status: entry.status,
        ...entry.values,
      }))

      const ctx = fakeThemeContext(slugById)
      const entries: FetchedEntries = { 'demo-home-events': themeEntries }

      const html = htmlOf(renderPage(pageContent, ctx, entries))

      expect(html).toContain('Working together, close to home')
      expect(html).toContain('cg-collection')
      expect(html).toContain('Community clean-up day')
    } finally {
      await selection.dispose()
    }
  }, 120_000)
})

function htmlOf(node: HtmlNode | null): string {
  if (node === null) throw new Error('renderPage returned null')
  return serialize(node)
}

function fakeThemeContext(slugById: ReadonlyMap<string, string>): RenderContext {
  return {
    site: {
      name: 'My Association',
      url: 'http://localhost:4000',
      locales: ['en'],
      defaultLocale: 'en',
    },
    locale: 'en',
    url: new URL('http://localhost:4000/home'),
    t: (key) => key,
    // The home page's hero (and gallery/logoStrip/testimonial) now carry a
    // real ingested media id (`seedDemoMedia`) — a plausible `ImageSource`
    // in place of one, the same fake `store-blueprint.test.ts` already uses.
    image: (media) => ({
      kind: 'image',
      src: `/_image?id=${media}`,
      srcset: '',
      width: 1600,
      height: 1000,
      alt: 'association demo image',
      focal: null,
    }),
    link: (target) => {
      if (typeof target === 'string') return target
      if ('path' in target) return target.path
      const slug = slugById.get(target.id)
      if (slug === undefined) throw new Error(`no slug indexed for entry ${target.id}`)
      return buildPath(event, { slug })
    },
    content: {
      entry: async () => null,
      byPath: async () => null,
      list: async () => ({ items: [], nextCursor: null }),
    },
  }
}
