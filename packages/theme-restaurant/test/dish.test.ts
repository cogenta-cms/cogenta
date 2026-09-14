import { type PageEntryMeta, serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { isDishPage } from '../src/render/dish.js'
import { renderPage } from '../src/render/render-block.js'
import { BLOCKS, makeContext } from './fixtures.js'

const ctx = makeContext({ url: new URL('https://maisonverte.example/en/menu/grilled-octopus') })

const OCTOPUS: PageEntryMeta = {
  collection: 'menu_item',
  excerpt: 'Braised for two hours, then grilled over vine cuttings.',
  image: ctx.image('photo-octopus'),
  fields: {
    name: 'Grilled octopus, saffron and orange',
    price: 17,
    currency: 'EUR',
    category: 'Starters',
    vegetarian: false,
    sourcing: 'Day boats at Saint-Gilles-Croix-de-Vie',
    pairing: 'Saint-Joseph blanc, 2022',
    allergens: 'Molluscs, egg',
  },
}

function dishPage(entry: PageEntryMeta, blocks = [BLOCKS.collectionList]): string {
  return serialize(renderPage({ title: 'Grilled octopus, saffron and orange', blocks, entry }, ctx))
}

const html = dishPage(OCTOPUS)

describe('recognising a dish', () => {
  it('takes an entry whose fields carry a numeric price for a dish', () => {
    expect(isDishPage(OCTOPUS)).toBe(true)
  })

  it('takes nothing else for a dish: no entry, no fields, a price that is not a number', () => {
    expect(isDishPage(undefined)).toBe(false)
    expect(isDishPage({ collection: 'page' })).toBe(false)
    expect(isDishPage({ collection: 'menu_item', fields: { price: '17' } })).toBe(false)
  })
})

describe('the page of one dish', () => {
  it('opens on the dish sheet with exactly one h1, the dish', () => {
    expect(html).toContain('<main class="cg-main cr-main cr-main--dish" id="cg-main">')
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html).toContain('<h1 class="cr-dish__title">Grilled octopus, saffron and orange</h1>')
  })

  it('shows the photograph first, eagerly, at the size of its column', () => {
    expect(html.indexOf('cr-dish__media')).toBeLessThan(html.indexOf('cr-dish__title'))
    expect(html).toMatch(
      /<img class="cr-dish__image"[^>]*sizes="\(min-width: 64rem\) 48vw, 100vw"[^>]*loading="eager"/,
    )
    expect(html).toContain('data-media="true"')
  })

  it('names the section of the menu above the name, in words', () => {
    expect(html).toContain('<p class="cr-dish__section">Starters</p>')
  })

  it('prints the description under the name', () => {
    expect(html).toContain(
      '<p class="cr-dish__summary">Braised for two hours, then grilled over vine cuttings.</p>',
    )
  })

  it('prints the price in its currency, announced as a price', () => {
    expect(html).toContain(
      '<span class="cr-dish__price"><span class="cg-visually-hidden">Price </span><data value="17">€17</data></span>',
    )
  })

  it('lists where it comes from, what to drink with it and its allergens, in that order', () => {
    const from = html.indexOf('data-fact="sourcing"')
    const drink = html.indexOf('data-fact="pairing"')
    const allergens = html.indexOf('data-fact="allergens"')
    expect(from).toBeGreaterThan(-1)
    expect(drink).toBeGreaterThan(from)
    expect(allergens).toBeGreaterThan(drink)
    expect(html).toContain('<dt class="cr-dish__fact-label">To drink</dt>')
    expect(html).toContain('<dd class="cr-dish__fact-value">Molluscs, egg</dd>')
  })

  it('gives the details a heading for assistive technology without adding a visible one', () => {
    expect(html).toContain('<h2 class="cg-visually-hidden">About the dish</h2>')
  })

  it('says a vegetarian dish is vegetarian, and says nothing for any other', () => {
    expect(html).not.toContain('cr-dish__diet')
    const beetroot = dishPage({ ...OCTOPUS, fields: { ...OCTOPUS.fields, vegetarian: true } })
    expect(beetroot).toContain('<span class="cr-dish__diet">Vegetarian</span>')
  })

  it('opens a dish without a photograph on words alone, never an empty frame', () => {
    const { image: _image, ...wine } = OCTOPUS
    const glass = dishPage(wine)
    expect(glass).toContain('data-media="false"')
    expect(glass).not.toContain('cr-dish__media')
  })

  it('leaves out every detail the dish does not have', () => {
    const plain = dishPage({ collection: 'menu_item', fields: { price: 9 } })
    expect(plain).not.toContain('cr-dish__details')
    expect(plain).not.toContain('cr-dish__section')
    expect(plain).not.toContain('cr-dish__summary')
  })

  it('offers nothing to order: no button, no form, no cart', () => {
    expect(html).not.toMatch(/<button|<form|cart|order now|add to/i)
  })

  it('follows the sheet with the rest of the section, which skips this dish', () => {
    expect(html.indexOf('cr-dish')).toBeLessThan(html.indexOf('data-block="collectionList"'))
  })

  it('formats the price in French for a French page', () => {
    const fr = serialize(
      renderPage(
        { title: 'Poulpe grillé', blocks: [], entry: OCTOPUS },
        makeContext({ locale: 'fr' }),
      ),
    )
    expect(fr).toMatch(
      /<span class="cg-visually-hidden">Prix <\/span><data value="17">17\s€<\/data>/,
    )
    expect(fr).toContain('<dt class="cr-dish__fact-label">Allergènes</dt>')
  })
})

describe('the dish sheet and older hosts', () => {
  it('opens a dish from a host before theme@1.5 (no fields) as a plain page, never inventing a price', () => {
    const { fields: _fields, ...withoutFields } = OCTOPUS
    const old = serialize(
      renderPage({ title: 'Grilled octopus', blocks: [], entry: withoutFields }, ctx),
    )
    expect(old).toContain('<h1 class="cr-page-head__title">Grilled octopus</h1>')
    expect(old).not.toContain('cr-dish')
    expect(old).not.toContain('€')
  })

  it('opens a page from a host before theme@1.4 (no entry) on its bare title', () => {
    const old = serialize(renderPage({ title: 'Grilled octopus', blocks: [] }, ctx))
    expect(old).toContain('<h1 class="cr-page-head__title">Grilled octopus</h1>')
    expect(old.match(/<h1/g)).toHaveLength(1)
  })
})
