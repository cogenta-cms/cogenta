import type { VocabularyBlock } from '@cogenta/blocks'
import { type PageEntryMeta, serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderPage } from '../src/render/render-block.js'
import { BLOCKS, makeContext, PRODUCTS } from './fixtures.js'

/**
 * The product page reads `theme@1.5`'s `PageEntryMeta.fields`: the price, the
 * stock, the category and the plain details a product entry carries.
 */

const ctx = makeContext()

const JACKET: PageEntryMeta = {
  collection: 'product',
  excerpt: 'A four-pocket jacket in olive cotton drill.',
  image: ctx.image('photo-jacket'),
  fields: {
    name: 'Field jacket',
    slug: 'field-jacket',
    price: 245,
    currency: 'EUR',
    category: 'Wear',
    inStock: true,
    material: 'Cotton drill, 280 g/m².',
    dimensions: 'Sizes XS to XL.',
    origin: 'Guimarães, Portugal',
    care: 'Wash at 30 °C.',
    delivery: 'Ships from Lisbon within two working days.',
    orderLink: 'mailto:orders@ateliergoods.com?subject=Order%3A%20Field%20jacket',
    seoTitle: 'Never shown',
  },
}

function productPage(
  entry: PageEntryMeta,
  blocks: readonly VocabularyBlock[] = [],
  locale = 'en',
): string {
  return serialize(
    renderPage({ title: 'Field jacket', blocks, entry }, makeContext({ locale }), {
      'b-collection': PRODUCTS,
    }),
  )
}

const html = productPage(JACKET)

describe('the product page', () => {
  it('renders to stable markup', () => {
    expect(html).toMatchSnapshot()
  })

  it('renders the price and the stock from page.entry.fields', () => {
    expect(html).toContain(
      '<p class="ce-product__price"><span class="cg-visually-hidden">Price </span><data value="245">€245</data></p>',
    )
    expect(html).toContain('<p class="ce-product__stock" data-stock="in">In stock</p>')
  })

  it('says "Sold out" in plain words when the entry is out of stock', () => {
    const soldOut = productPage({ ...JACKET, fields: { ...JACKET.fields, inStock: false } })
    expect(soldOut).toContain('<p class="ce-product__stock" data-stock="out">Sold out</p>')
    expect(soldOut).toContain('data-stock="out"')
  })

  it('prints the category above the name, and the name as the only h1', () => {
    expect(html).toContain(
      '<p class="ce-product__category">Wear</p><h1 class="ce-product__title">Field jacket</h1>',
    )
    expect(html.match(/<h1/g)).toHaveLength(1)
  })

  it('puts the photograph first, eagerly loaded, beside the information column', () => {
    expect(html).toMatch(
      /<figure class="ce-product__media"><img class="ce-product__image"[^>]*loading="eager"/,
    )
    expect(html.indexOf('ce-product__media')).toBeLessThan(html.indexOf('ce-product__info'))
  })

  it('offers an honest action: an email to the shop, labelled as one', () => {
    expect(html).toContain(
      '<a class="cg-action" data-emphasis="primary" href="mailto:orders@ateliergoods.com?subject=Order%3A%20Field%20jacket">Order by email</a>',
    )
    expect(html).not.toMatch(/add to (cart|bag|basket)|<button|<form/i)
  })

  it('asks about the next batch, as a quieter link, when the piece is sold out', () => {
    const soldOut = productPage({ ...JACKET, fields: { ...JACKET.fields, inStock: false } })
    expect(soldOut).toContain('data-emphasis="secondary"')
    expect(soldOut).toContain('>Ask about the next batch</a>')
  })

  it('labels a payment or marketplace link for what it does, and protects it', () => {
    const external = productPage({
      ...JACKET,
      fields: { ...JACKET.fields, orderLink: 'https://pay.example.org/jacket' },
    })
    expect(external).toContain(
      'href="https://pay.example.org/jacket" rel="noopener noreferrer">Order this piece</a>',
    )
  })

  it('uses the label the entry gives its action, when it gives one', () => {
    const labelled = productPage({
      ...JACKET,
      fields: { ...JACKET.fields, orderLabel: 'Reserve at the shop' },
    })
    expect(labelled).toContain('>Reserve at the shop</a>')
  })

  it('draws no action at all for a product that says nowhere to order it', () => {
    const { orderLink: _orderLink, ...fields } = JACKET.fields ?? {}
    expect(productPage({ ...JACKET, fields })).not.toContain('ce-product__order')
  })

  it('lists the details the entry carries, in a shopper’s order, and no other field', () => {
    expect(html).toContain('<dt class="ce-product__fact-label">Material</dt>')
    expect(html).toContain('<dt class="ce-product__fact-label">Made in</dt>')
    const order = ['material', 'dimensions', 'origin', 'care'].map((fact) =>
      html.indexOf(`data-fact="${fact}"`),
    )
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(html).not.toContain('Never shown')
    expect(html).not.toContain('field-jacket</')
  })

  it('writes the delivery note under the action', () => {
    expect(html.indexOf('ce-product__order')).toBeLessThan(html.indexOf('ce-product__delivery'))
    expect(html).toContain('Ships from Lisbon within two working days.')
  })

  it('translates its own words into French', () => {
    const fr = productPage(JACKET, [], 'fr')
    expect(fr).toContain('En stock')
    expect(fr).toContain('Commander par e-mail')
    expect(fr).toContain('Fabriqué à')
    expect(fr).toMatch(/245\s€/)
  })

  it('reads a currency the entry names', () => {
    const pounds = productPage({ ...JACKET, fields: { ...JACKET.fields, currency: 'GBP' } })
    expect(pounds).toContain('£245')
  })

  it('shows euros when the currency field is missing or not a real code', () => {
    const noCode = productPage({ ...JACKET, fields: { ...JACKET.fields, currency: 'coins' } })
    expect(noCode).toContain('€245')
  })

  it('marks the page as a product page for the stylesheet', () => {
    expect(html).toMatch(/^<main class="cg-main ce-main ce-main--product" id="cg-main">/)
  })

  it('renders the entry’s own blocks after the sheet, and skips itself in a list of the same category', () => {
    const withBlocks = serialize(
      renderPage(
        { title: 'Field jacket', blocks: [BLOCKS.prose, BLOCKS.collectionList], entry: JACKET },
        makeContext({ url: new URL('https://shop.example.org/en/product/p-jacket') }),
        { 'b-collection': PRODUCTS },
      ),
    )
    expect(withBlocks.indexOf('ce-product__info')).toBeLessThan(withBlocks.indexOf('ce-prose'))
    expect(withBlocks).not.toContain('class="ce-goods__link" href="/en/product/p-jacket"')
    expect(withBlocks).toContain('Enamel mug')
  })

  it('renders an ordinary page header for a product entry from a host older than theme@1.5', () => {
    const { fields: _fields, ...legacy } = JACKET
    const old = productPage(legacy)
    expect(old).not.toContain('ce-product')
    expect(old).toContain('<h1 class="ce-page-head__title">Field jacket</h1>')
    expect(old).not.toContain('€')
  })

  it('renders the sheet without a photograph when the entry has none', () => {
    const { image: _image, ...bare } = JACKET
    const noImage = productPage(bare)
    expect(noImage).toContain('data-media="false"')
    expect(noImage).not.toContain('<img')
  })

  it('lets a hero carry the title instead, never adding a second h1', () => {
    const heroPage = productPage(JACKET, [BLOCKS.hero])
    expect(heroPage.match(/<h1/g)).toHaveLength(1)
    expect(heroPage).not.toContain('ce-product__title')
  })
})
