import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { RichTextDocument } from '@cogenta/blocks'
import { parseBlocks, richTextDocumentSchema } from '@cogenta/blocks'
import { describe, expect, it } from 'vitest'
import { contentPackFor } from '../src/blueprints/content-packs.js'
import {
  buildDocumentationDemoPages,
  buildDocumentationDocPages,
  createDocumentationContentPack,
  documentationContentPack,
  documentationCopyFor,
  documentationMediaSpecs,
} from '../src/blueprints/documentation.js'
import { bundledImageType, loadPhotoAsset } from '../src/blueprints/photo-assets.js'

type TextNode = Extract<RichTextDocument[number], { _type: 'block' }>

function isCode(node: RichTextDocument[number]): boolean {
  return (
    node._type === 'block' &&
    node.children.length > 0 &&
    node.children.every((span) => span.marks.includes('code'))
  )
}

/** One unit of prose per paragraph, heading or list item, code left out. */
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

/** Every string of a plain value, rich-text spans that are code left out. */
function stringsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(stringsOf)
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (record._type === 'span') {
      return Array.isArray(record.marks) && record.marks.includes('code')
        ? []
        : stringsOf(record.text)
    }
    return Object.entries(record).flatMap(([key, inner]) =>
      key.startsWith('_') || ['href', 'url', 'collection', 'path', 'kind', 'mode'].includes(key)
        ? []
        : stringsOf(inner),
    )
  }
  return []
}

const SITE = 'Tessera Docs'
const copyFr = documentationCopyFor('fr-FR')
const pagesFr = buildDocumentationDocPages(SITE, { deliveryFlow: 'media-1' }, 'fr')
const homeFr = buildDocumentationDemoPages({}, SITE, 'fr')[0]
const packFr = createDocumentationContentPack('fr')

function allFrenchCopy(): string[] {
  const settings = packFr.siteSettings ?? {}
  return [
    ...pagesFr.flatMap((doc) => [doc.title, doc.summary, doc.section, ...proseOf(doc.body)]),
    ...stringsOf(homeFr?.blocks),
    homeFr?.title ?? '',
    ...stringsOf(packFr.menus),
    ...stringsOf(copyFr.footer),
    ...stringsOf(settings),
    ...stringsOf(packFr.widgets),
    ...(packFr.mediaSpecs ?? []).map((spec) => spec.alt),
  ].filter((text) => text.trim() !== '')
}

describe('documentation blueprint, French', () => {
  it('is picked for any French locale, and English stays the default', () => {
    expect(contentPackFor('documentation', 'fr')).toBeDefined()
    expect(copyFr.locale).toBe('fr')
    expect(documentationCopyFor('fr').locale).toBe('fr')
    expect(documentationCopyFor('en-GB').locale).toBe('en')
    expect(documentationCopyFor('de').locale).toBe('en')
    expect(contentPackFor('documentation', 'en')?.mediaSpecs?.[0]?.photo).toBe(
      'documentation/delivery-flow-en.png',
    )
    expect(documentationContentPack.mediaSpecs?.[0]?.alt).toMatch(/^Diagram: your application/)
  })

  it('writes the pages in French: headings, sections, summaries and the home page', () => {
    expect(pagesFr.map((doc) => doc.slug)).toEqual([
      'introduction',
      'installation',
      'demarrage-rapide',
      'concepts-cles',
      'verifier-les-signatures',
      'reessais-et-rejeu',
      'configuration',
      'deploiement-en-production',
      'reference-cli',
      'reference-configuration',
      'api-http',
      'depannage',
      'nouveautes',
    ])
    expect([...new Set(pagesFr.map((doc) => doc.section))]).toEqual([
      'Premiers pas',
      'Guides',
      'Référence',
      'Aide',
    ])
    expect(pagesFr[4]?.title).toBe('Vérifier les signatures')
    expect(pagesFr[0]?.summary).toContain('Tessera')
    expect(homeFr?.title).toBe('Documentation Tessera')
    expect(JSON.stringify(homeFr?.blocks)).toContain('Démarrage rapide')
    expect(JSON.stringify(homeFr?.blocks)).toContain('Questions fréquentes')
    expect(packFr.menus?.header.map((item) => item.label)).toEqual([
      'Premiers pas'.replace(' ', ' '),
      'Guides',
      'Référence',
      'Nouveautés',
    ])
  })

  it('keeps code, commands and API names in English and translates the comments of the examples', () => {
    const verify = pagesFr.find((doc) => doc.slug === 'verifier-les-signatures')
    const code = JSON.stringify(verify?.body)
    expect(code).toContain('verifySignature')
    expect(code).toContain('Refuse les signatures trop anciennes')
    expect(code).not.toContain('Refuse old signatures')
    const concepts = pagesFr.find((doc) => doc.slug === 'concepts-cles')
    expect(JSON.stringify(concepts?.body)).toContain('tessera endpoints enable')
  })

  it('gives every page valid rich text, real reading and no English left in the prose', () => {
    let total = 0
    for (const doc of pagesFr) {
      expect(() => richTextDocumentSchema.parse(doc.body), doc.slug).not.toThrow()
      const prose = proseOf(doc.body).join(' ')
      const words = prose.split(/\s+/).filter(Boolean).length
      expect(words, doc.slug).toBeGreaterThanOrEqual(130)
      total += words
      expect(prose, doc.slug).not.toMatch(/\b(the|and|your|with|which|when|you|are)\b/i)
      expect(doc.summary.length, doc.slug).toBeLessThanOrEqual(300)
    }
    expect(total).toBeGreaterThan(2400)
  })

  it('uses the language’s typography: no ordinary space before : ; ? ! in prose, « » closed with narrow spaces', () => {
    for (const text of allFrenchCopy()) {
      expect(text, text).not.toMatch(/ [:;?!»%]/)
      expect(text, text).not.toMatch(/« /)
      expect(text, text).not.toMatch(/[a-z]'[a-z]/i)
      expect(text, text).not.toContain('!')
    }
    const prose = pagesFr.flatMap((doc) => proseOf(doc.body)).join('\n')
    expect(prose).toMatch(/ :/)
    expect(prose).toMatch(/ %/)
    const faq = JSON.stringify(homeFr?.blocks)
    expect(faq).toContain('prend-il en charge\u202f?')
  })

  it('writes dates and times the French way in the release notes', () => {
    const notes = pagesFr.find((doc) => doc.slug === 'nouveautes')
    const headings = notes?.body.flatMap((node) =>
      node._type === 'block' && node.style === 'h2' ? proseOf([node]) : [],
    )
    expect(headings).toEqual(['2.4, 2 septembre 2026', '2.3, 15 juillet 2026', '2.2, 20 mai 2026'])
  })

  it('labels its notes in French, so the theme recognises them', () => {
    const labels = new Set<string>()
    for (const doc of pagesFr) {
      for (const node of doc.body) {
        if (node._type === 'block' && node.style === 'blockquote') {
          labels.add(node.children[0]?.text ?? '')
        }
      }
    }
    expect([...labels].sort()).toEqual(['Astuce', 'Attention', 'Remarque'])
  })

  it('links every menu item and every link in the content to a page this language seeds', () => {
    const routes = new Set(['/', ...pagesFr.map((doc) => `/docs/${doc.slug}`)])
    const hrefs: string[] = [
      ...(packFr.menus?.header ?? []).map((item) => item.url ?? '/'),
      ...copyFr.footer.flatMap((column) => column.links.map((link) => link.url ?? '/')),
    ]
    for (const doc of pagesFr)
      for (const node of doc.body)
        if (node._type === 'block')
          for (const mark of node.markDefs) if (mark._type === 'link') hrefs.push(mark.href)
    for (const match of JSON.stringify(homeFr?.blocks).matchAll(/"href":"([^"]+)"/g))
      hrefs.push(match[1] as string)
    for (const widget of packFr.widgets ?? []) {
      const settings = widget.settings as Record<string, unknown>
      for (const match of JSON.stringify(settings).matchAll(/"href":"(\/[^"]+)"/g))
        hrefs.push(match[1] as string)
    }
    expect(hrefs.length).toBeGreaterThan(30)
    for (const href of hrefs) {
      if (href.startsWith('http')) continue
      expect(routes.has(href), href).toBe(true)
    }
    expect(copyFr.footer.map((column) => column.heading)).toEqual([
      'Premiers pas',
      'Guides',
      'Référence',
      'Aide',
    ])
  })

  it('composes the home page and its widgets in French', () => {
    expect(() => parseBlocks([...(homeFr?.blocks ?? [])])).not.toThrow()
    const widgets = JSON.stringify(packFr.widgets)
    expect(widgets).toContain('Besoin d’aide')
    expect(widgets).toContain('/docs/depannage')
    // The upgrade note is on every page but the release notes.
    expect(widgets).toContain('/docs/api-http')
    expect(widgets).not.toContain('"path":"/docs/nouveautes"')
    expect(String(packFr.siteSettings?.['general.footerNote'])).toMatch(/licence Apache 2\.0/)
    expect(packFr.siteSettings?.['discussion.enabled']).toBe(false)
  })

  it('never talks about the CMS, the scaffold or the site as a demonstration', () => {
    expect(allFrenchCopy().join('\n')).not.toMatch(
      /cogenta|scaffold|\bd[ée]mo\b|lorem|placeholder|blueprint|%N%|%cli%|%ENV%|%HDR%/i,
    )
  })
})

describe('documentation blueprint, drawn diagrams (no photograph to credit)', () => {
  it('bundles one diagram per language, in a full sentence for each alternative text, and nothing else', async () => {
    const specs = documentationMediaSpecs(copyFr)
    expect(specs.map((spec) => spec.photo)).toEqual(['documentation/delivery-flow-fr.png'])
    expect(specs[0]?.alt).toMatch(/^Schéma ?:? ?/)
    expect(specs[0]?.alt.length).toBeGreaterThan(60)
    for (const file of [
      'documentation/delivery-flow-fr.png',
      'documentation/delivery-flow-en.png',
    ]) {
      const bytes = loadPhotoAsset(file) as Uint8Array
      expect(bundledImageType(bytes).extension).toBe('png')
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      expect(view.getUint32(16), file).toBeGreaterThanOrEqual(2000)
      expect(bytes.byteLength, file).toBeLessThan(250_000)
    }
    const folder = fileURLToPath(
      new URL('../src/blueprints/assets/photos/documentation/', import.meta.url),
    )
    // Real photographs would need a credits page; this blueprint has none.
    expect((await readdir(folder)).filter((name) => !name.startsWith('delivery-flow-'))).toEqual([])
  })
})
