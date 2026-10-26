import { describe, expect, it, vi } from 'vitest'
import {
  type ContentSearchServiceLike,
  createContentSearchTool,
} from '../../../src/tools/core/content-search.js'
import type { ToolContext } from '../../../src/tools/types.js'

const CTX: ToolContext = {
  site: { name: 'acme-blog', locales: ['en'], defaultLocale: 'en' },
  actor: { id: 'apikey:k1', roles: ['editor'] },
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
  signal: new AbortController().signal,
}

const HIT = {
  collection: 'page',
  id: 'e1',
  title: 'Opening hours',
  status: 'published',
  locale: 'en',
  excerpt: 'We open at nine.',
}

describe('content.search', () => {
  it('passes the query, the acting actor and a default limit of ten to the host search', async () => {
    const search = vi.fn<ContentSearchServiceLike['search']>(async () => [HIT])
    const tool = createContentSearchTool({ search })

    const result = await tool.execute({ query: 'opening hours' }, CTX)

    expect(result).toEqual({ results: [HIT] })
    expect(search).toHaveBeenCalledWith({ actor: CTX.actor }, { text: 'opening hours', limit: 10 })
  })

  it('narrows to one collection and honours an explicit limit', async () => {
    const search = vi.fn<ContentSearchServiceLike['search']>(async () => [])
    const tool = createContentSearchTool({ search })

    await tool.execute({ query: 'hours', collection: 'page', limit: 3 }, CTX)

    expect(search).toHaveBeenCalledWith(
      { actor: CTX.actor },
      { text: 'hours', collection: 'page', limit: 3 },
    )
  })

  it('declares an input that refuses an empty query and a limit above twenty-five', () => {
    const tool = createContentSearchTool({ search: async () => [] })

    expect(tool.input.safeParse({ query: '   ' }).success).toBe(false)
    expect(tool.input.safeParse({ query: 'x', limit: 26 }).success).toBe(false)
    expect(tool.input.safeParse({ query: 'x', limit: 25 }).success).toBe(true)
  })

  it('is declared read-only under content.read', () => {
    const tool = createContentSearchTool({ search: async () => [] })
    expect(tool.permissions).toEqual(['content.read'])
    expect(tool.sideEffects).toBe(false)
  })
})
