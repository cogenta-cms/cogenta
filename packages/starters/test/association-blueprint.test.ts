import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { VocabularyBlock } from '@cogenta/blocks'
import { parseBlocks } from '@cogenta/blocks'
import { matchPath } from '@cogenta/schema'
import { ICON_NAMES } from '@cogenta/theme-canonical'
import { describe, expect, it } from 'vitest'
import {
  ASSOCIATION_COLLECTIONS,
  ASSOCIATION_DEMO_EVENTS,
  ASSOCIATION_FOOTER,
  ASSOCIATION_MEDIA_SPECS,
  ASSOCIATION_MENUS,
  ASSOCIATION_PARTNERS,
  ASSOCIATION_PHONE,
  ASSOCIATION_PROGRAMMES,
  ASSOCIATION_SITE_SETTINGS,
  associationContentPack,
  associationEmail,
  associationEventBlocks,
  associationFooterNote,
  associationProgrammeBlocks,
  buildAssociationDemoPages,
  CHARITY_NUMBER,
  DEFAULT_ASSOCIATION_NAME,
  event,
  programme,
} from '../src/blueprints/association.js'
import { bundledImageType, loadPhotoAsset } from '../src/blueprints/photo-assets.js'
import { STARTING_SKINS } from '../src/blueprints/starting-skins.js'

const MEDIA = Object.fromEntries(
  ASSOCIATION_MEDIA_SPECS.map((spec) => [spec.name, `media-${spec.name}`]),
)

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

function everyBlock(siteName?: string): readonly VocabularyBlock[] {
  return [
    ...buildAssociationDemoPages(MEDIA, siteName).flatMap((demo) => demo.blocks),
    ...ASSOCIATION_PROGRAMMES.flatMap((item) => associationProgrammeBlocks(item, siteName)),
    ...ASSOCIATION_DEMO_EVENTS.flatMap((item) => associationEventBlocks(item)),
  ]
}

function allDemoCopy(siteName: string): string[] {
  return [
    ...buildAssociationDemoPages(MEDIA, siteName).map((demo) => demo.title),
    ...everyBlock(siteName).flatMap(blockTexts),
    ...ASSOCIATION_PROGRAMMES.flatMap((item) => [
      item.title,
      item.summary,
      item.schedule,
      item.location,
      item.audience,
    ]),
    ...ASSOCIATION_DEMO_EVENTS.flatMap((item) => [
      item.title,
      item.description,
      item.location,
      item.cost,
      item.booking,
    ]),
    ...ASSOCIATION_MEDIA_SPECS.map((spec) => spec.alt),
    ...ASSOCIATION_MENUS.header.map((item) => item.label),
    ...ASSOCIATION_FOOTER.flatMap((column) => [
      column.heading,
      ...column.links.map((l) => l.label),
    ]),
    String(ASSOCIATION_SITE_SETTINGS['general.tagline']),
    associationFooterNote(siteName),
  ].filter((text) => text !== '')
}

function allTitles(): string[] {
  const titleOf = (block: VocabularyBlock): string[] => {
    const own = 'title' in block && typeof block.title === 'string' ? [block.title] : []
    if (block._type !== 'prose') return own
    return block.body.flatMap((node) =>
      node._type === 'block' && node.style !== 'normal' ? [textsOfValue(node).join('')] : [],
    )
  }
  return [
    ...buildAssociationDemoPages(MEDIA).map((demo) => demo.title),
    ...everyBlock().flatMap(titleOf),
    ...ASSOCIATION_PROGRAMMES.map((item) => item.title),
    ...ASSOCIATION_DEMO_EVENTS.map((item) => item.title),
  ]
}

function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

const ROUTES = new Set([
  ...buildAssociationDemoPages({}).map((demo) => `/${demo.slug}`),
  ...ASSOCIATION_PROGRAMMES.map((item) => `/what-we-do/${item.slug}`),
  ...ASSOCIATION_DEMO_EVENTS.map((item) => `/events/${item.slug}`),
])

const home = (siteName?: string) => buildAssociationDemoPages(MEDIA, siteName)[0]

describe('association blueprint, content model', () => {
  it('declares the four conventional SEO override fields on every routed collection', () => {
    for (const collection of ASSOCIATION_COLLECTIONS) {
      expect(Object.keys(collection.fields), collection.name).toEqual(
        expect.arrayContaining(['seoTitle', 'seoDescription', 'seoImage', 'seoNoindex']),
      )
    }
  })

  it('gives an event a start, an end, a place, an address, a cost and a booking note the theme reads', () => {
    expect(event.fields.date?.kind).toBe('datetime')
    expect(event.fields.endsAt?.kind).toBe('datetime')
    for (const name of ['location', 'address', 'cost', 'booking', 'description'] as const) {
      expect(event.fields[name].kind, name).toBe('text')
    }
    expect(event.fields.coverImage?.kind).toBe('media')
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
      expect(programme.fields[name].kind, name).toBe('text')
    }
    expect(associationContentPack.defaultTheme).toBe('@cogenta/theme-association')
  })

  it('resolves /events/:slug, /what-we-do/:slug and /:slug generically', () => {
    expect(matchPath(ASSOCIATION_COLLECTIONS, '/events/community-supper')).toEqual({
      collection: 'event',
      locale: null,
      params: { slug: 'community-supper' },
    })
    expect(matchPath(ASSOCIATION_COLLECTIONS, '/what-we-do/homework-club')).toEqual({
      collection: 'programme',
      locale: null,
      params: { slug: 'homework-club' },
    })
    expect(matchPath(ASSOCIATION_COLLECTIONS, '/donate')).toEqual({
      collection: 'page',
      locale: null,
      params: { slug: 'donate' },
    })
  })
})

describe('association blueprint, programmes and events', () => {
  it('describes four programmes, each with a page of real reading and a photograph', () => {
    expect(ASSOCIATION_PROGRAMMES.map((item) => item.slug)).toEqual([
      'thursday-food-bank',
      'homework-club',
      'community-garden',
      'winter-coat-bank',
    ])
    for (const item of ASSOCIATION_PROGRAMMES) {
      const blocks = associationProgrammeBlocks(item)
      expect(() => parseBlocks([...blocks]), item.slug).not.toThrow()
      const words = blockTexts(blocks[0] as VocabularyBlock)
        .join(' ')
        .split(/\s+/).length
      expect(words, item.slug).toBeGreaterThanOrEqual(150)
      expect(
        ASSOCIATION_MEDIA_SPECS.some((spec) => spec.name === item.photo),
        item.slug,
      ).toBe(true)
    }
  })

  it('dates six events from one to six weeks out, in order, each on its own day', () => {
    expect(ASSOCIATION_DEMO_EVENTS).toHaveLength(6)
    const days = ASSOCIATION_DEMO_EVENTS.map((item) => item.daysFromNow)
    expect(days).toEqual([...days].sort((a, b) => a - b))
    expect(Math.min(...days)).toBeGreaterThanOrEqual(1)
    expect(Math.max(...days)).toBeLessThanOrEqual(45)
    expect(new Set(days).size).toBe(6)
    for (const item of ASSOCIATION_DEMO_EVENTS) {
      expect(item.end[0] * 60 + item.end[1], item.slug).toBeGreaterThan(
        item.start[0] * 60 + item.start[1],
      )
    }
  })

  it('never names a weekday in an event’s copy, since the date moves with the scaffold', () => {
    for (const item of ASSOCIATION_DEMO_EVENTS) {
      const copy = [
        item.description,
        ...blockTexts(associationEventBlocks(item)[0] as VocabularyBlock),
      ].join(' ')
      expect(copy, item.slug).not.toMatch(/\b(monday|tuesday|wednesday|friday|saturday|sunday)\b/i)
    }
  })

  it('never names a season or a harvest in an event’s copy, since the month moves too', () => {
    for (const item of ASSOCIATION_DEMO_EVENTS) {
      const copy = [
        item.title,
        item.slug,
        item.description,
        ...blockTexts(associationEventBlocks(item)[0] as VocabularyBlock),
      ].join(' ')
      expect(copy, item.slug).not.toMatch(
        /\b(spring|summer|autumn|fall|winter|harvest|christmas|easter)\b/i,
      )
    }
  })

  it('writes clock times in an event’s copy that fall within its own start and end', () => {
    for (const item of ASSOCIATION_DEMO_EVENTS) {
      const copy = [
        item.description,
        ...blockTexts(associationEventBlocks(item)[0] as VocabularyBlock),
      ].join(' ')
      const start = item.start[0] * 60 + item.start[1]
      const end = item.end[0] * 60 + item.end[1]
      for (const match of copy.matchAll(/\b(\d{1,2})(?:\.(\d{2}))?(am|pm)\b/g)) {
        const hour = (Number(match[1]) % 12) + (match[3] === 'pm' ? 12 : 0)
        const minutes = hour * 60 + Number(match[2] ?? 0)
        expect(minutes, `${item.slug}: ${match[0]}`).toBeGreaterThanOrEqual(start)
        expect(minutes, `${item.slug}: ${match[0]}`).toBeLessThanOrEqual(end)
      }
    }
  })

  it('gives every event a page of its own text and the other dates under it', () => {
    for (const item of ASSOCIATION_DEMO_EVENTS) {
      const blocks = associationEventBlocks(item)
      expect(() => parseBlocks([...blocks]), item.slug).not.toThrow()
      expect(blocks.map((block) => block._type)).toEqual(['prose', 'collectionList'])
    }
  })
})

describe('association blueprint, pictures', () => {
  it('points every media slot at a bundled file described in a full sentence', () => {
    for (const spec of ASSOCIATION_MEDIA_SPECS) {
      expect(spec.photo, spec.name).toMatch(/^association\/[a-z-]+\.(png|jpg)$/)
      expect(loadPhotoAsset(spec.photo as string), spec.photo).toBeDefined()
      expect(spec.alt.length, spec.name).toBeGreaterThan(spec.name.startsWith('partner-') ? 6 : 30)
      expect(spec.alt, spec.name).not.toMatch(
        /placeholder|abstract|composition|stand-in|illustration|cover image/i,
      )
    }
  })

  it('renders every partner wordmark as a monochrome PNG at one height', () => {
    const heights = ASSOCIATION_PARTNERS.map((partner) => {
      const bytes = loadPhotoAsset(`association/${partner.key}.png`) as Uint8Array
      expect(bundledImageType(bytes).extension, partner.key).toBe('png')
      return pngSize(bytes).height
    })
    expect(new Set(heights).size).toBe(1)
  })

  it('bundles no picture it does not use, and none of the photographs with invented lettering', async () => {
    const folder = fileURLToPath(
      new URL('../src/blueprints/assets/photos/association/', import.meta.url),
    )
    const files = (await readdir(folder)).sort()
    const used = new Set(
      ASSOCIATION_MEDIA_SPECS.map((spec) => (spec.photo as string).slice('association/'.length)),
    )
    expect(files.filter((file) => !used.has(file))).toEqual([])
    expect(files).not.toContain('community-cleanup.jpg')
    expect(files).not.toContain('harvest-food-drive.jpg')
  })

  it('opens the home page on the photograph of the volunteers, and names every partner', () => {
    expect(home()?.blocks[0]).toMatchObject({ _type: 'hero', media: 'media-hero' })
    const strip = home()?.blocks.find((block) => block._type === 'logoStrip')
    expect(strip?._type === 'logoStrip' ? strip.logos.map((logo) => logo.media) : []).toEqual(
      ASSOCIATION_PARTNERS.map((partner) => `media-${partner.key}`),
    )
  })

  it('leaves out every picture block, never an empty one, when no media was seeded', () => {
    for (const demo of buildAssociationDemoPages({})) {
      expect(() => parseBlocks([...demo.blocks]), demo.slug).not.toThrow()
      for (const block of demo.blocks) {
        expect(['logoStrip', 'logos', 'mediaFigure', 'gallery'], demo.slug).not.toContain(
          block._type,
        )
        if (block._type === 'hero') expect(block.media).toBeUndefined()
      }
    }
  })
})

describe('association blueprint, copy', () => {
  it('names the organisation the site belongs to, in its copy and its addresses, and falls back to its own name', () => {
    const named = allDemoCopy('Common Ground').join('\n')
    expect(named).toContain('Common Ground runs a food bank')
    expect(named).toContain('What keeps me at Common Ground')
    expect(named).toContain('hello@commonground.org.uk')
    expect(named).not.toContain(DEFAULT_ASSOCIATION_NAME)
    expect(allDemoCopy(DEFAULT_ASSOCIATION_NAME).join('\n')).toContain('Riverside Neighbours')
    expect(associationEmail('Friends & Neighbours', 'volunteer')).toBe(
      'volunteer@friendsandneighbours.org.uk',
    )
    expect(associationEmail(undefined)).toBe('hello@riversideneighbours.org.uk')
  })

  it('never talks about the CMS, the scaffold or the site itself as a demonstration', () => {
    const copy = allDemoCopy(DEFAULT_ASSOCIATION_NAME).join('\n')
    expect(copy).not.toMatch(
      /cogenta|scaffold|\bdemo\b|editable|lorem|placeholder|this (theme|template|site is)|blueprint|riverside community fund/i,
    )
  })

  it('invents its people and partners rather than borrowing sample names', () => {
    const copy = allDemoCopy(DEFAULT_ASSOCIATION_NAME).join('\n')
    expect(copy).not.toMatch(/contoso|fabrikam|northwind|acme|john doe|jane doe|example corp/i)
  })

  it('keeps to the studio charter: no buzzwords, no exclamation marks, at most one em dash per text', () => {
    const buzzwords =
      /\b(seamless|unlock|elevate|empower|supercharge|streamline|cutting-edge|robust|leverage|synergy|innovative|world-class|game-chang|revolutioni[sz]e|next-gen|effortless|transformative|make a difference|change lives)/i
    for (const text of allDemoCopy(DEFAULT_ASSOCIATION_NAME)) {
      expect(text, text).not.toMatch(buzzwords)
      expect(text, text).not.toContain('!')
      expect((text.match(/—/g) ?? []).length, text).toBeLessThanOrEqual(1)
      expect(text, text).not.toMatch(/\bnot\b[^.;:]*,\s*but\b/i)
      expect(text, text).not.toMatch(/\bisn[’']t\b[^.;:]*[,;]\s*it[’']s\b/i)
    }
  })

  it('titles no page, block or section as a question; only the questions of an FAQ ask one', () => {
    for (const title of allTitles()) expect(title, title).not.toMatch(/\?/)
  })

  it('gives every impact figure on the home page a unit and a sentence of context', () => {
    const figures = home()?.blocks.find((block) => block._type === 'stats')
    const items = figures?._type === 'stats' ? figures.items : []
    expect(items).toHaveLength(4)
    for (const item of items) {
      expect(item.unit, item.label).toBeDefined()
      expect(item.label.split(/\s+/).length, item.label).toBeGreaterThanOrEqual(8)
    }
  })

  it('shows where the money goes as shares that add up to the whole, on the home page and the finances page', () => {
    const pages = buildAssociationDemoPages(MEDIA)
    const breakdowns = pages
      .flatMap((demo) => demo.blocks)
      .filter(
        (block) => block._type === 'statCounter' && block.stats.every((s) => s.value.endsWith('%')),
      )
    expect(breakdowns.length).toBeGreaterThanOrEqual(3)
    for (const block of breakdowns) {
      if (block._type !== 'statCounter') continue
      const total = block.stats.reduce((sum, stat) => sum + Number.parseFloat(stat.value), 0)
      expect(total, block._key).toBe(100)
    }
  })

  it('quotes one named volunteer on the home page, with her photograph', () => {
    const quotes = home()?.blocks.filter((block) => block._type === 'testimonial') ?? []
    expect(quotes).toHaveLength(1)
    expect(quotes[0]).toMatchObject({
      attribution: {
        name: 'Joanne Pryce',
        role: 'Homework club volunteer since 2019',
        avatar: 'media-portrait',
      },
    })
  })
})

describe('association blueprint, honest actions and navigation', () => {
  it('seeds valid contract-B pages that use most of the vocabulary', () => {
    const types = new Set(everyBlock().map((block) => block._type))
    for (const demo of buildAssociationDemoPages(MEDIA)) {
      expect(() => parseBlocks([...demo.blocks]), demo.slug).not.toThrow()
    }
    expect(types.size).toBeGreaterThanOrEqual(13)
    expect(buildAssociationDemoPages({}).map((demo) => demo.slug)).toEqual([
      'home',
      'what-we-do',
      'events',
      'volunteer',
      'donate',
      'finances',
      'about',
      'contact',
      'privacy',
    ])
  })

  it('composes the home page in the order of a charity’s site', () => {
    expect(home()?.blocks.map((block) => block._type)).toEqual([
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

  it('never takes a payment on the site: every donation is a standing order, a cheque, cash or a conversation', () => {
    const everything = JSON.stringify(everyBlock())
    expect(everything).not.toMatch(
      /card number|pay now|checkout|paypal|stripe|donate online|sort code|account number: \d/i,
    )
    const donate = JSON.stringify(
      buildAssociationDemoPages({}).find((d) => d.slug === 'donate')?.blocks,
    )
    expect(donate).toContain('We do not take card payments on this site')
    expect(donate).toContain('mailto:treasurer@riversideneighbours.org.uk')
    expect(donate).toMatch(/standing order/i)
    expect(donate).toMatch(/Gift Aid/)
    expect(donate).toContain(CHARITY_NUMBER)
    expect(ASSOCIATION_MENUS.headerAction).toEqual({ label: 'Donate', url: '/donate' })
  })

  it('makes volunteering a real route: an email, a telephone number and the next orientation evening', () => {
    const volunteer = JSON.stringify(
      buildAssociationDemoPages({}).find((d) => d.slug === 'volunteer')?.blocks,
    )
    expect(volunteer).toContain('mailto:volunteer@riversideneighbours.org.uk')
    expect(volunteer).toContain('tel:+441632960418')
    expect(volunteer).toContain('/events/volunteer-orientation-evening')
    expect(ASSOCIATION_DEMO_EVENTS[0]?.slug).toBe('volunteer-orientation-evening')
  })

  it('uses a telephone number from the range reserved for drama, so it can never ring anyone', () => {
    expect(ASSOCIATION_PHONE).toMatch(/^01632 960\d{3}$/)
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
    const menuUrls = [
      ...ASSOCIATION_MENUS.header.map((item) => item.url),
      ASSOCIATION_MENUS.headerAction?.url,
      ...ASSOCIATION_FOOTER.flatMap((column) => column.links.map((l) => l.url)),
    ]
    for (const url of menuUrls) expect(ROUTES.has(url ?? ''), url).toBe(true)
    const hrefs = JSON.stringify(everyBlock()).match(/"href":"[^"]+"/g) ?? []
    expect(hrefs.length).toBeGreaterThan(15)
    for (const match of hrefs) {
      const href = match.slice(8, -1)
      if (/^(mailto|tel|https):/.test(href)) continue
      expect(ROUTES.has(href), href).toBe(true)
    }
  })

  it('groups the footer in three headed columns of real links', () => {
    expect(ASSOCIATION_FOOTER.map((column) => column.heading)).toEqual([
      'Get involved',
      'What we do',
      'About us',
    ])
    for (const column of ASSOCIATION_FOOTER) expect(column.links.length).toBeGreaterThanOrEqual(3)
    expect(ASSOCIATION_MENUS.footer).toEqual([])
  })

  it('sorts every list on a field contract A can order by', () => {
    const lists = everyBlock().filter((block) => block._type === 'collectionList')
    expect(lists.length).toBeGreaterThan(10)
    for (const block of lists) {
      if (block._type !== 'collectionList') continue
      // `date` is the event's own declared datetime (L40, ADR-0038) — the
      // three system columns, or a date the listed collection declares.
      expect(['id', 'createdAt', 'updatedAt', 'date']).toContain(block.sort?.field)
      if (block.collection === 'event') {
        expect(block.sort?.field).toBe('date')
        // Resolved by the API at every request, never a date frozen at scaffold
        // time: a demo site left running still shows what is coming up.
        expect(block.filter).toEqual({ date: { gte: '$now' } })
      }
    }
  })

  it('closes comments and prints what a registered charity prints in its footer', () => {
    expect(ASSOCIATION_SITE_SETTINGS['discussion.enabled']).toBe(false)
    const note = associationFooterNote('Common Ground')
    expect(note).toContain(`Registered charity in England and Wales, no. ${CHARITY_NUMBER}`)
    expect(note).toContain('Ashworth AW4 2LT')
    expect(note).toContain(ASSOCIATION_PHONE)
    expect(note).toContain('hello@commonground.org.uk')
  })

  it("matches the theme's own palette and typefaces in its starting skin", async () => {
    const theme = JSON.parse(
      await readFile(new URL('../../theme-association/tokens.json', import.meta.url), 'utf8'),
    )
    expect(STARTING_SKINS.association).toEqual(theme)
    expect(STARTING_SKINS.association?.font.serif.startsWith("'Bricolage Grotesque'")).toBe(true)
    expect(STARTING_SKINS.association?.font.sans.startsWith("'Source Sans 3'")).toBe(true)
  })
})
