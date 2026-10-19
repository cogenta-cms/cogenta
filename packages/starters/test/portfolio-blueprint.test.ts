import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { VocabularyBlock } from '@cogenta/blocks'
import { parseBlocks } from '@cogenta/blocks'
import { matchPath } from '@cogenta/schema'
import { validateWidgetSettings, validateWidgetVisibility } from '@cogenta/widgets'
import { describe, expect, it } from 'vitest'
import { contentPackFor } from '../src/blueprints/content-packs.js'
import { bundledImageType, loadPhotoAsset } from '../src/blueprints/photo-assets.js'
import {
  buildPortfolioDemoPages,
  buildPortfolioHomeBlocks,
  createPortfolioContentPack,
  DEFAULT_STUDIO_NAME,
  PORTFOLIO_COLLECTIONS,
  PORTFOLIO_TAXONOMIES,
  portfolioContentPack,
  portfolioCopyFor,
  portfolioMediaSpecs,
  portfolioMenus,
  portfolioProjectBlocks,
  portfolioSchema,
  portfolioSiteSettings,
  portfolioWidgets,
  studioEmail,
} from '../src/blueprints/portfolio.js'
import type { PortfolioCopy } from '../src/blueprints/portfolio-copy.js'
import { PORTFOLIO_PHOTO_CREDITS } from '../src/blueprints/portfolio-credits.js'
import { typesetFrench } from '../src/blueprints/portfolio-typography.js'
import { STARTING_SKINS } from '../src/blueprints/starting-skins.js'

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

function mediaOf(copy: PortfolioCopy): Record<string, string> {
  return Object.fromEntries(copy.media.map((item) => [item.name, `media-${item.name}`]))
}

function allDemoCopy(copy: PortfolioCopy, siteName: string): string[] {
  const media = mediaOf(copy)
  const settings = portfolioSiteSettings(copy)
  return [
    ...buildPortfolioDemoPages(copy, { siteName, media }).flatMap((demo) => [
      demo.title,
      ...demo.blocks.flatMap(blockTexts),
    ]),
    ...copy.projects.flatMap((demo) => [
      demo.title,
      demo.summary,
      demo.discipline,
      demo.client.name,
      ...portfolioProjectBlocks(demo, { siteName }, media).flatMap(blockTexts),
    ]),
    ...copy.disciplines.flatMap((demo) => [demo.name, demo.description]),
    ...copy.team.flatMap((demo) => [demo.name, demo.role]),
    ...copy.media.map((item) => item.alt),
    String(settings['general.tagline']),
    String(settings['general.footerNote']),
  ].filter((text) => text !== '')
}

function wordCount(demo: PortfolioCopy['projects'][number]): number {
  return portfolioProjectBlocks(demo, { siteName: DEFAULT_STUDIO_NAME }, {})
    .filter((block) => block._type === 'prose')
    .flatMap(blockTexts)
    .join(' ')
    .split(/\s+/)
    .filter((word) => word !== '').length
}

/** Titles a visitor reads as headlines: project titles, block titles and the headings inside prose. */
function allTitles(copy: PortfolioCopy): string[] {
  const media = mediaOf(copy)
  const titleOf = (block: VocabularyBlock): string[] => {
    const own = 'title' in block && typeof block.title === 'string' ? [block.title] : []
    if (block._type !== 'prose') return own
    return block.body.flatMap((node) =>
      node._type === 'block' && node.style !== 'normal' ? [textsOfValue(node).join('')] : [],
    )
  }
  return [
    ...copy.projects.flatMap((demo) => [
      demo.title,
      ...portfolioProjectBlocks(demo, { siteName: DEFAULT_STUDIO_NAME }, media).flatMap(titleOf),
    ]),
    ...buildPortfolioDemoPages(copy, { media }).flatMap((demo) => [
      demo.title,
      ...demo.blocks.flatMap(titleOf),
    ]),
  ]
}

const PHOTO_DIRECTORY = fileURLToPath(
  new URL('../src/blueprints/assets/photos/portfolio/', import.meta.url),
)

for (const locale of ['en', 'fr'] as const) {
  const copy = portfolioCopyFor(locale)
  const model = portfolioSchema(copy)
  const media = mediaOf(copy)
  const pages = buildPortfolioDemoPages(copy, { media })
  const fr = locale === 'fr'

  describe(`portfolio blueprint (${locale}), content model and the studio’s work`, () => {
    it('declares the four conventional SEO override fields on every routed collection', () => {
      for (const collection of [model.project, model.page]) {
        expect(Object.keys(collection.fields)).toEqual(
          expect.arrayContaining(['seoTitle', 'seoDescription', 'seoImage', 'seoNoindex']),
        )
      }
    })

    it('routes the work in the language of the site, and pages generically', () => {
      const first = copy.projects[0]?.slug
      expect(matchPath(model.collections, `/${fr ? 'projets' : 'work'}/${first}`)).toEqual({
        collection: 'project',
        locale: null,
        params: { slug: first },
      })
      expect(matchPath(model.collections, `/${copy.pageSlugs.studio}`)).toEqual({
        collection: 'page',
        locale: null,
        params: { slug: copy.pageSlugs.studio },
      })
    })

    it('files work under real client, discipline and team taxonomies, and keeps the caption fields as plain text', () => {
      expect(model.taxonomies.map((taxonomy) => taxonomy.name)).toEqual(
        fr ? ['client', 'disciplines', 'collaborateurs'] : ['client', 'disciplines', 'team'],
      )
      expect(model.project.fields.clientArchive?.kind).toBe('taxonomy')
      expect(model.project.fields.disciplines?.kind).toBe('taxonomy')
      expect(model.project.fields.team?.kind).toBe('taxonomy')
      expect(model.project.fields.client?.kind).toBe('text')
      expect(model.project.fields.discipline?.kind).toBe('text')
      expect(model.project.fields.coverImage?.kind).toBe('media')
      const pack = createPortfolioContentPack(locale)
      expect(pack.defaultTheme).toBe('@cogenta/theme-portfolio')
      expect(pack.taxonomies?.map((taxonomy) => taxonomy.name)).toEqual(
        model.taxonomies.map((taxonomy) => taxonomy.name),
      )
    })

    it('shows between six and eight projects, for as many different clients', () => {
      expect(copy.projects.length).toBeGreaterThanOrEqual(6)
      expect(copy.projects.length).toBeLessThanOrEqual(8)
      const slugs = copy.projects.map((demo) => demo.slug)
      expect(new Set(slugs).size).toBe(slugs.length)
      const clients = copy.projects.map((demo) => demo.client.slug)
      expect(new Set(clients).size).toBe(clients.length)
    })

    it('writes the lead case studies at 300 to 700 words, and no project as a caption alone', () => {
      const counts = copy.projects.map((demo) => wordCount(demo))
      expect(counts.filter((words) => words >= 300).length).toBeGreaterThanOrEqual(3)
      for (const [index, words] of counts.entries()) {
        const slug = copy.projects[index]?.slug
        expect(words, slug).toBeGreaterThanOrEqual(150)
        expect(words, slug).toBeLessThanOrEqual(700)
      }
      // The newest project leads the grid, so it is one of the long ones.
      expect(
        wordCount(copy.projects.at(-1) as PortfolioCopy['projects'][number]),
      ).toBeGreaterThanOrEqual(300)
    })

    it('dates the projects oldest first, so creation order matches the years visitors read', () => {
      const dates = copy.projects.map((demo) => Date.parse(demo.publishedAt))
      expect(dates.every((date) => Number.isFinite(date))).toBe(true)
      expect([...dates].sort((a, b) => a - b)).toEqual(dates)
      expect(new Set(dates).size).toBe(dates.length)
    })

    it('credits every project to disciplines and people the blueprint declares', () => {
      const disciplineSlugs = new Set(copy.disciplines.map((demo) => demo.slug))
      const people = new Set(copy.team.map((demo) => demo.slug))
      const discipline = new Map(copy.disciplines.map((demo) => [demo.slug, demo.name]))
      for (const demo of copy.projects) {
        expect(demo.disciplines.length, demo.slug).toBeGreaterThan(0)
        expect(demo.team.length, demo.slug).toBeGreaterThan(0)
        for (const slug of demo.disciplines) expect(disciplineSlugs.has(slug), slug).toBe(true)
        for (const slug of demo.team) expect(people.has(slug), slug).toBe(true)
        // The caption under the cover names the first discipline the project is filed under.
        expect(demo.discipline, demo.slug).toBe(discipline.get(demo.disciplines[0] as string))
        expect(
          demo.title.includes(demo.client.name) && demo.title !== demo.client.name,
          demo.slug,
        ).toBe(false)
      }
    })

    it('writes every project page as valid contract-B blocks that show the work, not only describe it', () => {
      for (const demo of copy.projects) {
        const blocks = portfolioProjectBlocks(demo, { siteName: DEFAULT_STUDIO_NAME }, media)
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
      for (const demo of copy.projects) {
        const blocks = portfolioProjectBlocks(demo, { siteName: DEFAULT_STUDIO_NAME }, {})
        expect(() => parseBlocks([...blocks]), demo.slug).not.toThrow()
        expect(JSON.stringify(blocks), demo.slug).not.toContain('"media"')
      }
    })

    it('names the studio the site belongs to, in its copy and its address, and falls back to a fictional one', () => {
      const named = allDemoCopy(copy, 'Atelier Nord').join('\n')
      expect(named).toContain('Atelier Nord')
      expect(named).toContain('hello@ateliernord.com')
      expect(named).not.toContain(DEFAULT_STUDIO_NAME)
      expect(named).not.toContain('studiohale')
      expect(allDemoCopy(copy, DEFAULT_STUDIO_NAME).join('\n')).toContain(DEFAULT_STUDIO_NAME)
    })

    it('never talks about the CMS, the scaffold or the demo itself', () => {
      const text = allDemoCopy(copy, DEFAULT_STUDIO_NAME).join('\n')
      expect(text).not.toMatch(
        /cogenta|scaffold|\bdemo\b|démo|editable|lorem|javascript|placeholder|this (theme|template|website)/i,
      )
    })

    it('invents its clients rather than borrowing sample-company names', () => {
      const text = allDemoCopy(copy, DEFAULT_STUDIO_NAME).join('\n')
      expect(text).not.toMatch(
        /contoso|fabrikam|northwind|tailspin|adventure works|wide world importers|woodgrove|litware|proseware|coho|alpine ski house|lamna|trey research|fourth coffee|wingtip|humongous|lucerne|relecloud|adatum|acme|globex|initech|umbrella corp/i,
      )
    })

    it('keeps to the studio charter: no buzzwords, no exclamation marks, at most one em dash per text', () => {
      const buzzwords =
        /\b(seamless|unlock|elevate|empower|supercharge|streamline|cutting-edge|robust|leverage|synergy|innovative|world-class|bespoke solutions|passionate|game-chang)|innovant|révolutionn|de pointe|clé en main|incontournable|synergie|passionné/i
      for (const text of allDemoCopy(copy, DEFAULT_STUDIO_NAME)) {
        expect(text, text).not.toMatch(buzzwords)
        expect(text, text).not.toMatch(/!/)
        expect((text.match(/—/g) ?? []).length, text).toBeLessThanOrEqual(1)
        expect(text, text).not.toMatch(/\bnot\b[^.;:]*,\s*but\b/i)
        expect(text, text).not.toMatch(/\bisn[’']t\b[^.;:]*[,;]\s*it[’']s\b/i)
      }
    })

    it('titles no project, block or section as a question; only the questions of an FAQ ask one', () => {
      for (const title of allTitles(copy)) expect(title, title).not.toMatch(/\?/)
    })

    it('never gives a fictional person a real face', () => {
      // Testimonials, quotes and the team are named without a portrait: a
      // real photograph of a real person would present them as someone they
      // are not.
      expect(copy.media.some((item) => /avatar|portrait/i.test(item.name))).toBe(false)
    })

    it('opens the home page on a statement that names the studio, then the work', () => {
      const blocks = buildPortfolioHomeBlocks(copy, { siteName: 'Atelier Nord' })
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
      for (const demo of buildPortfolioDemoPages(copy)) {
        for (const block of demo.blocks) {
          if (block._type !== 'collectionList') continue
          expect(['id', 'createdAt', 'updatedAt']).toContain(block.sort?.field)
        }
      }
    })

    it('seeds valid contract-B pages that use most of the vocabulary', () => {
      const types = new Set<string>()
      for (const demo of pages) {
        expect(() => parseBlocks([...demo.blocks]), demo.slug).not.toThrow()
        for (const block of demo.blocks) types.add(block._type)
      }
      for (const demo of copy.projects) {
        for (const block of portfolioProjectBlocks(demo, { siteName: 'X' }, media))
          types.add(block._type)
      }
      expect(types.size).toBeGreaterThanOrEqual(11)
      expect(pages.map((demo) => demo.slug)).toEqual([
        'home',
        copy.pageSlugs.work,
        copy.pageSlugs.studio,
        copy.pageSlugs.contact,
        copy.pageSlugs.privacy,
        copy.pageSlugs.credits,
      ])
    })

    it('links every menu item and every in-page link to a page the blueprint seeds or an archive the server provides', () => {
      const taxonomies = copy.schema.taxonomies
      const routes = new Set([
        ...pages.map((demo) => `/${demo.slug}`),
        ...copy.projects.map((demo) => `${copy.schema.routes.project.replace(':slug', demo.slug)}`),
        ...copy.disciplines.map((demo) => `/${taxonomies.disciplines.name}/${demo.slug}`),
        ...copy.team.map((demo) => `/${taxonomies.team.name}/${demo.slug}`),
        ...copy.projects.map((demo) => `/${taxonomies.client.name}/${demo.client.slug}`),
      ])
      const menus = portfolioMenus(copy)
      for (const item of [...menus.header, ...menus.footer]) {
        expect(routes.has(item.url ?? ''), item.url).toBe(true)
      }
      expect(menus.headerAction).toBeUndefined()
      const hrefs = JSON.stringify([
        ...pages.map((demo) => demo.blocks),
        ...copy.projects.map((demo) => portfolioProjectBlocks(demo, { siteName: 'X' }, media)),
      ]).match(/"href":"[^"]+"/g)
      for (const match of hrefs ?? []) {
        const href = match.slice(8, -1)
        if (/^(mailto|tel|https):/.test(href)) continue
        expect(routes.has(href), href).toBe(true)
      }
    })

    it('links the photo credits from the footer, and only from the footer', () => {
      const menus = portfolioMenus(copy)
      const credits = `/${copy.pageSlugs.credits}`
      expect(menus.footer.map((item) => item.url)).toContain(credits)
      expect(menus.header.map((item) => item.url)).not.toContain(credits)
    })

    it('closes comments on the work, and carries a footer note a real studio would write', () => {
      const settings = portfolioSiteSettings(copy)
      expect(settings['discussion.enabled']).toBe(false)
      const note = String(settings['general.footerNote'])
      expect(note).toMatch(fr ? /rue Saint-Polycarpe/ : /Hatherley Mews/)
      expect(note).not.toMatch(/create-cogenta|scaffold/i)
    })

    it('shows more work after a project and the other terms beside an index, never a column beside the work', () => {
      const widgets = portfolioWidgets(copy)
      const taxonomies = new Set(model.taxonomies.map((taxonomy) => taxonomy.name))
      const routes = new Set([
        ...pages.map((demo) => `/${demo.slug}`),
        ...copy.projects.map((demo) => copy.schema.routes.project.replace(':slug', demo.slug)),
      ])
      for (const widget of widgets) {
        const settings = validateWidgetSettings(widget.type, widget.settings)
        const { pages: shown } = validateWidgetVisibility(widget.visibility)
        const text = JSON.stringify(settings)
        // The e-mail address is derived from the site's name; a widget cannot follow it.
        expect(text).not.toMatch(/@/)
        expect(text).not.toMatch(/Studio Hale/)
        for (const href of (text.match(/"href":"[^"]+"/g) ?? []).map((match) =>
          match.slice(8, -1),
        )) {
          expect(routes.has(href), href).toBe(true)
        }
        for (const target of shown.targets) {
          if (target.kind === 'path') expect(routes.has(target.path), target.path).toBe(true)
          if (target.kind === 'taxonomy') expect(taxonomies.has(target.taxonomy)).toBe(true)
          if (target.kind === 'collection') expect(target.collection).toBe(model.project.name)
        }
        if (widget.area === 'sidebar') {
          expect(shown.mode, widget.type).toBe('only')
          for (const target of shown.targets) expect(['taxonomy', 'search']).toContain(target.kind)
          expect(widget.type).toBe('terms')
          for (const target of shown.targets) {
            if (target.kind === 'taxonomy') expect(settings.taxonomy).toBe(target.taxonomy)
          }
        } else if (widget.area === 'content-after') {
          expect(widget.type).toBe('relatedEntries')
          expect(settings).toMatchObject({ showImage: true })
          expect(shown).toEqual({
            mode: 'only',
            targets: [{ kind: 'collection', collection: 'project' }],
          })
        } else {
          expect(widget.area).toBe('footer-1')
          expect(shown.mode).toBe('except')
          expect(shown.targets).toContainEqual({ kind: 'home' })
          expect(shown.targets).toContainEqual({
            kind: 'path',
            path: `/${copy.pageSlugs.contact}`,
          })
        }
      }
      expect(widgets.map((widget) => widget.area)).not.toContain('content-before')
      // Every archive has its own taxonomy's terms beside it, and only one list.
      for (const taxonomy of taxonomies) {
        const beside = widgets.filter((widget) =>
          validateWidgetVisibility(widget.visibility).pages.targets.some(
            (target) => target.kind === 'taxonomy' && target.taxonomy === taxonomy,
          ),
        )
        expect(beside, taxonomy).toHaveLength(1)
      }
    })

    it('points every media slot at a bundled JPEG, so no abstract placeholder art is ever seeded', () => {
      const specs = portfolioMediaSpecs(copy)
      expect(specs.length).toBeGreaterThanOrEqual(copy.projects.length)
      for (const spec of specs) {
        expect(spec.photo, spec.name).toMatch(/^portfolio\/[a-z-]+\.jpg$/)
        const bytes = loadPhotoAsset(spec.photo as string)
        expect(bytes, spec.photo).toBeDefined()
        expect(bundledImageType(bytes as Uint8Array).extension, spec.photo).toBe('jpg')
        expect(spec.alt.length, spec.name).toBeGreaterThan(30)
      }
    })

    it('uses every bundled image it declares, and gives every project a cover among them', () => {
      const declared = new Set(copy.media.map((item) => item.name))
      const used = new Set<string>()
      const collect = (value: unknown): void => {
        if (typeof value === 'string' && value.startsWith('media-')) used.add(value.slice(6))
        else if (Array.isArray(value)) value.forEach(collect)
        else if (value !== null && typeof value === 'object') Object.values(value).forEach(collect)
      }
      for (const demo of copy.projects) {
        expect(declared.has(demo.cover), demo.slug).toBe(true)
        used.add(demo.cover)
        collect(portfolioProjectBlocks(demo, { siteName: DEFAULT_STUDIO_NAME }, media))
      }
      for (const demo of pages) collect(demo.blocks)
      expect([...declared].filter((name) => !used.has(name))).toEqual([])
    })

    it('credits every photograph it bundles, with its author, licence and source, on a page it seeds', () => {
      const photos = readdirSync(PHOTO_DIRECTORY)
      const credited = new Set(PORTFOLIO_PHOTO_CREDITS.map((credit) => credit.file))
      expect(photos.sort()).toEqual([...credited].sort())
      for (const spec of portfolioMediaSpecs(copy)) {
        expect(credited.has((spec.photo as string).replace('portfolio/', '')), spec.name).toBe(true)
      }
      for (const credit of PORTFOLIO_PHOTO_CREDITS) {
        expect(credit.author.length).toBeGreaterThan(0)
        expect(credit.source).toMatch(/^https:\/\/commons\.wikimedia\.org\//)
        expect(credit.licence).toMatch(/^(CC0 1\.0|Public domain|CC BY [0-9.]+)$/)
      }
      const creditsPage = pages.find((demo) => demo.slug === copy.pageSlugs.credits)
      const rendered = JSON.stringify(creditsPage)
      expect(rendered).toContain('creativecommons.org/licenses/by/4.0/')
      for (const credit of PORTFOLIO_PHOTO_CREDITS) expect(rendered).toContain(credit.source)
    })
  })
}

describe('portfolio blueprint, the two languages', () => {
  const en = portfolioCopyFor('en')
  const fr = portfolioCopyFor('fr')

  it('picks the French copy for any French locale and the English one otherwise', () => {
    expect(portfolioCopyFor('fr-FR')).toBe(fr)
    expect(portfolioCopyFor('fr')).toBe(fr)
    expect(portfolioCopyFor('en-GB')).toBe(en)
    expect(portfolioCopyFor('de')).toBe(en)
    const pack = contentPackFor('portfolio', 'fr-CA')
    expect(pack?.menus?.header.map((item) => item.label)).toEqual(['Projets', 'Studio', 'Contact'])
    expect(contentPackFor('portfolio', 'en')?.menus?.header.map((item) => item.label)).toEqual([
      'Work',
      'Studio',
      'Contact',
    ])
    expect(portfolioContentPack.menus?.header[0]?.label).toBe('Work')
  })

  it('writes the French site in French, addresses and money included', () => {
    const text = [
      ...buildPortfolioDemoPages(fr)
        .filter((demo) => demo.slug !== fr.pageSlugs.credits)
        .flatMap((demo) => [demo.title, ...demo.blocks.flatMap(blockTexts)]),
      ...fr.projects.flatMap((demo) => [demo.title, demo.summary]),
    ].join('\n')
    expect(fr.projects[0]?.title).toBe('Un an sur l’étang')
    expect(text).toContain('Lyon')
    expect(fr.menus.labels.credits).toBe('Crédits photos')
    expect(text).toMatch(/\d\s€/)
    expect(text).not.toContain('London')
    expect(text).not.toContain('£')
    expect(text).not.toMatch(/\b(the|and|with|which|for the)\b/)
    expect(fr.schema.routes.project).toBe('/projets/:slug')
    expect(fr.pageSlugs.credits).toBe('credits-photos')
  })

  it('writes the English site in English, addresses and money included', () => {
    const text = [
      ...buildPortfolioDemoPages(en)
        .filter((demo) => demo.slug !== en.pageSlugs.credits)
        .flatMap((demo) => [demo.title, ...demo.blocks.flatMap(blockTexts)]),
      ...en.projects.flatMap((demo) => [demo.title, demo.summary]),
    ].join('\n')
    expect(en.projects[0]?.title).toBe('A year on the lagoon')
    expect(text).toContain('London')
    expect(en.menus.labels.credits).toBe('Photo credits')
    expect(text).toContain('£')
    expect(text).not.toContain('Lyon')
    expect(text).not.toMatch(/\b(les|des|une|pour|avec|dans)\b/)
    expect(en.schema.routes.project).toBe('/work/:slug')
  })

  it('sets French typography: no-break spaces before ? ! : ; and inside thousands', () => {
    const text = buildPortfolioDemoPages(fr)
      .flatMap((demo) => demo.blocks.flatMap(blockTexts))
      .concat(
        fr.projects.flatMap((demo) =>
          portfolioProjectBlocks(demo, { siteName: 'X' }, {}).flatMap(blockTexts),
        ),
      )
      .join('\n')
    expect(text).not.toMatch(/ [?!:;»€%]/)
    expect(text).not.toMatch(/\d \d{3}\b/)
    expect(text).toContain('Comment commence une commande ?')
    expect(text).toContain('1 900')
    expect(typesetFrench('Quoi ? Oui : non « ok » 10 000 €')).toBe(
      'Quoi\u00a0? Oui\u00a0: non «\u00a0ok\u00a0» 10\u00a0000\u00a0€',
    )
  })

  it('keeps the English typography plain', () => {
    const text = buildPortfolioDemoPages(en)
      .flatMap((demo) => demo.blocks.flatMap(blockTexts))
      .join('\n')
    expect(text).not.toContain(' ')
  })

  it('gives both languages the same sites: same projects, same photographs, same people', () => {
    expect(fr.projects.map((demo) => demo.cover)).toEqual(en.projects.map((demo) => demo.cover))
    expect(fr.projects.map((demo) => demo.publishedAt)).toEqual(
      en.projects.map((demo) => demo.publishedAt),
    )
    expect(fr.media.map((item) => item.file)).toEqual(en.media.map((item) => item.file))
    expect(fr.team.map((person) => person.slug)).toEqual(en.team.map((person) => person.slug))
  })

  it('keeps the English exports the rest of the repository imports', () => {
    expect(PORTFOLIO_COLLECTIONS.map((collection) => collection.name)).toEqual(['project', 'page'])
    expect(PORTFOLIO_TAXONOMIES.map((taxonomy) => taxonomy.name)).toEqual([
      'client',
      'disciplines',
      'team',
    ])
    expect(studioEmail('Café Éditions')).toBe('hello@cafeeditions.com')
    expect(studioEmail('Studio Hale', 'jobs')).toBe('jobs@studiohale.com')
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
