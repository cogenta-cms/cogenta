import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { VocabularyBlock } from '@cogenta/blocks'
import { parseBlocks } from '@cogenta/blocks'
import { matchPath } from '@cogenta/schema'
import { ICON_NAMES } from '@cogenta/theme-canonical'
import { describe, expect, it } from 'vitest'
import {
  associationCopyFor,
  associationEmail,
  associationEventBlocks,
  associationFooter,
  associationFooterNote,
  associationMediaSpecs,
  associationMenus,
  associationProgrammeBlocks,
  associationSchema,
  associationSiteSettings,
  buildAssociationDemoPages,
  createAssociationContentPack,
} from '../src/blueprints/association.js'
import { ASSOCIATION_COPY_EN } from '../src/blueprints/association-copy-en.js'
import { ASSOCIATION_PHOTO_CREDITS } from '../src/blueprints/association-credits.js'
import { NBSP } from '../src/blueprints/association-typography.js'
import { contentPackFor } from '../src/blueprints/content-packs.js'
import { bundledImageType, loadPhotoAsset } from '../src/blueprints/photo-assets.js'
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
  'markDefs',
  'variant',
  'icon',
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

/** One unit of text per paragraph, title, caption and line: the unit the charter counts in. */
function blockTexts(block: VocabularyBlock): string[] {
  if (block._type === 'prose') return block.body.map((node) => textsOfValue(node).join(''))
  if (block._type === 'testimonial') return block.quote.map((node) => textsOfValue(node).join(''))
  return textsOfValue(block)
}

function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

const PHOTO_FOLDER = fileURLToPath(
  new URL('../src/blueprints/assets/photos/association/', import.meta.url),
)

for (const locale of ['en', 'fr'] as const) {
  const copy = associationCopyFor(locale)
  const model = associationSchema(copy)
  const specs = associationMediaSpecs(copy)
  const MEDIA = Object.fromEntries(specs.map((spec) => [spec.name, `media-${spec.name}`]))
  const pageList = (siteName?: string) => buildAssociationDemoPages(copy, MEDIA, siteName)
  const home = (siteName?: string) => pageList(siteName)[0]
  const everyBlock = (siteName?: string): readonly VocabularyBlock[] => [
    ...pageList(siteName).flatMap((demo) => demo.blocks),
    ...copy.programmes.flatMap((item) => associationProgrammeBlocks(copy, item)),
    ...copy.events.flatMap((item) => associationEventBlocks(copy, item)),
  ]
  const allDemoCopy = (siteName: string): string[] =>
    [
      ...pageList(siteName).map((demo) => demo.title),
      ...everyBlock(siteName).flatMap(blockTexts),
      ...copy.programmes.flatMap((item) => [
        item.title,
        item.summary,
        item.schedule,
        item.location,
        item.audience,
        item.cost,
      ]),
      ...copy.events.flatMap((item) => [
        item.title,
        item.description,
        item.location,
        item.cost,
        item.booking,
      ]),
      ...specs.map((spec) => spec.alt),
      ...copy.menus.header.map((item) => item.label),
      copy.menus.action,
      ...copy.footer.flatMap((column) => [column.heading, ...column.links.map((l) => l.label)]),
      copy.settings.tagline,
      associationFooterNote(copy, siteName),
    ].filter((text) => text !== '')
  const pageSlugs = pageList().map((demo) => demo.slug)
  const programmePath = (slug: string) => model.programme.routing?.pattern.replace(':slug', slug)
  const eventPath = (slug: string) => model.event.routing?.pattern.replace(':slug', slug)
  const ROUTES = new Set([
    ...pageSlugs.map((slug) => `/${slug}`),
    ...copy.programmes.map((item) => programmePath(item.slug) as string),
    ...copy.events.map((item) => eventPath(item.slug) as string),
  ])
  const eventsPage = `/${copy.pageSlugs.events}`
  const homeBlocks = home()?.blocks ?? []

  describe(`association blueprint (${locale}), content model`, () => {
    it('declares the four conventional SEO override fields on every routed collection', () => {
      for (const collection of model.collections) {
        expect(Object.keys(collection.fields), collection.name).toEqual(
          expect.arrayContaining(['seoTitle', 'seoDescription', 'seoImage', 'seoNoindex']),
        )
      }
    })

    it('gives an event a start, an end, a place, an address, a cost and a booking note the theme reads', () => {
      expect(model.event.fields.date?.kind).toBe('datetime')
      expect(model.event.fields.endsAt?.kind).toBe('datetime')
      for (const name of ['location', 'address', 'cost', 'booking', 'description'] as const) {
        expect(model.event.fields[name]?.kind, name).toBe('text')
      }
      expect(model.event.fields.coverImage?.kind).toBe('media')
    })

    it('gives a programme a schedule, a place, an audience, a cost and a contact', () => {
      for (const name of [
        'summary',
        'schedule',
        'location',
        'address',
        'audience',
        'cost',
        'contact',
      ] as const) {
        expect(model.programme.fields[name]?.kind, name).toBe('text')
      }
      expect(createAssociationContentPack(locale).defaultTheme).toBe('@cogenta/theme-association')
    })

    it('routes the collections in the language of the site and resolves /:slug generically', () => {
      const [eventExample, programmeExample] = [copy.events[0], copy.programmes[0]]
      expect(matchPath(model.collections, eventPath(eventExample?.slug ?? '') ?? '')).toEqual({
        collection: 'event',
        locale: null,
        params: { slug: eventExample?.slug },
      })
      expect(
        matchPath(model.collections, programmePath(programmeExample?.slug ?? '') ?? ''),
      ).toEqual({
        collection: 'programme',
        locale: null,
        params: { slug: programmeExample?.slug },
      })
      expect(matchPath(model.collections, `/${copy.pageSlugs.donate}`)).toEqual({
        collection: 'page',
        locale: null,
        params: { slug: copy.pageSlugs.donate },
      })
      expect(copy.pageSlugs.home).toBe('home')
    })

    it('labels the collections for the administration in the language of the site', () => {
      expect(model.event.labels?.plural).toBe(locale === 'fr' ? 'Événements' : 'Events')
      expect(model.programme.labels?.plural).toBe(locale === 'fr' ? 'Actions' : 'Programmes')
    })
  })

  describe(`association blueprint (${locale}), programmes and events`, () => {
    it('describes four programmes, each with a page of real reading and a photograph', () => {
      expect(copy.programmes).toHaveLength(4)
      for (const item of copy.programmes) {
        const blocks = associationProgrammeBlocks(copy, item)
        expect(() => parseBlocks([...blocks]), item.slug).not.toThrow()
        const words = blockTexts(blocks[0] as VocabularyBlock)
          .join(' ')
          .split(/\s+/).length
        expect(words, item.slug).toBeGreaterThanOrEqual(150)
        expect(
          specs.some((spec) => spec.name === item.photo),
          item.slug,
        ).toBe(true)
      }
    })

    it('dates six events from one to six weeks out, in order, each on its own day', () => {
      expect(copy.events).toHaveLength(6)
      const days = copy.events.map((item) => item.daysFromNow)
      expect(days).toEqual([...days].sort((a, b) => a - b))
      expect(Math.min(...days)).toBeGreaterThanOrEqual(1)
      expect(Math.max(...days)).toBeLessThanOrEqual(45)
      expect(new Set(days).size).toBe(6)
      for (const item of copy.events) {
        expect(item.end[0] * 60 + item.end[1], item.slug).toBeGreaterThan(
          item.start[0] * 60 + item.start[1],
        )
      }
      expect(copy.events[0]?.slug).toBe(
        locale === 'fr' ? 'soiree-accueil-benevoles' : 'volunteer-orientation-evening',
      )
    })

    it('never names a weekday or a season in an event’s copy, since the date moves with the scaffold', () => {
      const weekday =
        locale === 'fr'
          ? /\b(lundi|mardi|mercredi|vendredi|samedi|dimanche)\b/i
          : /\b(monday|tuesday|wednesday|friday|saturday|sunday)\b/i
      const season =
        locale === 'fr'
          ? /\b(printemps|été|automne|hiver|moisson|noël|pâques)\b/i
          : /\b(spring|summer|autumn|fall|winter|harvest|christmas|easter)\b/i
      for (const item of copy.events) {
        const text = [
          item.title,
          item.slug,
          item.description,
          ...blockTexts(associationEventBlocks(copy, item)[0] as VocabularyBlock),
        ].join(' ')
        expect(text, item.slug).not.toMatch(weekday)
        expect(text, item.slug).not.toMatch(season)
      }
    })

    it('writes clock times in an event’s copy that fall within its own start and end', () => {
      for (const item of copy.events) {
        const text = [
          item.description,
          ...blockTexts(associationEventBlocks(copy, item)[0] as VocabularyBlock),
        ].join(' ')
        const start = item.start[0] * 60 + item.start[1]
        const end = item.end[0] * 60 + item.end[1]
        const matches =
          locale === 'fr'
            ? [...text.matchAll(/(\d{1,2}) h(?: (\d{2}))?/g)].map((m) => ({
                text: m[0],
                minutes: Number(m[1]) * 60 + Number(m[2] ?? 0),
              }))
            : [...text.matchAll(/\b(\d{1,2})(?:\.(\d{2}))?(am|pm)\b/g)].map((m) => ({
                text: m[0],
                minutes: ((Number(m[1]) % 12) + (m[3] === 'pm' ? 12 : 0)) * 60 + Number(m[2] ?? 0),
              }))
        for (const match of matches) {
          // The doors of an evening open before it starts: 30 minutes of grace.
          expect(match.minutes, `${item.slug}: ${match.text}`).toBeGreaterThanOrEqual(start - 30)
          expect(match.minutes, `${item.slug}: ${match.text}`).toBeLessThanOrEqual(end)
        }
      }
    })

    it('gives every event a page of its own text and the other dates under it', () => {
      for (const item of copy.events) {
        const blocks = associationEventBlocks(copy, item)
        expect(() => parseBlocks([...blocks]), item.slug).not.toThrow()
        expect(blocks.map((block) => block._type)).toEqual(['prose', 'collectionList'])
      }
    })
  })

  describe(`association blueprint (${locale}), pictures`, () => {
    it('points every media slot at a bundled file described in a full sentence', () => {
      for (const spec of specs) {
        expect(spec.photo, spec.name).toMatch(/^association\/[a-z-]+\.(png|jpg)$/)
        expect(loadPhotoAsset(spec.photo as string), spec.photo).toBeDefined()
        expect(spec.alt.length, spec.name).toBeGreaterThan(
          spec.name.startsWith('partner-') ? 6 : 30,
        )
        expect(spec.alt, spec.name).not.toMatch(
          /placeholder|abstract|composition|stand-in|illustration|cover image/i,
        )
      }
    })

    it('renders every partner wordmark as a PNG at one height', () => {
      const heights = copy.partners.map((partner) => {
        const bytes = loadPhotoAsset(`association/${partner.file}`) as Uint8Array
        expect(bundledImageType(bytes).extension, partner.key).toBe('png')
        return pngSize(bytes).height
      })
      expect(new Set(heights).size).toBe(1)
    })

    it('opens the home page on a photograph and names every partner', () => {
      expect(homeBlocks[0]).toMatchObject({ _type: 'hero', media: 'media-hero' })
      const strip = homeBlocks.find((block) => block._type === 'logoStrip')
      expect(strip?._type === 'logoStrip' ? strip.logos.map((logo) => logo.media) : []).toEqual(
        copy.partners.map((partner) => `media-${partner.key}`),
      )
    })

    it('leaves out every picture block, never an empty one, when no media was seeded', () => {
      for (const demo of buildAssociationDemoPages(copy, {})) {
        expect(() => parseBlocks([...demo.blocks]), demo.slug).not.toThrow()
        for (const block of demo.blocks) {
          expect(['logoStrip', 'logos', 'mediaFigure', 'gallery'], demo.slug).not.toContain(
            block._type,
          )
          if (block._type === 'hero') expect(block.media).toBeUndefined()
        }
      }
    })

    it('puts no portrait beside a testimonial: its author is a character of the fiction', () => {
      const quote = homeBlocks.find((block) => block._type === 'testimonial')
      expect(quote?._type === 'testimonial' ? quote.attribution : undefined).not.toHaveProperty(
        'avatar',
      )
    })
  })

  describe(`association blueprint (${locale}), copy`, () => {
    it('names the organisation the site belongs to, in its copy and its addresses, and falls back to its own name', () => {
      const named = allDemoCopy('Common Ground').join('\n')
      expect(named).toContain('Common Ground')
      expect(named).toContain(`hello@commonground.${copy.identity.emailSuffix}`)
      expect(named).not.toContain(copy.defaultName)
      expect(allDemoCopy(copy.defaultName).join('\n')).toContain(copy.defaultName)
      expect(associationEmail('Friends & Neighbours', 'volunteer', copy)).toBe(
        `volunteer@friendsandneighbours.${copy.identity.emailSuffix}`,
      )
      expect(associationEmail('Les Voisins d’Aubrières', 'hello', copy)).toBe(
        `hello@lesvoisinsdaubrieres.${copy.identity.emailSuffix}`,
      )
    })

    it('never talks about the CMS, the scaffold or the site itself as a demonstration', () => {
      const text = allDemoCopy(copy.defaultName).join('\n')
      expect(text).not.toMatch(
        /cogenta|scaffold|\bdemo\b|editable|lorem|placeholder|this (theme|template|site is)|blueprint|riverside community fund/i,
      )
    })

    it('invents its people and partners rather than borrowing sample names', () => {
      const text = allDemoCopy(copy.defaultName).join('\n')
      expect(text).not.toMatch(/contoso|fabrikam|northwind|acme|john doe|jane doe|example corp/i)
    })

    it('keeps to the studio charter: no buzzwords, no exclamation marks, at most one em dash per text', () => {
      const buzzwords =
        locale === 'fr'
          ? /\b(synerg|disruptif|innovant|solution clé en main|incontournable|booster|booste|révolutionn|expérience unique|à la pointe)/i
          : /\b(seamless|unlock|elevate|empower|supercharge|streamline|cutting-edge|robust|leverage|synergy|innovative|world-class|game-chang|revolutioni[sz]e|next-gen|effortless|transformative|make a difference|change lives)/i
      for (const text of allDemoCopy(copy.defaultName)) {
        expect(text, text).not.toMatch(buzzwords)
        expect(text, text).not.toContain('!')
        expect((text.match(/—/g) ?? []).length, text).toBeLessThanOrEqual(1)
      }
    })

    it('titles no page, block or section as a question; only the questions of an FAQ ask one', () => {
      const titles = [
        ...pageList().map((demo) => demo.title),
        ...everyBlock().flatMap((block) => {
          const own = 'title' in block && typeof block.title === 'string' ? [block.title] : []
          if (block._type !== 'prose') return own
          return block.body.flatMap((node) =>
            node._type === 'block' && node.style !== 'normal' ? [textsOfValue(node).join('')] : [],
          )
        }),
        ...copy.programmes.map((item) => item.title),
        ...copy.events.map((item) => item.title),
      ]
      for (const title of titles) {
        // The home page's call to action and the events call to host something
        // are statements; a question is only ever an FAQ item.
        if (title === copy.pages({ name: 'x', email: () => '', mailto: () => '' }).events.hostTitle)
          continue
        expect(title, title).not.toMatch(/\?/)
      }
    })

    it('gives every impact figure on the home page a unit and a sentence of context', () => {
      const figures = homeBlocks.find((block) => block._type === 'stats')
      const items = figures?._type === 'stats' ? figures.items : []
      expect(items).toHaveLength(4)
      for (const item of items) {
        expect(item.unit, item.label).toBeDefined()
        expect(item.label.split(/\s+/).length, item.label).toBeGreaterThanOrEqual(8)
      }
    })

    it('shows where the money goes as shares that add up to the whole, on the home page and the finances page', () => {
      const breakdowns = pageList()
        .flatMap((demo) => demo.blocks)
        .filter(
          (block) =>
            block._type === 'statCounter' && block.stats.every((s) => /%$/.test(s.value.trim())),
        )
      expect(breakdowns.length).toBeGreaterThanOrEqual(3)
      for (const block of breakdowns) {
        if (block._type !== 'statCounter') continue
        const total = block.stats.reduce((sum, stat) => sum + Number.parseFloat(stat.value), 0)
        expect(total, block._key).toBe(100)
      }
    })

    it('quotes one named volunteer on the home page', () => {
      const quotes = homeBlocks.filter((block) => block._type === 'testimonial')
      expect(quotes).toHaveLength(1)
      expect(quotes[0]).toMatchObject({
        attribution: {
          name: locale === 'fr' ? 'Marie Lecomte' : 'Joanne Pryce',
        },
      })
    })
  })

  describe(`association blueprint (${locale}), honest actions and navigation`, () => {
    it('seeds valid contract-B pages that use most of the vocabulary', () => {
      const types = new Set(everyBlock().map((block) => block._type))
      for (const demo of pageList()) {
        expect(() => parseBlocks([...demo.blocks]), demo.slug).not.toThrow()
      }
      expect(types.size).toBeGreaterThanOrEqual(13)
      expect(buildAssociationDemoPages(copy, {}).map((demo) => demo.slug)).toEqual([
        'home',
        copy.pageSlugs.whatWeDo,
        copy.pageSlugs.events,
        copy.pageSlugs.volunteer,
        copy.pageSlugs.donate,
        copy.pageSlugs.finances,
        copy.pageSlugs.about,
        copy.pageSlugs.contact,
        copy.pageSlugs.privacy,
        copy.pageSlugs.legal,
        copy.pageSlugs.credits,
      ])
    })

    it('composes the home page in the order of a charity’s site', () => {
      expect(homeBlocks.map((block) => block._type)).toEqual([
        'hero',
        'stats',
        'collectionList',
        'collectionList',
        'testimonial',
        'statCounter',
        'cta',
        'logoStrip',
        'faq',
      ])
    })

    it('never takes a payment on the site: every donation is a transfer, a cheque, cash or a conversation', () => {
      const everything = JSON.stringify(everyBlock())
      expect(everything).not.toMatch(
        /card number|pay now|checkout|paypal|stripe|donate online|sort code|account number: \d|iban\s*:?\s*fr\d/i,
      )
      const donate = JSON.stringify(
        pageList().find((d) => d.slug === copy.pageSlugs.donate)?.blocks,
      )
      expect(donate).toContain(`mailto:${copy.identity.mailboxes.treasurer}@`)
      expect(donate).toMatch(locale === 'fr' ? /virement permanent/i : /standing order/i)
      expect(donate).toMatch(locale === 'fr' ? /reçu fiscal/ : /Gift Aid/)
      expect(associationMenus(copy).headerAction).toEqual({
        label: locale === 'fr' ? 'Faire un don' : 'Donate',
        url: `/${copy.pageSlugs.donate}`,
      })
    })

    it('makes volunteering a real route: an email, a telephone number and the next orientation evening', () => {
      const volunteer = JSON.stringify(
        pageList().find((d) => d.slug === copy.pageSlugs.volunteer)?.blocks,
      )
      expect(volunteer).toContain(`mailto:${copy.identity.mailboxes.volunteer}@`)
      expect(volunteer).toContain(copy.identity.phoneHref)
      expect(volunteer).toContain(eventPath(copy.events[0]?.slug ?? '') as string)
    })

    it('draws the icons of every featureGrid from the set the themes can draw', () => {
      for (const block of everyBlock()) {
        if (block._type !== 'featureGrid') continue
        for (const item of block.items) {
          if (item.icon !== undefined) expect(ICON_NAMES as readonly string[]).toContain(item.icon)
        }
      }
    })

    it('links every menu item and every in-page link to a page or an entry the blueprint seeds', () => {
      const menus = associationMenus(copy)
      const menuUrls = [
        ...menus.header.map((item) => item.url),
        menus.headerAction?.url,
        ...associationFooter(copy).flatMap((column) => column.links.map((l) => l.url)),
      ]
      for (const url of menuUrls) expect(ROUTES.has(url ?? ''), url).toBe(true)
      const hrefs = JSON.stringify(everyBlock()).match(/"href":"[^"]+"/g) ?? []
      expect(hrefs.length).toBeGreaterThan(15)
      for (const match of hrefs) {
        const href = match.slice(8, -1)
        if (/^(mailto|tel|https):/.test(href)) continue
        expect(ROUTES.has(href), href).toBe(true)
      }
      expect(ROUTES.has(eventsPage)).toBe(true)
    })

    it('groups the footer in three headed columns of real links, the last one ending on the photo credits', () => {
      const footer = associationFooter(copy)
      expect(footer).toHaveLength(3)
      for (const column of footer) expect(column.links.length).toBeGreaterThanOrEqual(3)
      expect(footer.at(-1)?.links.at(-1)?.url).toBe(`/${copy.pageSlugs.credits}`)
      expect(associationMenus(copy).footer).toEqual([])
    })

    it('sorts every list on a field contract A can order by', () => {
      const lists = everyBlock().filter((block) => block._type === 'collectionList')
      expect(lists.length).toBeGreaterThan(10)
      for (const block of lists) {
        if (block._type !== 'collectionList') continue
        expect(['id', 'createdAt', 'updatedAt', 'date']).toContain(block.sort?.field)
        if (block.collection === 'event') {
          expect(block.sort?.field).toBe('date')
          // Resolved by the API at every request, never a date frozen at scaffold
          // time: a demo site left running still shows what is coming up.
          expect(block.filter).toEqual({ date: { gte: '$now' } })
        }
      }
    })

    it('closes comments and prints what a registered association prints in its footer', () => {
      expect(associationSiteSettings(copy)['discussion.enabled']).toBe(false)
      const note = associationFooterNote(copy, 'Common Ground')
      expect(note).toContain(copy.identity.registration)
      expect(note).toContain(copy.identity.street)
      expect(note).toContain(copy.identity.phone)
      expect(note).toContain(`hello@commonground.${copy.identity.emailSuffix}`)
    })

    it('seeds a photo credits page that lists every bundled photograph, and links it from the footer', () => {
      const credits = pageList().find((d) => d.slug === copy.pageSlugs.credits)
      const text = JSON.stringify(credits?.blocks)
      for (const credit of ASSOCIATION_PHOTO_CREDITS) {
        expect(text, credit.file).toContain(credit.source)
        expect(text, credit.file).toContain(credit.author)
      }
      expect(
        associationFooter(copy)
          .flatMap((c) => c.links)
          .some((link) => link.url === `/${copy.pageSlugs.credits}`),
      ).toBe(true)
    })
  })
}

describe('association blueprint, language', () => {
  it('writes the English pack in English and the French pack in French', () => {
    const en = associationCopyFor('en')
    const fr = associationCopyFor('fr-FR')
    expect(en.locale).toBe('en')
    expect(fr.locale).toBe('fr')
    expect(associationCopyFor('fr')).toBe(fr)
    expect(associationCopyFor('de')).toBe(en)
    const enHome = buildAssociationDemoPages(en, {})[0]
    const frHome = buildAssociationDemoPages(fr, {})[0]
    expect(JSON.stringify(enHome)).toContain('No one in Ashworth should go hungry')
    expect(JSON.stringify(frHome)).toContain('Personne à Aubrières ne devrait avoir faim')
    expect(JSON.stringify(frHome)).not.toContain('Ashworth')
    expect(JSON.stringify(enHome)).not.toContain('Aubrières')
    expect(fr.programmes.map((item) => item.slug)).toContain('distribution-alimentaire')
    expect(en.programmes.map((item) => item.slug)).toContain('thursday-food-bank')
  })

  it('picks the French pack for a French locale and the English one otherwise', () => {
    for (const locale of ['fr', 'fr-FR', 'FR-be']) {
      const pack = contentPackFor('association', locale)
      expect(pack?.mediaSpecs?.find((spec) => spec.name === 'hero')?.alt).toContain('jardin')
    }
    for (const locale of ['en', 'en-GB', 'de']) {
      const pack = contentPackFor('association', locale)
      expect(pack?.mediaSpecs?.find((spec) => spec.name === 'hero')?.alt).toContain('garden')
    }
  })

  it('writes French as a French reader expects it: guillemets, no-break spaces and « Aubrières » addresses', () => {
    const fr = associationCopyFor('fr')
    const text = [
      // The credits page quotes the English titles Wikimedia Commons gave the files.
      ...buildAssociationDemoPages(fr, {})
        .filter((demo) => demo.slug !== fr.pageSlugs.credits)
        .flatMap((demo) => textsOfValue(demo)),
      ...fr.programmes.flatMap((item) => [item.summary, item.schedule, ...item.body]),
      ...fr.events.flatMap((item) => [item.description, item.cost, item.booking, ...item.body]),
      associationFooterNote(fr, undefined),
      fr.settings.tagline,
    ].join('\n')
    // No plain space before a high punctuation mark, a percent sign or a euro sign.
    expect(text).not.toMatch(/[^\s] [:;?!]/)
    expect(text).not.toMatch(/\d %/)
    expect(text).not.toMatch(/\d €/)
    expect(text).not.toMatch(/\d h \d/)
    // The real characters stand there instead.
    expect(text).toContain(`${NBSP}:`)
    expect(text).toContain(`${NBSP}?`)
    expect(text).toContain(`66${NBSP}%`)
    expect(text).toContain(`17${NBSP}h${NBSP}30`)
    expect(text).toContain(`286${NBSP}400${NBSP}€`)
    expect(text).toContain('03 53 01 18 42')
    expect(text).toContain('rue des Tilleuls')
    expect(text).toContain('59990 Aubrières')
    // A French association's own words.
    expect(text).toMatch(/association loi 1901/)
    expect(text).toMatch(/assemblée générale/i)
    expect(text).toMatch(/adh[ée]rents?/i)
    expect(text).toMatch(/reçu fiscal/)
    expect(text).toMatch(/66 %/)
    // None of the English fiction is left behind.
    expect(text.match(/\b(and|volunteer|donate|Ashworth|Elm Street)\b|£/)).toBeNull()
  })

  it('uses a French telephone number from the range reserved for fiction, and an English one from the range reserved for drama', () => {
    expect(associationCopyFor('fr').identity.phone.replaceAll(NBSP, ' ')).toMatch(
      /^03 53 01 \d\d \d\d$/,
    )
    expect(associationCopyFor('en').identity.phone).toMatch(/^01632 960\d{3}$/)
  })

  it('keeps every English string English: the English copy mentions none of the French fiction', () => {
    const text = JSON.stringify(
      ASSOCIATION_COPY_EN.pages({ name: 'x', email: () => 'x', mailto: () => 'x' }),
    )
    expect(text).not.toMatch(/Aubrières|rue des Tilleuls|association loi/)
  })
})

describe('association blueprint, photographs and their credits', () => {
  it('credits every bundled photograph, and bundles every credited one', async () => {
    const files = (await readdir(PHOTO_FOLDER)).sort()
    const photographs = files.filter((file) => file.endsWith('.jpg'))
    expect(ASSOCIATION_PHOTO_CREDITS.map((credit) => credit.file).sort()).toEqual(photographs)
    for (const credit of ASSOCIATION_PHOTO_CREDITS) {
      expect(credit.licence, credit.file).toMatch(/^(CC0 1\.0|Public domain|CC BY \d\.\d)$/)
      expect(credit.source, credit.file).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/)
      expect(credit.author, credit.file).not.toBe('')
      if (credit.licence.startsWith('CC BY')) expect(credit.licenceUrl, credit.file).toBeDefined()
    }
  })

  it('bundles no picture it does not use, in either language', async () => {
    const files = (await readdir(PHOTO_FOLDER)).sort()
    const used = new Set(
      (['en', 'fr'] as const).flatMap((locale) =>
        associationMediaSpecs(associationCopyFor(locale)).map((spec) =>
          (spec.photo as string).slice('association/'.length),
        ),
      ),
    )
    expect(files.filter((file) => !used.has(file))).toEqual([])
    expect(files).not.toContain('volunteer-portrait.jpg')
  })

  it('keeps the whole folder small enough to ship in a package', async () => {
    let total = 0
    for (const file of await readdir(PHOTO_FOLDER)) {
      const bytes = (await readFile(`${PHOTO_FOLDER}${file}`)).length
      if (file.endsWith('.jpg')) expect(bytes, file).toBeLessThan(420 * 1024)
      total += bytes
    }
    expect(total).toBeLessThan(6 * 1024 * 1024)
  })
})

describe('association blueprint, starting skin', () => {
  it("matches the theme's own palette and typefaces in its starting skin", async () => {
    const theme = JSON.parse(
      await readFile(new URL('../../theme-association/tokens.json', import.meta.url), 'utf8'),
    )
    expect(STARTING_SKINS.association).toEqual(theme)
    expect(STARTING_SKINS.association?.font.serif.startsWith("'Bricolage Grotesque'")).toBe(true)
    expect(STARTING_SKINS.association?.font.sans.startsWith("'Source Sans 3'")).toBe(true)
  })
})
