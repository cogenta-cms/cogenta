import { describe, expect, it } from 'vitest'
import {
  currencyOf,
  DEFAULT_CURRENCY,
  firstText,
  formatPrice,
  groupBySection,
  isVegetarian,
  priceOf,
  sectionOf,
  textOf,
} from '../src/render/menu.js'
import { menuString } from '../src/render/strings.js'

describe('reading a price', () => {
  it('accepts a finite, non-negative number and nothing else', () => {
    expect(priceOf(12)).toBe(12)
    expect(priceOf(0)).toBe(0)
    expect(priceOf(-1)).toBeUndefined()
    expect(priceOf(Number.NaN)).toBeUndefined()
    expect(priceOf(Number.POSITIVE_INFINITY)).toBeUndefined()
    expect(priceOf('12')).toBeUndefined()
  })

  it('shows euros unless the entry names another real currency', () => {
    expect(DEFAULT_CURRENCY).toBe('EUR')
    expect(currencyOf(undefined)).toBe('EUR')
    expect(currencyOf('chf')).toBe('CHF')
    expect(currencyOf('XYZ')).toBe('EUR')
    expect(currencyOf('euros')).toBe('EUR')
  })

  it('formats a whole amount without decimals and cents with two', () => {
    expect(formatPrice(12, 'EUR', 'en')).toBe('€12')
    expect(formatPrice(9.5, 'EUR', 'en')).toBe('€9.50')
  })

  it('follows the locale for the position of the currency', () => {
    expect(formatPrice(12, 'EUR', 'fr')).toMatch(/^12\s€$/)
  })

  it('falls back to English formatting for a locale the platform refuses', () => {
    expect(formatPrice(12, 'EUR', 'not a locale!')).toBe('€12')
  })
})

describe('reading a dish', () => {
  it('trims text and treats an empty string as absent', () => {
    expect(textOf('  Starters ')).toBe('Starters')
    expect(textOf('   ')).toBeUndefined()
    expect(textOf(3)).toBeUndefined()
  })

  it('takes the first field that holds text', () => {
    expect(firstText({ a: '', b: 'second', c: 'third' }, ['a', 'b', 'c'])).toBe('second')
  })

  it('reads the section from category, section or course, in that order', () => {
    expect(sectionOf({ category: 'Mains' })).toBe('Mains')
    expect(sectionOf({ section: 'Desserts' })).toBe('Desserts')
    expect(sectionOf({ course: 'Cheese' })).toBe('Cheese')
    expect(sectionOf({ category: 'Mains', course: 'Cheese' })).toBe('Mains')
    expect(sectionOf({})).toBeUndefined()
  })

  it('calls a dish vegetarian only when it says so', () => {
    expect(isVegetarian({ vegetarian: true })).toBe(true)
    expect(isVegetarian({ vegetarian: 'yes' })).toBe(false)
    expect(isVegetarian({})).toBe(false)
  })
})

describe('grouping a menu', () => {
  const dishes = [
    { id: '1', category: 'Starters' },
    { id: '2', category: 'Mains' },
    { id: '3', category: 'Starters' },
    { id: '4' },
    { id: '5', category: 'Mains' },
  ]

  it('opens each section where its first dish appears', () => {
    expect(groupBySection(dishes).map((group) => group.title)).toEqual([
      'Starters',
      'Mains',
      undefined,
    ])
  })

  it('keeps the dishes of a section in the order they arrived, never sorted by name', () => {
    const [starters, mains] = groupBySection(dishes)
    expect(starters?.items.map((dish) => dish.id)).toEqual(['1', '3'])
    expect(mains?.items.map((dish) => dish.id)).toEqual(['2', '5'])
  })

  it('returns no group for an empty list', () => {
    expect(groupBySection([])).toEqual([])
  })
})

describe('the menu’s own words', () => {
  it('reads English and French, and English for a locale it does not know', () => {
    expect(menuString('en', 'vegetarian')).toBe('Vegetarian')
    expect(menuString('fr-FR', 'vegetarian')).toBe('Végétarien')
    expect(menuString('de', 'allergens')).toBe('Allergens')
  })
})
