import { describe, expect, it } from 'vitest'
import { applyAccountLanguage, i18next, setLanguage } from '../src/i18n/index.js'

describe('the document language used by assistive technology', () => {
  it('matches the initial rendered interface language', () => {
    expect(document.documentElement.lang).toBe(i18next.resolvedLanguage)
    expect(document.documentElement.lang).toBe('fr')
  })

  it('follows French and English preference changes without reloading', async () => {
    setLanguage('en')
    await i18next.changeLanguage('en')
    expect(document.documentElement.lang).toBe('en')
    expect(i18next.t('assistant.builtinTools.rewrite.label')).toBe('Rewrite')
    setLanguage('fr')
    await i18next.changeLanguage('fr')
    expect(document.documentElement.lang).toBe('fr')
    expect(i18next.t('assistant.builtinTools.rewrite.label')).toBe('Réécrire')
  })

  it('follows the supported account preference and ignores unsupported values', async () => {
    applyAccountLanguage('en')
    await i18next.changeLanguage('en')
    expect(document.documentElement.lang).toBe('en')
    applyAccountLanguage('kl')
    expect(document.documentElement.lang).toBe('en')
  })
})
