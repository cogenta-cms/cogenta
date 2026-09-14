import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { VocabularyBlock } from '@cogenta/blocks'
import { parseBlocks } from '@cogenta/blocks'
import { loadCollections } from '@cogenta/cli'
import { createDatabaseRegistry, createLogger } from '@cogenta/core'
import {
  buildPath,
  createContentStore,
  createSearchIndex,
  createTaxonomyStore,
  matchPath,
} from '@cogenta/schema'
import {
  type FetchedEntries,
  type RenderContext,
  renderPage,
  serialize,
  type ContentEntry as ThemeContentEntry,
} from '@cogenta/theme-canonical'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bundledImageType, loadPhotoAsset } from '../src/blueprints/photo-assets.js'
import {
  buildPortfolioDemoPages,
  buildPortfolioHomeBlocks,
  client,
  DEFAULT_STUDIO_NAME,
  disciplines,
  PORTFOLIO_COLLECTIONS,
  PORTFOLIO_DEMO_DISCIPLINES,
  PORTFOLIO_DEMO_PROJECTS,
  PORTFOLIO_DEMO_TEAM,
  PORTFOLIO_MEDIA_SPECS,
  PORTFOLIO_MENUS,
  PORTFOLIO_SITE_SETTINGS,
  PORTFOLIO_TAXONOMIES,
  page,
  portfolioContentPack,
  portfolioProjectBlocks,
  project,
  studioEmail,
  team,
} from '../src/blueprints/portfolio.js'
import { STARTING_SKINS } from '../src/blueprints/starting-skins.js'
import { scaffoldSite } from '../src/scaffold.js'

// The blueprint seeds twenty-seven bundled images through the real media
// pipeline, with WebP variants: slower than vitest's default, not a hang.
const SCAFFOLD_TIMEOUT = 240_000

const MEDIA = Object.fromEntries(
  PORTFOLIO_MEDIA_SPECS.map((spec) => [spec.name, `media-${spec.name}`]),
)

type Demo = (typeof PORTFOLIO_DEMO_PROJECTS)[number]

const NON_TEXT_KEYS = new Set([
  'media',
  'avatar',
  'collection',
  'id',
  'marks',
  'style',
  'listItem',
  'layout',
  'filter',
  'sort',
  'target',
  'ratio',
  'align',
  'link',
  'href',
  'emphasis',
  'provider',
  'url',
])

/** Every piece of visitor-facing text a value carries, flattened. */
function textsOfValue(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(textsOfValue)
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) =>
      key.startsWith('_') || NON_TEXT_KEYS.has(key) ? [] : textsOfValue(inner),
    )
  }
  return []
}

/** One unit of text per paragraph, title, caption and setting: the unit the charter counts in. */
function blockTexts(block: VocabularyBlock): string[] {
  if (block._type === 'prose') {
    return block.body.map((node) => textsOfValue(node).join(''))
  }
  return textsOfValue(block)
}

function allDemoCopy(siteName: string): string[] {
  return [
    ...buildPortfolioDemoPages({ siteName, media: MEDIA }).flatMap((demo) => [
      demo.title,
      ...demo.blocks.flatMap(blockTexts),
    ]),
    ...PORTFOLIO_DEMO_PROJECTS.flatMap((demo) => [
      demo.title,
      demo.summary,
      demo.discipline,
      demo.client.name,
      ...portfolioProjectBlocks(demo, { siteName }, MEDIA).flatMap(blockTexts),
    ]),
    ...PORTFOLIO_DEMO_DISCIPLINES.flatMap((demo) => [demo.name, demo.description]),
    ...PORTFOLIO_DEMO_TEAM.map((demo) => demo.name),
    ...PORTFOLIO_MEDIA_SPECS.map((spec) => spec.alt),
    String(PORTFOLIO_SITE_SETTINGS['general.tagline']),
    String(PORTFOLIO_SITE_SETTINGS['general.footerNote']),
  ].filter((text) => text !== '')
}

function wordCount(demo: Demo): number {
  return portfolioProjectBlocks(demo, { siteName: DEFAULT_STUDIO_NAME }, {})
    .filter((block) => block._type === 'prose')
    .flatMap(blockTexts)
    .join(' ')
    .split(/\s+/)
    .filter((word) => word !== '').length
}

/** Titles a visitor reads as headlines: project titles, block titles and the headings inside prose. */
function allTitles(): string[] {
  const titleOf = (block: VocabularyBlock): string[] => {
    const own = 'title' in block && typeof block.title === 'string' ? [block.title] : []
    if (block._type !== 'prose') return own
    return block.body.flatMap((node) =>
      node._type === 'block' && node.style !== 'normal' ? [textsOfValue(node).join('')] : [],
    )
  }
  return [
    ...PORTFOLIO_DEMO_PROJECTS.flatMap((demo) => [
      demo.title,
      ...portfolioProjectBlocks(demo, { siteName: DEFAULT_STUDIO_NAME }, MEDIA).flatMap(titleOf),
    ]),
    ...buildPortfolioDemoPages({ media: MEDIA }).flatMap((demo) => [
      demo.title,
      ...demo.blocks.flatMap(titleOf),
    ]),
  ]
}

describe('portfolio blueprint, content model and the studio’s work', () => {
  it('declares the four conventional SEO override fields on every routed collection', () => {
    for (const collection of [project, page]) {
      expect(Object.keys(collection.fields)).toEqual(
        expect.arrayContaining(['seoTitle', 'seoDescription', 'seoImage', 'seoNoindex']),
      )
    }
  })

  it('resolves /work/:slug and /:slug generically through @cogenta/schema routing', () => {
    expect(matchPath(PORTFOLIO_COLLECTIONS, '/work/warp-and-weft')).toEqual({
      collection: 'project',
      locale: null,
      params: { slug: 'warp-and-weft' },
    })
    expect(matchPath(PORTFOLIO_COLLECTIONS, '/studio')).toEqual({
      collection: 'page',
      locale: null,
      params: { slug: 'studio' },
    })
  })

  it('files work under real client, discipline and team taxonomies, and keeps the caption fields as plain text', () => {
    expect(PORTFOLIO_TAXONOMIES.map((taxonomy) => taxonomy.name)).toEqual([
      'client',
      'disciplines',
      'team',
    ])
    expect(project.fields.clientArchive?.kind).toBe('taxonomy')
    expect(project.fields.disciplines?.kind).toBe('taxonomy')
    expect(project.fields.team?.kind).toBe('taxonomy')
    expect(project.fields.client?.kind).toBe('text')
    expect(project.fields.discipline?.kind).toBe('text')
    expect(project.fields.coverImage?.kind).toBe('media')
    expect([client.name, disciplines.name, team.name]).toEqual(['client', 'disciplines', 'team'])
    expect(portfolioContentPack.taxonomies).toBe(PORTFOLIO_TAXONOMIES)
    expect(portfolioContentPack.defaultTheme).toBe('@cogenta/theme-portfolio')
  })

  it('shows between six and eight projects, for as many different clients', () => {
    expect(PORTFOLIO_DEMO_PROJECTS.length).toBeGreaterThanOrEqual(6)
    expect(PORTFOLIO_DEMO_PROJECTS.length).toBeLessThanOrEqual(8)
    const slugs = PORTFOLIO_DEMO_PROJECTS.map((demo) => demo.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    const clients = PORTFOLIO_DEMO_PROJECTS.map((demo) => demo.client.slug)
    expect(new Set(clients).size).toBe(clients.length)
  })

  it('writes the lead case studies at 300 to 700 words, and no project as a caption alone', () => {
    const counts = PORTFOLIO_DEMO_PROJECTS.map(wordCount)
    const leads = counts.filter((words) => words >= 300)
    expect(leads.length).toBeGreaterThanOrEqual(3)
    for (const [index, words] of counts.entries()) {
      const slug = PORTFOLIO_DEMO_PROJECTS[index]?.slug
      expect(words, slug).toBeGreaterThanOrEqual(150)
      expect(words, slug).toBeLessThanOrEqual(700)
    }
    // The newest project leads the grid, so it is one of the long ones.
    expect(wordCount(PORTFOLIO_DEMO_PROJECTS.at(-1) as Demo)).toBeGreaterThanOrEqual(300)
  })

  it('dates the projects oldest first, so creation order matches the years visitors read', () => {
    const dates = PORTFOLIO_DEMO_PROJECTS.map((demo) => Date.parse(demo.publishedAt))
    expect(dates.every((date) => Number.isFinite(date))).toBe(true)
    expect([...dates].sort((a, b) => a - b)).toEqual(dates)
    expect(new Set(dates).size).toBe(dates.length)
  })

  it('credits every project to disciplines and people the blueprint declares', () => {
    const disciplineSlugs = new Set(PORTFOLIO_DEMO_DISCIPLINES.map((demo) => demo.slug))
    const people = new Set(PORTFOLIO_DEMO_TEAM.map((demo) => demo.slug))
    for (const demo of PORTFOLIO_DEMO_PROJECTS) {
      expect(demo.disciplines.length, demo.slug).toBeGreaterThan(0)
      expect(demo.team.length, demo.slug).toBeGreaterThan(0)
      for (const slug of demo.disciplines) expect(disciplineSlugs.has(slug), slug).toBe(true)
      for (const slug of demo.team) expect(people.has(slug), slug).toBe(true)
      expect(
        demo.title.includes(demo.client.name) && demo.title !== demo.client.name,
        demo.slug,
      ).toBe(false)
    }
  })

  it('writes every project page as valid contract-B blocks that show the work, not only describe it', () => {
    for (const demo of PORTFOLIO_DEMO_PROJECTS) {
      const blocks = portfolioProjectBlocks(demo, { siteName: DEFAULT_STUDIO_NAME }, MEDIA)
      expect(() => parseBlocks([...blocks]), demo.slug).not.toThrow()
      expect(
        blocks.some((block) => block._type === 'prose'),
        demo.slug,
      ).toBe(true)
      expect(
        blocks.some((block) => block._type === 'mediaFigure' || block._type === 'gallery'),
        demo.slug,
      ).toBe(true)
    }
  })

  it('leaves out, never replaces, the pictures of a caller that seeded no media', () => {
    for (const demo of PORTFOLIO_DEMO_PROJECTS) {
      const blocks = portfolioProjectBlocks(demo, { siteName: DEFAULT_STUDIO_NAME }, {})
      expect(() => parseBlocks([...blocks]), demo.slug).not.toThrow()
      expect(JSON.stringify(blocks), demo.slug).not.toContain('"media"')
    }
  })

  it('points every media slot at a bundled JPEG, so no abstract placeholder art is ever seeded', () => {
    expect(PORTFOLIO_MEDIA_SPECS.length).toBeGreaterThanOrEqual(PORTFOLIO_DEMO_PROJECTS.length)
    for (const spec of PORTFOLIO_MEDIA_SPECS) {
      expect(spec.photo, spec.name).toBe(`portfolio/${spec.name}.jpg`)
      const bytes = loadPhotoAsset(spec.photo as string)
      expect(bytes, spec.photo).toBeDefined()
      expect(bundledImageType(bytes as Uint8Array).extension, spec.photo).toBe('jpg')
      expect(spec.alt.length, spec.name).toBeGreaterThan(30)
    }
  })

  it('uses every bundled image it declares, and gives every project a cover among them', () => {
    const declared = new Set(PORTFOLIO_MEDIA_SPECS.map((spec) => spec.name))
    const used = new Set<string>()
    const collect = (value: unknown): void => {
      if (typeof value === 'string' && value.startsWith('media-')) used.add(value.slice(6))
      else if (Array.isArray(value)) value.forEach(collect)
      else if (value !== null && typeof value === 'object') Object.values(value).forEach(collect)
    }
    for (const demo of PORTFOLIO_DEMO_PROJECTS) {
      expect(declared.has(demo.cover), demo.slug).toBe(true)
      used.add(demo.cover)
      collect(portfolioProjectBlocks(demo, { siteName: DEFAULT_STUDIO_NAME }, MEDIA))
    }
    for (const demo of buildPortfolioDemoPages({ media: MEDIA })) collect(demo.blocks)
    expect([...declared].filter((name) => !used.has(name))).toEqual([])
  })

  it('names the studio the site belongs to, in its copy and its address, and falls back to a fictional one', () => {
    const named = allDemoCopy('Atelier Nord').join('\n')
    expect(named).toContain('Atelier Nord')
    expect(named).toContain('hello@ateliernord.com')
    expect(named).not.toContain(DEFAULT_STUDIO_NAME)
    expect(named).not.toContain('studiohale')
    expect(allDemoCopy(DEFAULT_STUDIO_NAME).join('\n')).toContain(DEFAULT_STUDIO_NAME)
    expect(studioEmail('Café Éditions')).toBe('hello@cafeeditions.com')
    expect(studioEmail('Studio Hale', 'jobs')).toBe('jobs@studiohale.com')
  })

  it('never talks about the CMS, the scaffold or the demo itself', () => {
    const copy = allDemoCopy(DEFAULT_STUDIO_NAME).join('\n')
    expect(copy).not.toMatch(
      /cogenta|scaffold|\bdemo\b|editable|lorem|javascript|placeholder|this (theme|template|website)/i,
    )
  })

  it('invents its clients rather than borrowing sample-company names', () => {
    const copy = allDemoCopy(DEFAULT_STUDIO_NAME).join('\n')
    expect(copy).not.toMatch(
      /contoso|fabrikam|northwind|tailspin|adventure works|wide world importers|woodgrove|litware|proseware|coho|alpine ski house|lamna|trey research|fourth coffee|wingtip|humongous|lucerne|relecloud|adatum|acme|globex|initech|umbrella corp/i,
    )
  })

  it('keeps to the studio charter: no buzzwords, no exclamation marks, at most one em dash per text', () => {
    const buzzwords =
      /\b(seamless|unlock|elevate|empower|supercharge|streamline|cutting-edge|robust|leverage|synergy|innovative|world-class|bespoke solutions|passionate|game-chang)/i
    for (const text of allDemoCopy(DEFAULT_STUDIO_NAME)) {
      expect(text, text).not.toMatch(buzzwords)
      expect(text, text).not.toContain('!')
      expect((text.match(/—/g) ?? []).length, text).toBeLessThanOrEqual(1)
      expect(text, text).not.toMatch(/\bnot\b[^.;:]*,\s*but\b/i)
      expect(text, text).not.toMatch(/\bisn[’']t\b[^.;:]*[,;]\s*it[’']s\b/i)
    }
  })

  it('titles no project, block or section as a question; only the questions of an FAQ ask one', () => {
    for (const title of allTitles()) expect(title, title).not.toMatch(/\?/)
  })

  it('opens the home page on a statement that names the studio, then the work', () => {
    const blocks = buildPortfolioHomeBlocks({ siteName: 'Atelier Nord' })
    expect(() => parseBlocks([...blocks])).not.toThrow()
    const [statement, work] = blocks
    expect(statement?._type).toBe('hero')
    expect(statement && 'title' in statement ? statement.title : '').toMatch(/^Atelier Nord /)
    expect(work).toMatchObject({ _type: 'collectionList', collection: 'project', layout: 'grid' })
    const contact = blocks.at(-1)
    expect(contact?._type).toBe('cta')
    expect(JSON.stringify(contact)).toContain('mailto:hello@ateliernord.com')
  })

  it('sorts every list on a field contract B allows', () => {
    for (const demo of buildPortfolioDemoPages()) {
      for (const block of demo.blocks) {
        if (block._type !== 'collectionList') continue
        expect(['id', 'createdAt', 'updatedAt']).toContain(block.sort?.field)
      }
    }
  })

  it('seeds valid contract-B pages that use most of the vocabulary', () => {
    const types = new Set<string>()
    for (const demo of buildPortfolioDemoPages({ media: MEDIA })) {
      expect(() => parseBlocks([...demo.blocks]), demo.slug).not.toThrow()
      for (const block of demo.blocks) types.add(block._type)
    }
    for (const demo of PORTFOLIO_DEMO_PROJECTS) {
      for (const block of portfolioProjectBlocks(demo, { siteName: 'X' }, MEDIA))
        types.add(block._type)
    }
    expect(types.size).toBeGreaterThanOrEqual(11)
    expect(buildPortfolioDemoPages().map((demo) => demo.slug)).toEqual([
      'home',
      'work',
      'studio',
      'contact',
      'privacy',
    ])
  })

  it('links every menu item and every in-page link to a page the blueprint seeds or an archive the server provides', () => {
    const routes = new Set([
      ...buildPortfolioDemoPages().map((demo) => `/${demo.slug}`),
      ...PORTFOLIO_DEMO_PROJECTS.map((demo) => `/work/${demo.slug}`),
      ...PORTFOLIO_DEMO_DISCIPLINES.map((demo) => `/disciplines/${demo.slug}`),
      ...PORTFOLIO_DEMO_TEAM.map((demo) => `/team/${demo.slug}`),
      ...PORTFOLIO_DEMO_PROJECTS.map((demo) => `/client/${demo.client.slug}`),
    ])
    for (const item of [...PORTFOLIO_MENUS.header, ...PORTFOLIO_MENUS.footer]) {
      expect(routes.has(item.url ?? ''), item.url).toBe(true)
    }
    expect(PORTFOLIO_MENUS.headerAction).toBeUndefined()
    const hrefs = JSON.stringify([
      ...buildPortfolioDemoPages({ media: MEDIA }).map((demo) => demo.blocks),
      ...PORTFOLIO_DEMO_PROJECTS.map((demo) =>
        portfolioProjectBlocks(demo, { siteName: 'X' }, MEDIA),
      ),
    ]).match(/"href":"[^"]+"/g)
    for (const match of hrefs ?? []) {
      const href = match.slice(8, -1)
      if (/^(mailto|tel|https):/.test(href)) continue
      expect(routes.has(href), href).toBe(true)
    }
  })

  it('closes comments on the work, and carries a footer note a real studio would write', () => {
    expect(PORTFOLIO_SITE_SETTINGS['discussion.enabled']).toBe(false)
    const note = String(PORTFOLIO_SITE_SETTINGS['general.footerNote'])
    expect(note).toMatch(/Hatherley Mews/)
    expect(note).not.toMatch(/create-cogenta|scaffold/i)
  })

  it("matches the theme's own palette and typeface in its starting skin", async () => {
    const theme = JSON.parse(
      await readFile(new URL('../../theme-portfolio/tokens.json', import.meta.url), 'utf8'),
    )
    expect(STARTING_SKINS.portfolio).toEqual(theme)
    expect(STARTING_SKINS.portfolio?.font.sans.startsWith("'Archivo'")).toBe(true)
    expect(STARTING_SKINS.portfolio?.color.accent).toBe('#ff4f00')
  })
})

describe('scaffoldSite, portfolio blueprint', () => {
  let targetDir = ''
  let result: Awaited<ReturnType<typeof scaffoldSite>>

  beforeAll(async () => {
    targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-portfolio-'))
    result = await scaffoldSite({
      targetDir,
      siteName: 'Atelier Nord',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'portfolio',
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

  it('writes a schema file loadCollections can load back, with client, disciplines and team as taxonomies', async () => {
    expect(result.blueprintId).toBe('portfolio')
    expect(result.fellBackToBlank).toBe(false)
    expect(result.migrateExitCode).toBe(0)
    expect(result.usersExitCode).toBe(0)
    const collections = await loadCollections(targetDir)
    expect(collections.map((c) => c.name).sort()).toEqual(['page', 'project'])
    const schemaSource = await readFile(result.schemaPath, 'utf8')
    const taxonomiesMatch = schemaSource.match(/export const taxonomies = (\[[\s\S]*\])\s*$/)
    const names = (JSON.parse(taxonomiesMatch?.[1] ?? '[]') as { readonly name: string }[])
      .map((t) => t.name)
      .sort()
    expect(names).toEqual(['client', 'disciplines', 'team'])
  })

  it('activates @cogenta/theme-portfolio with its own starting skin', async () => {
    expect(result.activeTheme).toBe('@cogenta/theme-portfolio')
    expect(result.skinSource).toBe('preset')
    const tokens = JSON.parse(await readFile(join(targetDir, 'theme.tokens.json'), 'utf8'))
    expect(tokens.color.accent).toBe('#ff4f00')
    expect(tokens.font.sans).toContain('Archivo')
  })

  it('seeds the header and footer menus, the settings and every bundled image', () => {
    expect(result.menusSeeded).toBe(PORTFOLIO_MENUS.header.length + PORTFOLIO_MENUS.footer.length)
    expect(result.siteSettingsSeeded).toBeGreaterThanOrEqual(3)
    expect(result.mediaSeeded).toBe(PORTFOLIO_MEDIA_SPECS.length)
  })

  it('seeds published projects with their dates, cover, caption fields and taxonomy terms', async () => {
    await withDatabase(async (db) => {
      const projects = await createContentStore({ db, collection: project }).list({ limit: 100 })
      const clients = await createTaxonomyStore({ db, taxonomy: client }).list()
      const disciplineTerms = await createTaxonomyStore({ db, taxonomy: disciplines }).list()
      const people = await createTaxonomyStore({ db, taxonomy: team }).list()
      expect(projects.items).toHaveLength(PORTFOLIO_DEMO_PROJECTS.length)
      expect(clients).toHaveLength(PORTFOLIO_DEMO_PROJECTS.length)
      expect(disciplineTerms).toHaveLength(PORTFOLIO_DEMO_DISCIPLINES.length)
      expect(people).toHaveLength(PORTFOLIO_DEMO_TEAM.length)
      for (const entry of projects.items) {
        const demo = PORTFOLIO_DEMO_PROJECTS.find(
          (candidate) => candidate.slug === entry.values.slug,
        )
        expect(demo, String(entry.values.slug)).toBeDefined()
        expect(entry.status).toBe('published')
        expect(entry.publishedAt).toBe(demo?.publishedAt)
        expect(entry.values.client).toBe(demo?.client.name)
        expect(entry.values.discipline).toBe(demo?.discipline)
        expect(typeof entry.values.coverImage).toBe('string')
        expect(entry.values.clientArchive).not.toBeNull()
        expect((entry.values.disciplines as readonly string[]).length).toBe(
          demo?.disciplines.length,
        )
        expect((entry.values.team as readonly string[]).length).toBe(demo?.team.length)
      }
    })
  })

  it('lists the work newest first through the same sort the home grid uses', async () => {
    await withDatabase(async (db) => {
      const listed = await createContentStore({ db, collection: project }).list({
        sort: { field: 'createdAt', direction: 'desc' },
        limit: 100,
      })
      expect(listed.items.map((entry) => entry.values.slug)).toEqual(
        PORTFOLIO_DEMO_PROJECTS.map((demo) => demo.slug).reverse(),
      )
    })
  })

  it('seeds the home, work, studio, contact and privacy pages, published', async () => {
    await withDatabase(async (db) => {
      const pages = await createContentStore({ db, collection: page }).list()
      expect(pages.items.map((entry) => entry.values.slug).sort()).toEqual([
        'contact',
        'home',
        'privacy',
        'studio',
        'work',
      ])
      expect(pages.items.every((entry) => entry.status === 'published')).toBe(true)
    })
  })

  it('indexes the seeded projects for search, not only inserts them', async () => {
    await withDatabase(async (db) => {
      const index = await createSearchIndex({ db })
      const results = await index.search({ text: 'cotton', locale: 'en' })
      expect(results.hits.some((hit) => hit.collection === 'project')).toBe(true)
    })
  })

  // Rendered through `@cogenta/theme-canonical`, the theme this package
  // already depends on: what is checked here is that the seeded page and the
  // seeded projects make a real page together. The portfolio theme's own
  // markup is covered by its own package and by the capture bench.
  it('renders the seeded home page into real HTML, the newest work first', async () => {
    await withDatabase(async (db) => {
      const pageStore = createContentStore({ db, collection: page })
      const projectStore = createContentStore({ db, collection: project })
      const home = (await pageStore.list()).items.find((entry) => entry.values.slug === 'home')
      if (home === undefined) throw new Error('the home page was not seeded')
      const blocks = (home.blocks.blocks ?? []).map(
        (block): VocabularyBlock =>
          ({
            _key: block.key,
            _type: block.type,
            _version: '1.0.0',
            ...block.data,
          }) as VocabularyBlock,
      )
      const listed = await projectStore.list({
        sort: { field: 'createdAt', direction: 'desc' },
        limit: 6,
      })
      const themeEntries: readonly ThemeContentEntry[] = listed.items.map((entry) => ({
        id: entry.id,
        collection: 'project',
        locale: entry.locale,
        status: entry.status,
        ...entry.values,
      }))
      const slugById = new Map(listed.items.map((entry) => [entry.id, entry.values.slug as string]))
      const entries: FetchedEntries = { 'home-work': themeEntries }

      const html = serialize(
        renderPage({ title: home.values.title as string, blocks }, themeContext(slugById), entries),
      )
      const newest = PORTFOLIO_DEMO_PROJECTS.at(-1)?.title as string
      const older = PORTFOLIO_DEMO_PROJECTS.at(-2)?.title as string
      expect(html.indexOf(newest)).toBeGreaterThan(-1)
      expect(html.indexOf(newest)).toBeLessThan(html.indexOf(older))
      expect(html).toContain('Atelier Nord designs identities')
      expect(html).toContain('mailto:hello@ateliernord.com')
      expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
    })
  })
})

/**
 * A minimal, real `RenderContext`: `link` resolves an entry id to its routed
 * URL via `buildPath`, and `image` stands in for the media pipeline, which
 * this test does not exercise.
 */
function themeContext(slugById: ReadonlyMap<string, string>): RenderContext {
  return {
    site: {
      name: 'Atelier Nord',
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
      width: 1200,
      height: 800,
      alt: '',
      focal: null,
    }),
    link: (target) => {
      if (typeof target === 'string') return target
      if ('path' in target) return target.path
      const slug = slugById.get(target.id)
      if (slug === undefined) return '#'
      return buildPath(project, { slug })
    },
    content: {
      entry: async () => null,
      byPath: async () => null,
      list: async () => ({ items: [], nextCursor: null }),
    },
  }
}
