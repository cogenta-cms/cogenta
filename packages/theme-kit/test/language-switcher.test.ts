import { describe, expect, it } from 'vitest'
import { type ChromeLanguage, renderLanguageSwitcher, serialize } from '../src/index.js'

const LANGUAGES: readonly ChromeLanguage[] = [
  { locale: 'fr', label: 'Français', href: '/blog/bonjour', current: true },
  { locale: 'en', label: 'English', href: '/en/blog/hello', current: false },
]

describe('renderLanguageSwitcher', () => {
  it('draws nothing for a site with a single language, or none declared', () => {
    expect(renderLanguageSwitcher(undefined, { locale: 'fr' })).toBeNull()
    expect(renderLanguageSwitcher([], { locale: 'fr' })).toBeNull()
    expect(renderLanguageSwitcher(LANGUAGES.slice(0, 1), { locale: 'fr' })).toBeNull()
  })

  it('links every language and marks only the current one', () => {
    const node = renderLanguageSwitcher(LANGUAGES, { locale: 'fr', className: 'switcher' })
    expect(node).not.toBeNull()
    const html = serialize(node as NonNullable<typeof node>)
    expect(html).toContain('<nav class="switcher" aria-label="Langue">')
    expect(html).toContain('href="/blog/bonjour" lang="fr" hreflang="fr" aria-current="true"')
    expect(html).toContain('href="/en/blog/hello" lang="en" hreflang="en">English</a>')
    expect(html.match(/aria-current/g)).toHaveLength(1)
  })

  it('names the navigation in the page language', () => {
    const html = serialize(
      renderLanguageSwitcher(LANGUAGES, { locale: 'en' }) as NonNullable<
        ReturnType<typeof renderLanguageSwitcher>
      >,
    )
    expect(html).toContain('aria-label="Language"')
  })

  it('escapes a label that carries markup', () => {
    const html = serialize(
      renderLanguageSwitcher(
        [
          { locale: 'fr', label: 'Fr', href: '/', current: true },
          { locale: 'en', label: '<b>En</b>', href: '/en/', current: false },
        ],
        { locale: 'fr' },
      ) as NonNullable<ReturnType<typeof renderLanguageSwitcher>>,
    )
    expect(html).not.toContain('<b>')
    expect(html).toContain('&lt;b&gt;En&lt;/b&gt;')
  })
})
