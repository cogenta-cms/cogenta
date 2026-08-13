import { isCogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import type { ContentClient, SiteConfig } from '../src/index.js'
import { createRenderContext } from '../src/index.js'

const site: SiteConfig = {
  name: 'Le blog',
  url: 'https://example.test',
  locales: ['fr', 'en'],
  defaultLocale: 'fr',
}

const content: ContentClient = {
  entry: async () => null,
  byPath: async () => null,
  list: async () => ({ items: [], nextCursor: null, hasMore: false }),
}

const context = (overrides: Partial<Parameters<typeof createRenderContext>[0]> = {}) =>
  createRenderContext({
    site,
    locale: 'fr',
    url: new URL('https://example.test/blog/hello'),
    content,
    ...overrides,
  })

describe('the render context', () => {
  it('exposes exactly what contract D freezes, and nothing else', () => {
    // The contract is a closed surface: anything extra here is something a
    // sandboxed theme could reach, so the test is an equality, not a subset.
    expect(Object.keys(context()).sort()).toEqual([
      'content',
      'image',
      'link',
      'locale',
      'site',
      't',
      'url',
    ])
  })

  it('refuses to render a locale the site does not declare', () => {
    expect(() => context({ locale: 'de' })).toThrowError(/de/u)
  })
})

describe('translation', () => {
  const messages = {
    fr: { 'nav.home': 'Accueil', greeting: 'Bonjour {name}' },
    en: { 'nav.home': 'Home' },
  }

  it('returns the key itself when it knows no translation', () => {
    expect(context({ messages }).t('nav.unknown')).toBe('nav.unknown')
  })

  it('falls back to the default locale before giving up', () => {
    const english = context({ locale: 'en', messages })
    expect(english.t('greeting', { name: 'Ada' })).toBe('Bonjour Ada')
  })

  it('substitutes named values and leaves unknown placeholders alone', () => {
    expect(context({ messages }).t('greeting', { name: 'Ada' })).toBe('Bonjour Ada')
    expect(context({ messages }).t('greeting')).toBe('Bonjour {name}')
  })
})

describe('links', () => {
  const resolveEntryPath = (target: { collection: string; id: string }): string | null =>
    target.id === 'gone' ? null : `/blog/${target.id}`

  it('leaves an external target exactly as written', () => {
    const ctx = context()
    expect(ctx.link('https://elsewhere.test/a')).toBe('https://elsewhere.test/a')
    expect(ctx.link('mailto:hi@example.test')).toBe('mailto:hi@example.test')
    expect(ctx.link('#main')).toBe('#main')
  })

  it('prefixes every locale but the default one', () => {
    expect(context().link({ path: '/about' })).toBe('/about')
    expect(context({ locale: 'en' }).link({ path: '/about' })).toBe('/en/about')
    expect(context({ locale: 'en' }).link({ path: '/' })).toBe('/en')
  })

  it('resolves an entry through the routing layer the host supplies', () => {
    expect(context({ resolveEntryPath }).link({ collection: 'article', id: 'abc' })).toBe(
      '/blog/abc',
    )
  })

  it('fails loudly on a link to an entry that has no route', () => {
    // Contract A wants a dangling internal link detectable. Emitting `#` would
    // ship a broken page that nobody notices.
    const ctx = context({ resolveEntryPath })
    expect(() => ctx.link({ collection: 'article', id: 'gone' })).toThrowError(/no route/u)
  })
})

describe('images', () => {
  const media = { id: 'm1', alt: 'A cat', width: 1600, height: 900, focal: { x: 0.4, y: 0.2 } }

  it('returns what a responsive img needs and takes alt and focal from the media', () => {
    const source = context().image(media, { width: 800, format: 'avif' })

    expect(source.width).toBe(800)
    expect(source.height).toBe(450)
    expect(source.alt).toBe('A cat')
    expect(source.focal).toEqual({ x: 0.4, y: 0.2 })
    expect(source.src).toContain('f=avif')
    expect(source.srcset).toContain('320w')
    // Never offered larger than the original: upscaling invents detail.
    expect(source.srcset).not.toContain('1920w')
  })

  it('refuses a media with no size rather than guessing one', () => {
    const error = (() => {
      try {
        context().image({ id: 'm2' })
        return null
      } catch (caught: unknown) {
        return caught
      }
    })()

    expect(isCogentaError(error)).toBe(true)
    if (isCogentaError(error)) expect(error.code).toBe('CONTENT_INVALID')
  })
})
