import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadCollections } from '@cogenta/cli'
import { createDatabaseRegistry, createLogger } from '@cogenta/core'
import { createContentStore, matchPath } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DOCUMENTATION_COLLECTIONS,
  DOCUMENTATION_DEMO_DOC_PAGES,
  DOCUMENTATION_MEDIA_SPECS,
  DOCUMENTATION_MENUS,
  DOCUMENTATION_SITE_SETTINGS,
  docPage,
  documentationContentPack,
  page,
} from '../src/blueprints/documentation.js'
import { scaffoldSite } from '../src/scaffold.js'

// `documentation` now renders and ingests a real decorative hero image
// through the real media pipeline inside `scaffoldSite` (L25 Phase 1) —
// slower than vitest's default 5s, not a hang.
const SCAFFOLD_TIMEOUT = 60_000

describe('the documentation content pack — declared shape', () => {
  it('declares the four conventional SEO override fields on every routed collection', () => {
    for (const collection of [docPage, page]) {
      expect(Object.keys(collection.fields)).toEqual(
        expect.arrayContaining(['seoTitle', 'seoDescription', 'seoImage', 'seoNoindex']),
      )
    }
  })

  it('activates @cogenta/theme-docs by default', () => {
    expect(documentationContentPack.defaultTheme).toBe('@cogenta/theme-docs')
  })

  it('seeds exactly one decorative hero image, via coverArt not heroArt', () => {
    expect(DOCUMENTATION_MEDIA_SPECS).toHaveLength(1)
    expect(DOCUMENTATION_MEDIA_SPECS[0]?.name).toBe('hero')
  })

  it('seeds header, footer and a header-action menu', () => {
    expect(DOCUMENTATION_MENUS.header.map((item) => item.label)).toEqual([
      'Docs',
      'Guides',
      'Reference',
      'Blog',
    ])
    expect(DOCUMENTATION_MENUS.footer.map((item) => item.label)).toEqual([
      'Docs',
      'Community',
      'GitHub',
    ])
    expect(DOCUMENTATION_MENUS.headerAction?.label).toBe('GitHub')
    expect(DOCUMENTATION_MENUS.headerAction?.url).toBe('https://github.com/cogenta-cms/cogenta')
  })

  it('seeds a tagline, three social links and a footer note', () => {
    expect(DOCUMENTATION_SITE_SETTINGS['general.tagline']).toBeTypeOf('string')
    expect(DOCUMENTATION_SITE_SETTINGS['general.socialLinks']).toHaveLength(3)
    expect(DOCUMENTATION_SITE_SETTINGS['general.footerNote']).toBeTypeOf('string')
  })

  it('declares ten doc pages across exactly three sections, each with a positive integer order', () => {
    expect(DOCUMENTATION_DEMO_DOC_PAGES).toHaveLength(10)
    const sections = new Set(DOCUMENTATION_DEMO_DOC_PAGES.map((demo) => demo.section))
    expect([...sections].sort()).toEqual(['Getting started', 'Guides', 'Reference'])
    for (const demo of DOCUMENTATION_DEMO_DOC_PAGES) {
      expect(Number.isInteger(demo.order)).toBe(true)
      expect(demo.order).toBeGreaterThanOrEqual(1)
    }
  })

  it('gives every doc page real, distinct slugs — no placeholder text', () => {
    const slugs = DOCUMENTATION_DEMO_DOC_PAGES.map((demo) => demo.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const demo of DOCUMENTATION_DEMO_DOC_PAGES) {
      expect(demo.title.toLowerCase()).not.toContain('lorem')
    }
  })

  it('gives every doc page real content — a heading and either a code block or a list', () => {
    for (const demo of DOCUMENTATION_DEMO_DOC_PAGES) {
      const styles = demo.body.map((node) => (node._type === 'block' ? node.style : null))
      const hasCode = demo.body.some(
        (node) =>
          node._type === 'block' &&
          node.children.length === 1 &&
          node.children[0]?.marks.includes('code'),
      )
      const hasList = demo.body.some(
        (node) => node._type === 'block' && node.listItem !== undefined,
      )
      expect(styles, `${demo.slug} has a heading`).toContain('h2')
      expect(hasCode || hasList, `${demo.slug} has a code block or a list`).toBe(true)
    }
  })

  it('gives the guides collectively at least one code block, one list and a table-shaped definition list', () => {
    const hasCode = DOCUMENTATION_DEMO_DOC_PAGES.some((demo) =>
      demo.body.some(
        (node) =>
          node._type === 'block' &&
          node.children.length === 1 &&
          node.children[0]?.marks.includes('code'),
      ),
    )
    const hasList = DOCUMENTATION_DEMO_DOC_PAGES.some((demo) =>
      demo.body.some((node) => node._type === 'block' && node.listItem !== undefined),
    )
    expect(hasCode).toBe(true)
    expect(hasList).toBe(true)
  })
})

describe('scaffoldSite — documentation blueprint', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it(
    'writes a schema file loadCollections can load back, with doc_page/page',
    async () => {
      const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-docs-'))
      dirs.push(targetDir)

      const result = await scaffoldSite({
        targetDir,
        siteName: 'My Docs',
        siteUrl: 'http://localhost:4000',
        defaultLocale: 'en',
        databaseDriver: 'sqlite',
        adminEmail: 'admin@example.com',
        blueprintId: 'documentation',
      })

      expect(result.blueprintId).toBe('documentation')
      expect(result.fellBackToBlank).toBe(false)
      expect(result.activeTheme).toBe('@cogenta/theme-docs')
      expect(result.mediaSeeded).toBe(1)
      expect(result.menusSeeded).toBe(8)
      expect(result.siteSettingsSeeded).toBeGreaterThan(0)

      const collections = await loadCollections(targetDir)
      expect(collections.map((c) => c.name).sort()).toEqual(['doc_page', 'page'])
    },
    SCAFFOLD_TIMEOUT,
  )

  it(
    'writes the documentation blueprint’s own starting skin, a blue accent',
    async () => {
      const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-docs-'))
      dirs.push(targetDir)

      const result = await scaffoldSite({
        targetDir,
        siteName: 'My Docs',
        siteUrl: 'http://localhost:4000',
        defaultLocale: 'en',
        databaseDriver: 'sqlite',
        adminEmail: 'admin@example.com',
        blueprintId: 'documentation',
      })

      expect(result.skinSource).toBe('preset')
    },
    SCAFFOLD_TIMEOUT,
  )

  it(
    'seeds ten real, ordered, published doc pages, each with a sidebar collectionList as its first block',
    async () => {
      const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-docs-'))
      dirs.push(targetDir)

      const result = await scaffoldSite({
        targetDir,
        siteName: 'My Docs',
        siteUrl: 'http://localhost:4000',
        defaultLocale: 'en',
        databaseDriver: 'sqlite',
        adminEmail: 'admin@example.com',
        blueprintId: 'documentation',
      })
      expect(result.migrateExitCode).toBe(0)
      expect(result.usersExitCode).toBe(0)

      const logger = createLogger({ level: 'silent' })
      const selection = await createDatabaseRegistry({ logger }).select({
        driver: 'sqlite',
        url: join(targetDir, '.cogenta', 'site.db'),
      })
      try {
        const docPageStore = createContentStore({ db: selection.instance, collection: docPage })
        const pageStore = createContentStore({ db: selection.instance, collection: page })

        const docPages = await docPageStore.list({ limit: 100 })
        expect(docPages.items).toHaveLength(10)
        expect(docPages.items.every((entry) => entry.status === 'published')).toBe(true)

        const sections = new Set(docPages.items.map((entry) => entry.values.section))
        expect([...sections].sort()).toEqual(['Getting started', 'Guides', 'Reference'])

        for (const entry of docPages.items) {
          const body = entry.blocks.body ?? []
          expect(body.length).toBeGreaterThanOrEqual(2)
          const sidebarBlockData = body[0]
          expect(sidebarBlockData?.type).toBe('collectionList')
          const sidebarData = (sidebarBlockData?.data ?? {}) as {
            collection?: string
            limit?: number
            sort?: { field: string }
          }
          expect(sidebarData.collection).toBe('doc_page')
          expect(sidebarData.limit).toBe(100)
          expect(sidebarData.sort?.field).toBe('createdAt')
          expect(body[1]?.type).toBe('prose')
        }

        const pages = await pageStore.list()
        expect(pages.items.map((entry) => entry.values.slug)).toEqual(['home'])
        expect(pages.items[0]?.status).toBe('published')
      } finally {
        await selection.dispose()
      }
    },
    SCAFFOLD_TIMEOUT,
  )

  it(
    'composes the home page as exactly the six blocks the brief fixes, in order',
    async () => {
      const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-docs-'))
      dirs.push(targetDir)

      await scaffoldSite({
        targetDir,
        siteName: 'My Docs',
        siteUrl: 'http://localhost:4000',
        defaultLocale: 'en',
        databaseDriver: 'sqlite',
        adminEmail: 'admin@example.com',
        blueprintId: 'documentation',
      })

      const logger = createLogger({ level: 'silent' })
      const selection = await createDatabaseRegistry({ logger }).select({
        driver: 'sqlite',
        url: join(targetDir, '.cogenta', 'site.db'),
      })
      try {
        const pageStore = createContentStore({ db: selection.instance, collection: page })
        const home = (await pageStore.list()).items.find((entry) => entry.values.slug === 'home')
        expect(home).toBeDefined()
        if (home === undefined) throw new Error('unreachable')

        const blocks = home.blocks.blocks ?? []
        expect(blocks.map((block) => block.type)).toEqual([
          'hero',
          'featureGrid',
          'collectionList',
          'prose',
          'faq',
          'cta',
        ])

        const hero = blocks[0]?.data as { title?: string; media?: string }
        expect(hero.title).toBe('Documentation')
        // The hero's own decorative panel comes from the real media pipeline.
        expect(hero.media).toBeTypeOf('string')

        const features = blocks[1]?.data as { items: readonly { link?: { href?: string } }[] }
        expect(features.items).toHaveLength(6)
        for (const item of features.items) {
          expect(item.link?.href).toMatch(/^\/docs\//)
        }

        const guides = blocks[2]?.data as { collection?: string; limit?: number }
        expect(guides.collection).toBe('doc_page')
        expect(guides.limit).toBe(100)

        const cta = blocks[5]?.data as { title?: string; actions: readonly { target: unknown }[] }
        expect(cta.title).toBe('Contribute on GitHub')
        expect(cta.actions[0]?.target).toEqual({ href: 'https://github.com/cogenta-cms/cogenta' })
      } finally {
        await selection.dispose()
      }
    },
    SCAFFOLD_TIMEOUT,
  )

  it('resolves /docs/:slug and /:slug generically through @cogenta/schema routing', () => {
    expect(matchPath(DOCUMENTATION_COLLECTIONS, '/docs/installation')).toEqual({
      collection: 'doc_page',
      locale: null,
      params: { slug: 'installation' },
    })
    expect(matchPath(DOCUMENTATION_COLLECTIONS, '/home')).toEqual({
      collection: 'page',
      locale: null,
      params: { slug: 'home' },
    })
  })
})
