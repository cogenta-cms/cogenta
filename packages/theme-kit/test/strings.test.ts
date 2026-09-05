import { describe, expect, it } from 'vitest'
import {
  createThemeTranslator,
  interpolate,
  THEME_STRINGS,
  themeLocaleFor,
} from '../src/strings.js'

describe('theme strings', () => {
  it('translates every key in both locales, never returning the key itself', () => {
    for (const locale of ['en', 'fr'] as const) {
      const t = createThemeTranslator(locale)
      for (const key of Object.keys(THEME_STRINGS.en)) {
        expect(t(key), `${locale}:${key}`).not.toBe(key)
        expect(t(key).length).toBeGreaterThan(0)
      }
    }
  })

  it('has the same key set in French as in English', () => {
    expect(Object.keys(THEME_STRINGS.fr).sort()).toEqual(Object.keys(THEME_STRINGS.en).sort())
  })

  it('interpolates {{placeholders}} and leaves unknown ones visible', () => {
    expect(interpolate('{{minutes}} min read', { minutes: 4 })).toBe('4 min read')
    expect(interpolate('Open on {{provider}}', { provider: 'YouTube' })).toBe('Open on YouTube')
    expect(interpolate('{{missing}} stays', {})).toBe('{{missing}} stays')
    expect(interpolate('plain', undefined)).toBe('plain')
  })

  it('resolves regional and unknown locales', () => {
    expect(themeLocaleFor('fr-CA')).toBe('fr')
    expect(themeLocaleFor('FR')).toBe('fr')
    expect(themeLocaleFor('de-DE')).toBe('en')
    expect(createThemeTranslator('fr-BE')('entry.untitled')).toBe('Sans titre')
  })

  it('returns the key for an unknown string, never an empty string', () => {
    expect(createThemeTranslator('en')('nope.missing')).toBe('nope.missing')
  })

  it('lets a theme override a string for one locale and falls back through English', () => {
    const t = createThemeTranslator('fr', {
      fr: { 'collection.empty': 'Rien ici.' },
      en: { 'x.only': 'Only in English' },
    })
    expect(t('collection.empty')).toBe('Rien ici.')
    expect(t('x.only')).toBe('Only in English')
    expect(t('entry.readingTime', { minutes: 3 })).toBe('3 min de lecture')
  })
})
