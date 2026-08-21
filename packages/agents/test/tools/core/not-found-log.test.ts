import { describe, expect, it, vi } from 'vitest'
import {
  createNotFoundLogReadTool,
  type NotFoundLogReader,
} from '../../../src/tools/core/not-found-log.js'
import type { ToolContext } from '../../../src/tools/types.js'

const CTX: ToolContext = {
  site: { name: 'acme-blog', locales: ['en'], defaultLocale: 'en' },
  actor: { id: 'agent:site-monitor', roles: ['agent'] },
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
  signal: new AbortController().signal,
}

function fakeStore(overrides: Partial<NotFoundLogReader> = {}): NotFoundLogReader {
  return {
    list: vi.fn(async () => [
      { path: '/old-guide', hits: 42, firstSeen: 1, lastSeen: 2, lastReferrer: null },
    ]),
    ...overrides,
  }
}

describe('logs.read_not_found', () => {
  it('returns the store’s entries, unmodified', async () => {
    const store = fakeStore()
    const tool = createNotFoundLogReadTool(store)

    const result = await tool.execute({}, CTX)

    expect(result).toEqual({
      entries: [{ path: '/old-guide', hits: 42, firstSeen: 1, lastSeen: 2, lastReferrer: null }],
    })
  })

  it('passes a given limit through, and omits it when absent', async () => {
    const store = fakeStore()
    const tool = createNotFoundLogReadTool(store)

    await tool.execute({ limit: 10 }, CTX)
    expect(store.list).toHaveBeenCalledWith({ limit: 10 })

    await tool.execute({}, CTX)
    expect(store.list).toHaveBeenCalledWith({})
  })

  it('declares itself read-only, gated by logs.read', () => {
    const tool = createNotFoundLogReadTool(fakeStore())
    expect(tool.sideEffects).toBe(false)
    expect(tool.reversible).toBe(false)
    expect(tool.permissions).toEqual(['logs.read'])
  })
})
