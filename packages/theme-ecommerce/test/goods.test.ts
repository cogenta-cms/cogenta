import { describe, expect, it } from 'vitest'
import {
  currencyOf,
  DEFAULT_CURRENCY,
  firstText,
  formatPrice,
  priceOf,
  stockOf,
  textOf,
} from '../src/render/goods.js'
import { shopString } from '../src/render/strings.js'

describe('reading a product', () => {
  it('accepts a finite, non-negative number as a price and nothing else', () => {
    expect(priceOf(0)).toBe(0)
    expect(priceOf(24.5)).toBe(24.5)
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, '24', null, undefined]) {
      expect(priceOf(value)).toBeUndefined()
    }
  })

  it('reads a real ISO 4217 code in any case, and falls back to euros otherwise', () => {
    expect(currencyOf('gbp')).toBe('GBP')
    expect(currencyOf(' CHF ')).toBe('CHF')
    expect(currencyOf('XYZ')).toBe(DEFAULT_CURRENCY)
    expect(currencyOf('coins')).toBe('EUR')
    expect(currencyOf(undefined)).toBe('EUR')
  })

  it('formats a whole amount without decimals and a price with cents with two', () => {
    expect(formatPrice(168, 'EUR', 'en')).toBe('€168')
    expect(formatPrice(24.5, 'EUR', 'en')).toBe('€24.50')
    expect(formatPrice(1250, 'EUR', 'en')).toBe('€1,250')
  })

  it('formats in the page locale, and survives a locale tag the platform refuses', () => {
    expect(formatPrice(168, 'EUR', 'fr')).toMatch(/^168\s€$/)
    expect(formatPrice(168, 'EUR', 'not a locale')).toBe('€168')
  })

  it('reads stock as in, out, or nothing said', () => {
    expect(stockOf(true)).toBe('in')
    expect(stockOf(false)).toBe('out')
    expect(stockOf('false')).toBeUndefined()
    expect(stockOf(undefined)).toBeUndefined()
  })

  it('reads text as trimmed and non-empty, and finds the first field that has some', () => {
    expect(textOf('  cotton ')).toBe('cotton')
    expect(textOf('   ')).toBeUndefined()
    expect(textOf(3)).toBeUndefined()
    expect(firstText({ a: '', b: 'x', c: 'y' }, ['a', 'b', 'c'])).toBe('x')
    expect(firstText({}, ['a'])).toBeUndefined()
  })
})

describe('the shop’s own words', () => {
  it('speaks English and French, and English for a locale it does not know', () => {
    expect(shopString('en', 'soldOut')).toBe('Sold out')
    expect(shopString('fr-CA', 'soldOut')).toBe('Épuisé')
    expect(shopString('de', 'soldOut')).toBe('Sold out')
  })

  it('never uses an exclamation mark or shouts in capitals', () => {
    for (const locale of ['en', 'fr']) {
      for (const key of [
        'price',
        'inStock',
        'soldOut',
        'orderByEmail',
        'order',
        'details',
      ] as const) {
        const value = shopString(locale, key)
        expect(value).not.toContain('!')
        expect(value).not.toMatch(/^[A-Z\s]{4,}$/)
      }
    }
  })
})
