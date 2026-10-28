import { defineCollection, f } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import {
  isLocaleRouted,
  localeOfPath,
  localePrefix,
  searchPathFor,
  termArchivePathFor,
} from '../src/commands/locale-paths.js'

const permissions = {
  read: ['public'],
  create: ['admin'],
  update: ['admin'],
  delete: ['admin'],
  publish: ['admin'],
} as const

const localized = defineCollection({
  name: 'article',
  labels: { singular: 'Article', plural: 'Articles' },
  routing: { pattern: '/blog/:slug', locale: true },
  fields: { title: f.text({ required: true }), slug: f.slug({ from: 'title' }) },
  permissions,
})
const plain = defineCollection({
  name: 'note',
  labels: { singular: 'Note', plural: 'Notes' },
  routing: { pattern: '/notes/:slug' },
  fields: { title: f.text({ required: true }), slug: f.slug({ from: 'title' }) },
  permissions,
})
const site = { locales: ['fr', 'en'], defaultLocale: 'fr' }

describe('locale paths', () => {
  it('prefixes every language but the default one', () => {
    expect(localePrefix('fr', site, [localized])).toBe('')
    expect(localePrefix('en', site, [localized])).toBe('/en')
    expect(searchPathFor('en', site, [localized])).toBe('/en/search')
    expect(searchPathFor('fr', site, [localized])).toBe('/search')
    expect(termArchivePathFor('categorie', 'ia', 'en', site, [localized])).toBe('/en/categorie/ia')
  })

  it('leaves a site without locale-routed collections unprefixed', () => {
    expect(isLocaleRouted(site, [plain])).toBe(false)
    expect(localePrefix('en', site, [plain])).toBe('')
    expect(localeOfPath('/en/search', site, [plain])).toEqual({
      locale: 'fr',
      rest: '/en/search',
    })
  })

  it('reads the language of a path and strips its prefix', () => {
    expect(localeOfPath('/en/search', site, [localized])).toEqual({ locale: 'en', rest: '/search' })
    expect(localeOfPath('/en', site, [localized])).toEqual({ locale: 'en', rest: '/' })
    expect(localeOfPath('/search', site, [localized])).toEqual({ locale: 'fr', rest: '/search' })
    expect(localeOfPath('/de/search', site, [localized])).toEqual({
      locale: 'fr',
      rest: '/de/search',
    })
  })
})
