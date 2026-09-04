import { describe, expect, it } from 'vitest'
import type { ContentEntry, ImageSource, RenderContext } from '../src/contract.js'
import { entryImage } from '../src/entry.js'

function fakeSource(media: string): ImageSource {
  return {
    kind: 'image',
    src: `/_image?id=${media}`,
    srcset: '',
    width: 100,
    height: 100,
    alt: '',
    focal: null,
  }
}

function fakeContext(): RenderContext {
  return {
    site: { name: 'Site', url: 'https://example.com', locales: ['en'], defaultLocale: 'en' },
    locale: 'en',
    url: new URL('https://example.com/'),
    t: (key) => key,
    image: (media) => fakeSource(media),
    link: () => '#',
    content: {
      entry: async () => null,
      byPath: async () => null,
      list: async () => ({ items: [], nextCursor: null }),
    },
  }
}

function entryWith(values: Record<string, unknown>): ContentEntry {
  return { id: '1', collection: 'post', locale: 'en', status: 'published', ...values }
}

describe('entryImage', () => {
  it('reads coverImage first, ahead of every other candidate field', () => {
    const ctx = fakeContext()
    const entry = entryWith({ coverImage: 'a', cover: 'b', image: 'c' })
    expect(entryImage(entry, ctx)?.src).toBe('/_image?id=a')
  })

  it('falls through the field list in the documented order', () => {
    const ctx = fakeContext()
    expect(entryImage(entryWith({ cover: 'b', image: 'c' }), ctx)?.src).toBe('/_image?id=b')
    expect(entryImage(entryWith({ image: 'c', photo: 'd' }), ctx)?.src).toBe('/_image?id=c')
    expect(entryImage(entryWith({ featuredImage: 'e' }), ctx)?.src).toBe('/_image?id=e')
    expect(entryImage(entryWith({ photo: 'f' }), ctx)?.src).toBe('/_image?id=f')
    expect(entryImage(entryWith({ thumbnail: 'g' }), ctx)?.src).toBe('/_image?id=g')
    expect(entryImage(entryWith({ seoImage: 'h' }), ctx)?.src).toBe('/_image?id=h')
  })

  it('ignores a non-string value at a candidate field name', () => {
    const ctx = fakeContext()
    const entry = entryWith({ coverImage: { id: 'not-a-string' }, cover: 'real' })
    expect(entryImage(entry, ctx)?.src).toBe('/_image?id=real')
  })

  it('ignores an empty or blank string', () => {
    const ctx = fakeContext()
    const entry = entryWith({ coverImage: '', cover: '   ', image: 'real' })
    expect(entryImage(entry, ctx)?.src).toBe('/_image?id=real')
  })

  it('returns undefined when the entry names no image field at all', () => {
    const ctx = fakeContext()
    expect(entryImage(entryWith({ title: 'No picture here' }), ctx)).toBeUndefined()
  })

  it('passes options through to ctx.image', () => {
    let seenOptions: unknown
    const ctx: RenderContext = {
      ...fakeContext(),
      image: (media, options) => {
        seenOptions = options
        return fakeSource(media)
      },
    }
    entryImage(entryWith({ coverImage: 'a' }), ctx, { width: 800 })
    expect(seenOptions).toEqual({ width: 800 })
  })
})
