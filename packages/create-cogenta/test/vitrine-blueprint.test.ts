import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { VocabularyBlock } from '@cogenta/blocks'
import { loadCollections } from '@cogenta/cli'
import { createDatabaseRegistry, createLogger } from '@cogenta/core'
import { buildPath, createContentStore } from '@cogenta/schema'
import { caseStudy, page, service } from '@cogenta/starters/blueprints/vitrine'
import {
  type FetchedEntries,
  type HtmlNode,
  type PageContent,
  type RenderContext,
  renderPage,
  serialize,
  type ContentEntry as ThemeContentEntry,
} from '@cogenta/theme-canonical'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { scaffoldSite } from '../src/scaffold.js'

// The blueprint seeds fifteen bundled images (a cropped hero photograph, a
// rendered exhibit, six wordmarks, three portraits, three case-study photos)
// through the real media pipeline, with WebP variants: the same order of
// magnitude as `restaurant`'s scaffold, which documents this timeout.
const SCAFFOLD_TIMEOUT = 180_000

describe('scaffoldSite — vitrine blueprint', () => {
  let targetDir = ''

  beforeAll(async () => {
    targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-vitrine-'))
    const result = await scaffoldSite({
      targetDir,
      siteName: 'Harrow & Leigh',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'vitrine',
    })
    expect(result.blueprintId).toBe('vitrine')
    expect(result.fellBackToBlank).toBe(false)
    expect(result.migrateExitCode).toBe(0)
    expect(result.usersExitCode).toBe(0)
  }, SCAFFOLD_TIMEOUT)

  afterAll(async () => {
    if (targetDir !== '') await rm(targetDir, { recursive: true, force: true })
  })

  async function withDatabase<T>(
    use: (db: Parameters<typeof createContentStore>[0]['db']) => Promise<T>,
  ): Promise<T> {
    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: 'sqlite',
      url: join(targetDir, '.cogenta', 'site.db'),
    })
    try {
      return await use(selection.instance)
    } finally {
      await selection.dispose()
    }
  }

  it('writes a schema file loadCollections can load back', async () => {
    const collections = await loadCollections(targetDir)
    expect(collections.map((c) => c.name).sort()).toEqual([
      'case_study',
      'page',
      'service',
      'testimonial',
    ])
  })

  it('seeds published practices, case studies with photographs and sectors, and five pages', async () => {
    await withDatabase(async (db) => {
      const services = await createContentStore({ db, collection: service }).list()
      expect(services.items).toHaveLength(6)
      expect(services.items.every((entry) => entry.status === 'published')).toBe(true)

      const studies = await createContentStore({ db, collection: caseStudy }).list()
      expect(studies.items).toHaveLength(3)
      for (const study of studies.items) {
        expect(study.status).toBe('published')
        expect(typeof study.values.coverImage).toBe('string')
        expect(study.values.sector).toBeTruthy()
      }

      const pages = await createContentStore({ db, collection: page }).list()
      expect(pages.items.map((entry) => entry.values.slug).sort()).toEqual([
        'about',
        'case-studies',
        'contact',
        'home',
        'practices',
      ])
    })
  })

  it('renders the seeded home page into real HTML, naming the firm the site was created for', async () => {
    await withDatabase(async (db) => {
      const home = (await createContentStore({ db, collection: page }).list()).items.find(
        (entry) => entry.values.slug === 'home',
      )
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

      const studies = await createContentStore({ db, collection: caseStudy }).list()
      const themeEntries: readonly ThemeContentEntry[] = studies.items.map((entry) => ({
        id: entry.id,
        collection: 'case_study',
        locale: entry.locale,
        status: entry.status,
        ...entry.values,
      }))
      const entries: FetchedEntries = { 'demo-home-work': themeEntries }

      const html = htmlOf(renderPage(pageContent, fakeThemeContext(), entries))
      expect(html).toContain('Decisions that still hold a year later')
      expect(html).toContain('Meridian Rail raises punctuality')
      expect(html).toContain('Harrow &amp; Leigh analysis')
    })
  })
})

function htmlOf(node: HtmlNode | null): string {
  if (node === null) throw new Error('renderPage returned null')
  return serialize(node)
}

function fakeThemeContext(): RenderContext {
  return {
    site: {
      name: 'Harrow & Leigh',
      url: 'http://localhost:4000',
      locales: ['en'],
      defaultLocale: 'en',
    },
    locale: 'en',
    url: new URL('http://localhost:4000/home'),
    t: (key) => key,
    // A minimal, honest `ImageSource` stands in for the image pipeline, which
    // this test does not otherwise exercise.
    image: (media) => ({
      kind: 'image',
      src: `/_image?id=${media}`,
      srcset: '',
      width: 1600,
      height: 1000,
      alt: '',
      focal: null,
    }),
    link: (target) => {
      if (typeof target === 'string') return target
      if ('path' in target) return target.path
      return buildPath(caseStudy, { slug: target.id })
    },
    content: {
      entry: async () => null,
      byPath: async () => null,
      list: async () => ({ items: [], nextCursor: null }),
    },
  }
}
