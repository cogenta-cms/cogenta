import { describe, expect, it, vi } from 'vitest'
import type { ContentServiceLike } from '../../../src/tools/core/content.js'
import { createContentWriteTranslationTool } from '../../../src/tools/core/content.js'
import { createMediaImportUrlTool } from '../../../src/tools/core/media-import.js'
import {
  createTaxonomyCreateTermTool,
  createTaxonomyListTermsTool,
  type TaxonomyServiceLike,
  type TaxonomyTermLike,
} from '../../../src/tools/core/taxonomy.js'
import type { ToolContext } from '../../../src/tools/types.js'

const CTX: ToolContext = {
  site: { name: 'news', locales: ['en', 'fr'], defaultLocale: 'en' },
  actor: { id: 'apikey:k1', roles: ['editor'] },
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
  signal: new AbortController().signal,
}

function fakeContent(): ContentServiceLike {
  return {
    read: vi.fn(async () => ({ id: 'en1' })),
    create: vi.fn(async () => ({ id: 'fr1', locale: 'fr', translationOf: 'en1' })),
    update: vi.fn(async () => ({ id: 'en1' })),
    publish: vi.fn(async () => ({ id: 'en1' })),
    remove: vi.fn(async () => undefined),
  }
}

describe('content.write_translation', () => {
  it('creates the draft in the target language, linked to the source entry', async () => {
    const service = fakeContent()
    const tool = createContentWriteTranslationTool(service)

    const result = await tool.execute(
      { collection: 'post', sourceId: 'en1', locale: 'fr', values: { title: 'Bonjour' } },
      CTX,
    )

    expect(result).toMatchObject({ id: 'fr1', translationOf: 'en1' })
    expect(service.create).toHaveBeenCalledWith(
      { actor: CTX.actor },
      'post',
      { values: { title: 'Bonjour' }, locale: 'fr', translationOf: 'en1' },
      { state: 'working', depth: 0 },
    )
  })

  it('is a write a human approves: side effects, not reversible, the draft permission', () => {
    const tool = createContentWriteTranslationTool(fakeContent())
    expect(tool.permissions).toEqual(['content.write_draft'])
    expect(tool.sideEffects).toBe(true)
    expect(tool.reversible).toBe(false)
  })
})

function fakeTerms(initial: readonly TaxonomyTermLike[] = []): TaxonomyServiceLike & {
  readonly created: TaxonomyTermLike[]
} {
  const terms = [...initial]
  const created: TaxonomyTermLike[] = []
  return {
    created,
    list: vi.fn(async () => terms),
    create: vi.fn(async (_taxonomy, input) => {
      const term = {
        id: `t${terms.length + 1}`,
        slug: input.slug,
        parent: input.parent ?? null,
        labels: input.labels,
      }
      terms.push(term)
      created.push(term)
      return term
    }),
  }
}

describe('taxonomy.list_terms', () => {
  it('lists the terms of the named taxonomy', async () => {
    const service = fakeTerms([{ id: 't1', slug: 'ai', parent: null, labels: { en: 'AI' } }])
    const result = await createTaxonomyListTermsTool(service).execute({ taxonomy: 'tag' }, CTX)
    expect(result.terms).toEqual([{ id: 't1', slug: 'ai', parent: null, labels: { en: 'AI' } }])
    expect(service.list).toHaveBeenCalledWith('tag')
  })
})

describe('taxonomy.create_term', () => {
  it('creates a missing term', async () => {
    const service = fakeTerms()
    const result = await createTaxonomyCreateTermTool(service).execute(
      { taxonomy: 'tag', slug: 'ai-agents', labels: { en: 'AI agents', fr: 'Agents IA' } },
      CTX,
    )
    expect(result).toMatchObject({ slug: 'ai-agents', created: true })
    expect(service.created).toHaveLength(1)
  })

  it('returns the existing term for a slug already taken, without touching its labels', async () => {
    const service = fakeTerms([{ id: 't1', slug: 'ai', parent: null, labels: { en: 'AI' } }])
    const result = await createTaxonomyCreateTermTool(service).execute(
      { taxonomy: 'tag', slug: 'ai', labels: { en: 'Artificial intelligence' } },
      CTX,
    )
    expect(result).toEqual({
      id: 't1',
      slug: 'ai',
      parent: null,
      labels: { en: 'AI' },
      created: false,
    })
    expect(service.created).toHaveLength(0)
  })

  it('refuses a slug that is not lowercase words joined by hyphens', () => {
    const tool = createTaxonomyCreateTermTool(fakeTerms())
    expect(
      tool.input.safeParse({ taxonomy: 'tag', slug: 'AI Agents', labels: { en: 'x' } }).success,
    ).toBe(false)
    expect(tool.input.safeParse({ taxonomy: 'tag', slug: 'ai', labels: {} }).success).toBe(false)
  })
})

describe('media.import_url', () => {
  it('hands the host an https address with the alt text and credit', async () => {
    const importImage = vi.fn(async () => ({
      id: 'm1',
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      byteLength: 1234,
      width: 1920,
      height: 1080,
    }))
    const tool = createMediaImportUrlTool({ importImage })
    const result = await tool.execute(
      {
        url: 'https://upload.wikimedia.org/a/photo.jpg',
        alt: 'A data centre',
        credit: { author: 'Jane', license: 'CC BY 4.0' },
      },
      CTX,
    )
    expect(result).toMatchObject({
      id: 'm1',
      sourceUrl: 'https://upload.wikimedia.org/a/photo.jpg',
    })
    expect(importImage).toHaveBeenCalledWith({
      url: 'https://upload.wikimedia.org/a/photo.jpg',
      alt: 'A data centre',
      credit: { author: 'Jane', license: 'CC BY 4.0' },
    })
  })

  it('refuses a non-https address before the host is called', async () => {
    const importImage = vi.fn()
    const tool = createMediaImportUrlTool({ importImage })
    await expect(
      tool.execute({ url: 'http://example.com/a.jpg', alt: 'x' }, CTX),
    ).rejects.toMatchObject({ code: 'MEDIA_INVALID' })
    expect(importImage).not.toHaveBeenCalled()
  })

  it('requires alt text and is a write a human approves', () => {
    const tool = createMediaImportUrlTool({ importImage: vi.fn() })
    expect(tool.input.safeParse({ url: 'https://example.com/a.jpg', alt: '' }).success).toBe(false)
    expect(tool.permissions).toEqual(['media.write'])
    expect(tool.sideEffects).toBe(true)
    expect(tool.reversible).toBe(false)
  })
})
