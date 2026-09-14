import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { RichTextDocument, VocabularyBlock } from '@cogenta/blocks'
import { parseBlocks, richTextDocumentSchema } from '@cogenta/blocks'
import { matchPath } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import {
  buildDocumentationDemoPages,
  buildDocumentationDocPages,
  DEFAULT_PRODUCT_NAME,
  DOCUMENTATION_COLLECTIONS,
  DOCUMENTATION_DEMO_DOC_PAGES,
  DOCUMENTATION_FOOTER,
  DOCUMENTATION_MEDIA_SPECS,
  DOCUMENTATION_MENUS,
  DOCUMENTATION_SITE_SETTINGS,
  docPage,
  documentationContentPack,
  page,
  productName,
  productNames,
} from '../src/blueprints/documentation.js'
import { bundledImageType, loadPhotoAsset } from '../src/blueprints/photo-assets.js'
import { STARTING_SKINS } from '../src/blueprints/starting-skins.js'

type TextNode = Extract<RichTextDocument[number], { _type: 'block' }>

function isCode(node: RichTextDocument[number]): boolean {
  return (
    node._type === 'block' &&
    node.children.length > 0 &&
    node.children.every((span) => span.marks.includes('code'))
  )
}

/** One unit of prose per paragraph, heading or list item, code blocks and code spans left out: the unit the charter counts in. */
function proseOf(document: RichTextDocument): string[] {
  return document
    .filter((node): node is TextNode => node._type === 'block' && !isCode(node))
    .map((node) =>
      node.children
        .filter((span) => !span.marks.includes('code'))
        .map((span) => span.text)
        .join(''),
    )
}

function codeOf(document: RichTextDocument): string {
  return document
    .filter((node): node is TextNode => node._type === 'block')
    .flatMap((node) =>
      node.children.filter((span) => span.marks.includes('code')).map((span) => span.text),
    )
    .join('\n')
}

function homeBlocks(siteName?: string): readonly VocabularyBlock[] {
  return buildDocumentationDemoPages({}, siteName)[0]?.blocks ?? []
}

function blockTexts(block: VocabularyBlock): string[] {
  switch (block._type) {
    case 'hero':
      return [
        block.eyebrow ?? '',
        block.title,
        block.subtitle ?? '',
        ...(block.actions ?? []).map((a) => a.label),
      ]
    case 'featureGrid':
      return [block.title ?? '', ...block.items.flatMap((item) => [item.title, item.text ?? ''])]
    case 'collectionList':
      return [block.title ?? '']
    case 'prose':
      return proseOf(block.body)
    case 'faq':
      return [
        block.title ?? '',
        ...block.items.flatMap((item) => [item.question, ...proseOf(item.answer)]),
      ]
    case 'cta':
      return [block.title, block.text ?? '', ...block.actions.map((a) => a.label)]
    default:
      return []
  }
}

function allCopy(siteName?: string): string[] {
  const pages = buildDocumentationDocPages(siteName)
  return [
    ...pages.flatMap((doc) => [doc.title, doc.summary, doc.section, ...proseOf(doc.body)]),
    ...homeBlocks(siteName).flatMap(blockTexts),
    ...DOCUMENTATION_MEDIA_SPECS.map((spec) => spec.alt),
    ...DOCUMENTATION_MENUS.header.map((item) => item.label),
    ...DOCUMENTATION_FOOTER.flatMap((column) => [
      column.heading,
      ...column.links.map((link) => link.label),
    ]),
    String(DOCUMENTATION_SITE_SETTINGS['general.tagline']),
    String(DOCUMENTATION_SITE_SETTINGS['general.footerNote']),
  ].filter((text) => text.trim() !== '')
}

function allTitles(): string[] {
  const pages = buildDocumentationDocPages()
  return [
    ...pages.map((doc) => doc.title),
    ...pages.flatMap((doc) =>
      doc.body.flatMap((node) =>
        node._type === 'block' && node.style !== 'normal' && node.style !== 'blockquote'
          ? proseOf([node])
          : [],
      ),
    ),
    ...homeBlocks().flatMap((block) =>
      'title' in block && typeof block.title === 'string' ? [block.title] : [],
    ),
  ]
}

const ROUTES = new Set(['/', ...DOCUMENTATION_DEMO_DOC_PAGES.map((doc) => `/docs/${doc.slug}`)])

function internalLinks(): string[] {
  const hrefs: string[] = []
  for (const doc of DOCUMENTATION_DEMO_DOC_PAGES) {
    for (const node of doc.body)
      if (node._type === 'block')
        for (const mark of node.markDefs) if (mark._type === 'link') hrefs.push(mark.href)
  }
  const json = JSON.stringify(homeBlocks())
  for (const match of json.matchAll(/"href":"([^"]+)"/g)) hrefs.push(match[1] as string)
  return hrefs
}

describe('documentation blueprint, content model', () => {
  it('declares the four conventional SEO override fields on every routed collection', () => {
    for (const collection of [docPage, page]) {
      expect(Object.keys(collection.fields)).toEqual(
        expect.arrayContaining(['seoTitle', 'seoDescription', 'seoImage', 'seoNoindex']),
      )
    }
  })

  it('gives a doc page a section, an order, a summary and a block zone', () => {
    expect(docPage.fields.section?.kind).toBe('text')
    expect(docPage.fields.order?.kind).toBe('number')
    expect(docPage.fields.summary?.kind).toBe('text')
    expect(docPage.fields.body?.kind).toBe('blocks')
    expect(documentationContentPack.defaultTheme).toBe('@cogenta/theme-docs')
  })

  it('resolves /docs/:slug and /:slug generically through @cogenta/schema routing', () => {
    expect(matchPath(DOCUMENTATION_COLLECTIONS, '/docs/quickstart')).toEqual({
      collection: 'doc_page',
      locale: null,
      params: { slug: 'quickstart' },
    })
    expect(matchPath(DOCUMENTATION_COLLECTIONS, '/home')).toEqual({
      collection: 'page',
      locale: null,
      params: { slug: 'home' },
    })
  })
})

describe('documentation blueprint, the product and its names', () => {
  it('names the product after the site, dropping the word that says it is documentation', () => {
    expect(productName('Relay Docs')).toBe('Relay')
    expect(productName('Tessera Documentation')).toBe('Tessera')
    expect(productName('Quayline')).toBe('Quayline')
    expect(productName(undefined)).toBe(DEFAULT_PRODUCT_NAME)
    expect(productName('   ')).toBe('Relay')
  })

  it('derives the command, the environment prefix and the header names from that name', () => {
    expect(productNames('Kiln Works Docs')).toEqual({
      name: 'Kiln Works',
      cli: 'kiln-works',
      env: 'KILN_WORKS',
      header: 'Kiln-Works',
    })
    expect(productNames('Côté Hooks')).toMatchObject({ cli: 'cote-hooks', env: 'COTE_HOOKS' })
  })

  it('writes the product’s own names into every page, and never the fallback when the site has a name', () => {
    const copy = [
      ...allCopy('Tessera Docs'),
      ...buildDocumentationDocPages('Tessera Docs').map((doc) => codeOf(doc.body)),
    ].join('\n')
    expect(copy).toContain('Tessera')
    expect(copy).toContain('tessera init')
    expect(copy).toContain('TESSERA_API_KEY')
    expect(copy).toContain('Tessera-Signature')
    expect(copy).not.toMatch(/\brelay\b|RELAY_|%N%|%cli%|%ENV%|%HDR%/i)
  })

  it('keeps the quickstart, the CLI reference and the API reference in agreement', () => {
    const bySlug = new Map(DOCUMENTATION_DEMO_DOC_PAGES.map((doc) => [doc.slug, doc]))
    const reference = JSON.stringify(bySlug.get('cli-reference')?.body)
    const quickstart = codeOf(bySlug.get('quickstart')?.body ?? [])
    for (const command of ['init', 'dev', 'listen', 'endpoints create', 'events send']) {
      expect(quickstart, command).toContain(`relay ${command}`)
      expect(reference, command).toContain(`relay ${command}`)
    }
    const api = JSON.stringify(bySlug.get('http-api')?.body)
    expect(JSON.stringify(homeBlocks())).toContain('/v1/events')
    expect(api).toContain('POST /v1/events')
    expect(JSON.stringify(bySlug.get('configuration-reference')?.body)).toContain(
      'delivery.retries.schedule',
    )
  })
})

describe('documentation blueprint, the documentation', () => {
  it('writes thirteen pages across four sections, in reading order', () => {
    expect(DOCUMENTATION_DEMO_DOC_PAGES.map((doc) => doc.slug)).toEqual([
      'introduction',
      'installation',
      'quickstart',
      'core-concepts',
      'verifying-signatures',
      'retries-and-replay',
      'configuration',
      'deploying-to-production',
      'cli-reference',
      'configuration-reference',
      'http-api',
      'troubleshooting',
      'whats-new',
    ])
    expect([...new Set(DOCUMENTATION_DEMO_DOC_PAGES.map((doc) => doc.section))]).toEqual([
      'Getting started',
      'Guides',
      'Reference',
      'Help',
    ])
    const orders = DOCUMENTATION_DEMO_DOC_PAGES.map((doc) => doc.order)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
    expect(new Set(orders).size).toBe(orders.length)
  })

  it('gives every page valid rich text, a summary and at least two sections', () => {
    for (const doc of DOCUMENTATION_DEMO_DOC_PAGES) {
      expect(() => richTextDocumentSchema.parse(doc.body), doc.slug).not.toThrow()
      expect(doc.summary.length, doc.slug).toBeGreaterThan(40)
      expect(doc.summary.length, doc.slug).toBeLessThanOrEqual(300)
      expect(doc.summary, doc.slug).not.toContain('`')
      const headings = doc.body.filter((node) => node._type === 'block' && node.style === 'h2')
      expect(headings.length, doc.slug).toBeGreaterThanOrEqual(2)
    }
  })

  it('writes real reading: over 2,500 words of prose besides the code, and no page under 150', () => {
    let total = 0
    for (const doc of DOCUMENTATION_DEMO_DOC_PAGES) {
      const words = proseOf(doc.body).join(' ').split(/\s+/).filter(Boolean).length
      expect(words, doc.slug).toBeGreaterThanOrEqual(150)
      total += words
    }
    expect(total).toBeGreaterThan(2500)
  })

  it('shows code in the languages a reader of this product writes', () => {
    const labels = DOCUMENTATION_DEMO_DOC_PAGES.flatMap((doc) =>
      doc.body.flatMap((node) =>
        isCode(node) && node._type === 'block' && node.children[0]?.marks.includes('strong')
          ? [node.children[0].text]
          : [],
      ),
    )
    for (const label of [
      'Terminal',
      'verify-signature.ts',
      'verify_signature.py',
      'relay.yaml',
      'compose.yaml',
      'Request',
      'Response: 202 Accepted',
    ]) {
      expect(labels).toContain(label)
    }
    const codeBlocks = DOCUMENTATION_DEMO_DOC_PAGES.flatMap((doc) => doc.body.filter(isCode))
    expect(codeBlocks.length).toBeGreaterThan(25)
  })

  it('keeps every line of code short enough to read without scrolling, one long signature excepted', () => {
    const long = DOCUMENTATION_DEMO_DOC_PAGES.flatMap((doc) =>
      doc.body.filter(isCode).flatMap((node) =>
        node._type === 'block'
          ? node.children
              .filter((span) => !span.marks.includes('strong'))
              .flatMap((span) => span.text.split('\n'))
              .filter((line) => line.length > 74)
          : [],
      ),
    )
    expect(long).toEqual([expect.stringMatching(/^Relay-Signature: t=\d+,v1=[0-9a-f]{64}$/)])
  })

  it('uses the shapes the theme turns into notes, reference tables and keys', () => {
    const all = DOCUMENTATION_DEMO_DOC_PAGES.flatMap((doc) => doc.body)
    const notes = all.filter(
      (node) =>
        node._type === 'block' &&
        node.style === 'blockquote' &&
        node.children[0]?.marks.includes('strong'),
    )
    const referenceRows = all.filter(
      (node) =>
        node._type === 'block' &&
        node.listItem === 'bullet' &&
        node.children[0]?.marks.join() === 'code' &&
        node.children.length > 1,
    )
    expect(notes.length).toBeGreaterThanOrEqual(8)
    expect(referenceRows.length).toBeGreaterThan(60)
    expect(JSON.stringify(all)).toContain('"text":"Ctrl+C","marks":["code"]')
  })

  it('illustrates "Core concepts" with the diagram once it was seeded, and leaves no empty slot otherwise', () => {
    const concepts = (media: Record<string, string>) =>
      buildDocumentationDocPages(undefined, media).find((doc) => doc.slug === 'core-concepts')
        ?.body ?? []
    expect(
      concepts({ deliveryFlow: 'media-1' }).filter((node) => node._type === 'media'),
    ).toHaveLength(1)
    expect(concepts({}).filter((node) => node._type === 'media')).toHaveLength(0)
  })
})

describe('documentation blueprint, copy', () => {
  it('never talks about the CMS, the scaffold or the site as a demonstration', () => {
    expect(allCopy().join('\n')).not.toMatch(
      /cogenta|scaffold|\bdemo\b|editable|lorem|placeholder|this (theme|template|site is)|blueprint|public beta/i,
    )
  })

  it('keeps to the studio charter: no buzzwords, no exclamation marks, at most one em dash per text', () => {
    const buzzwords =
      /\b(seamless|unlock|elevate|empower|supercharge|streamline|cutting-edge|robust|leverage|synergy|innovative|world-class|game-chang|revolutioni[sz]e|next-gen|effortless|blazing)/i
    for (const text of allCopy()) {
      expect(text, text).not.toMatch(buzzwords)
      expect(text, text).not.toContain('!')
      expect((text.match(/—/g) ?? []).length, text).toBeLessThanOrEqual(1)
      expect(text, text).not.toMatch(/\bnot\b[^.;:]*,\s*but\b/i)
      expect(text, text).not.toMatch(/\bisn[’']t\b[^.;:]*[,;]\s*it[’']s\b/i)
    }
  })

  it('titles no page, section or block as a question; only the questions of a FAQ ask one', () => {
    for (const title of allTitles()) expect(title, title).not.toMatch(/\?/)
  })

  it('uses typographic apostrophes in prose', () => {
    for (const text of allCopy()) expect(text, text).not.toMatch(/[a-z]'[a-z]/i)
  })

  it('writes dates in the same long form the theme prints', () => {
    const headings = DOCUMENTATION_DEMO_DOC_PAGES.find(
      (doc) => doc.slug === 'whats-new',
    )?.body.flatMap((node) =>
      node._type === 'block' && node.style === 'h2' ? proseOf([node]) : [],
    )
    expect(headings).toEqual(['2.4, September 2, 2026', '2.3, July 15, 2026', '2.2, May 20, 2026'])
  })
})

describe('documentation blueprint, home page, navigation and pictures', () => {
  it('composes the home page as a documentation site opens', () => {
    const blocks = homeBlocks()
    expect(() => parseBlocks([...blocks])).not.toThrow()
    expect(blocks.map((block) => block._type)).toEqual([
      'hero',
      'featureGrid',
      'collectionList',
      'prose',
      'faq',
      'cta',
    ])
    expect(blocks[0]).toMatchObject({
      _type: 'hero',
      title: 'Relay documentation',
      eyebrow: 'Relay 2.4',
    })
    expect(blocks[0]).not.toHaveProperty('media')
  })

  it('starts the reader in three places, with no icon tiles', () => {
    const start = homeBlocks()[1]
    const items = start?._type === 'featureGrid' ? start.items : []
    expect(items).toHaveLength(3)
    for (const item of items) expect(item.icon).toBeUndefined()
  })

  it('sorts every list on a field contract B allows', () => {
    const list = homeBlocks()[2]
    expect(list).toMatchObject({
      collection: 'doc_page',
      limit: 100,
      sort: { field: 'createdAt', direction: 'asc' },
    })
  })

  it('links every menu item and every link in the content to a page the blueprint seeds', () => {
    const urls = [
      ...DOCUMENTATION_MENUS.header.map((item) => item.url ?? '/'),
      ...DOCUMENTATION_FOOTER.flatMap((column) => column.links.map((link) => link.url ?? '/')),
      ...internalLinks(),
    ]
    expect(urls.length).toBeGreaterThan(25)
    for (const url of urls) expect(ROUTES.has(url), url).toBe(true)
    expect(DOCUMENTATION_MENUS.footer).toEqual([])
    expect(DOCUMENTATION_MENUS.headerAction).toBeUndefined()
  })

  it('groups the footer in four headed columns of real links', () => {
    expect(DOCUMENTATION_FOOTER.map((column) => column.heading)).toEqual([
      'Get started',
      'Guides',
      'Reference',
      'Help',
    ])
    for (const column of DOCUMENTATION_FOOTER) expect(column.links.length).toBeGreaterThanOrEqual(2)
  })

  it('closes comments and prints a licence, not a note about how the site was made', () => {
    expect(DOCUMENTATION_SITE_SETTINGS['discussion.enabled']).toBe(false)
    expect(String(DOCUMENTATION_SITE_SETTINGS['general.footerNote'])).toMatch(/Apache License 2\.0/)
    expect(DOCUMENTATION_SITE_SETTINGS['general.socialLinks']).toHaveLength(3)
  })

  it('points its one media slot at a bundled diagram, described in a full sentence, and bundles nothing else', async () => {
    expect(DOCUMENTATION_MEDIA_SPECS.map((spec) => spec.photo)).toEqual([
      'documentation/delivery-flow.png',
    ])
    const bytes = loadPhotoAsset('documentation/delivery-flow.png') as Uint8Array
    expect(bundledImageType(bytes).extension).toBe('png')
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    expect(view.getUint32(16)).toBeGreaterThanOrEqual(2000)
    expect(bytes.byteLength).toBeLessThan(250_000)
    expect(DOCUMENTATION_MEDIA_SPECS[0]?.alt.length).toBeGreaterThan(60)
    expect(DOCUMENTATION_MEDIA_SPECS[0]?.alt).not.toMatch(
      /abstract|decorative|composition|illustration/i,
    )
    const folder = fileURLToPath(
      new URL('../src/blueprints/assets/photos/documentation/', import.meta.url),
    )
    expect(await readdir(folder)).toEqual(['delivery-flow.png'])
  })

  it("matches the theme's own palette and typefaces in its starting skin", async () => {
    const theme = JSON.parse(
      await readFile(new URL('../../theme-docs/tokens.json', import.meta.url), 'utf8'),
    )
    expect(STARTING_SKINS.documentation).toEqual(theme)
    expect(STARTING_SKINS.documentation?.font.sans.startsWith("'IBM Plex Sans'")).toBe(true)
    expect(STARTING_SKINS.documentation?.font.mono.startsWith("'IBM Plex Mono'")).toBe(true)
  })
})
