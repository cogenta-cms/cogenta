import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { VocabularyBlock } from '@cogenta/blocks'
import { loadCollections } from '@cogenta/cli'
import { createDatabaseRegistry, createLogger } from '@cogenta/core'
import {
  buildPath,
  createContentStore,
  createMenuStore,
  createSiteSettingsStore,
  SITE_SETTINGS_SITE_SCOPE,
} from '@cogenta/schema'
import {
  type PageContent,
  type RenderContext,
  renderPage,
  serialize,
} from '@cogenta/theme-canonical'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ASSOCIATION_DEMO_EVENTS,
  ASSOCIATION_MEDIA_SPECS,
  ASSOCIATION_MENUS,
  ASSOCIATION_PROGRAMMES,
  buildAssociationDemoPages,
  DEFAULT_ASSOCIATION_NAME,
  event,
  page,
  programme,
} from '../../starters/src/blueprints/association.js'
import { scaffoldSite } from '../src/scaffold.js'

// Fourteen bundled pictures through the real media pipeline, with WebP
// variants: slower than vitest's default.
const SCAFFOLD_TIMEOUT = 240_000

describe('scaffoldSite, association blueprint', () => {
  let targetDir = ''
  let result: Awaited<ReturnType<typeof scaffoldSite>>

  beforeAll(async () => {
    targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-association-'))
    result = await scaffoldSite({
      targetDir,
      siteName: 'Common Ground',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'association',
    })
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

  it('writes a schema file loadCollections can load back, with event, programme and page', async () => {
    expect(result.blueprintId).toBe('association')
    expect(result.fellBackToBlank).toBe(false)
    expect(result.migrateExitCode).toBe(0)
    expect(result.usersExitCode).toBe(0)
    const collections = await loadCollections(targetDir)
    expect(collections.map((c) => c.name).sort()).toEqual(['event', 'page', 'programme'])
  })

  it('activates @cogenta/theme-association with its own starting skin', async () => {
    expect(result.activeTheme).toBe('@cogenta/theme-association')
    expect(result.skinSource).toBe('preset')
    const tokens = JSON.parse(await readFile(join(targetDir, 'theme.tokens.json'), 'utf8'))
    expect(tokens.font.serif).toContain('Bricolage Grotesque')
    expect(tokens.font.sans).toContain('Source Sans 3')
  })

  it('seeds the menus, the settings and every bundled picture', () => {
    expect(result.menusSeeded).toBe(ASSOCIATION_MENUS.header.length + 1)
    expect(result.siteSettingsSeeded).toBeGreaterThanOrEqual(4)
    expect(result.mediaSeeded).toBe(ASSOCIATION_MEDIA_SPECS.length)
  })

  it('seeds the footer as columns, and a footer note with the site’s own email address', async () => {
    await withDatabase(async (db) => {
      const store = createMenuStore({ db })
      const footer = await store.byLocation('footer', 'en')
      const items = await store.listItems(footer?.id as string)
      expect(
        items.filter((item) => item.kind === 'submenu-placeholder').map((i) => i.label),
      ).toEqual(['Get involved', 'What we do', 'About us'])
      const settings = createSiteSettingsStore({ db })
      const note = await settings.get('general.footerNote', SITE_SETTINGS_SITE_SCOPE)
      const value = String(note?.value ?? (await settings.get('general.footerNote', 'en'))?.value)
      expect(value).toContain('hello@commonground.org.uk')
    })
  })

  it('seeds every programme and event published, dated in the future, with their pictures', async () => {
    await withDatabase(async (db) => {
      const events = await createContentStore({ db, collection: event }).list({ limit: 20 })
      expect(events.items).toHaveLength(ASSOCIATION_DEMO_EVENTS.length)
      for (const entry of events.items) {
        expect(entry.status).toBe('published')
        expect(Date.parse(String(entry.values.date))).toBeGreaterThan(Date.now())
        expect(Date.parse(String(entry.values.endsAt))).toBeGreaterThan(
          Date.parse(String(entry.values.date)),
        )
      }
      const programmes = await createContentStore({ db, collection: programme }).list({ limit: 20 })
      expect(programmes.items).toHaveLength(ASSOCIATION_PROGRAMMES.length)
      for (const entry of programmes.items) {
        expect(entry.status).toBe('published')
        expect(typeof entry.values.coverImage).toBe('string')
        expect(entry.values.contact).toMatch(/@commonground\.org\.uk$/)
      }
    })
  })

  it('seeds every page, published', async () => {
    await withDatabase(async (db) => {
      const pages = await createContentStore({ db, collection: page }).list({ limit: 20 })
      expect(pages.items.map((entry) => entry.values.slug).sort()).toEqual(
        buildAssociationDemoPages({})
          .map((demo) => demo.slug)
          .sort(),
      )
      expect(pages.items.every((entry) => entry.status === 'published')).toBe(true)
    })
  })

  it('renders the seeded home page into real HTML naming the organisation, with one h1', async () => {
    await withDatabase(async (db) => {
      const found = (await createContentStore({ db, collection: page }).list()).items.find(
        (entry) => entry.values.slug === 'home',
      )
      if (found === undefined) throw new Error('the home page was not seeded')
      const content: PageContent = {
        title: found.values.title as string,
        blocks: (found.blocks.blocks ?? []).map(
          (block): VocabularyBlock =>
            ({
              _key: block.key,
              _type: block.type,
              _version: '1.0.0',
              ...block.data,
            }) as VocabularyBlock,
        ),
      }
      const html = serialize(renderPage(content, themeContext()))
      expect(html).toContain('No one in Ashworth should go hungry or face winter alone')
      expect(html).toContain('Common Ground runs a food bank')
      expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
      expect(html).not.toContain(DEFAULT_ASSOCIATION_NAME)
    })
  })
})

function themeContext(): RenderContext {
  return {
    site: {
      name: 'Common Ground',
      url: 'http://localhost:4000',
      locales: ['en'],
      defaultLocale: 'en',
    },
    locale: 'en',
    url: new URL('http://localhost:4000/'),
    t: (key) => key,
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
      return buildPath(event, { slug: target.id })
    },
    content: {
      entry: async () => null,
      byPath: async () => null,
      list: async () => ({ items: [], nextCursor: null }),
    },
  }
}
