import { describe, expect, it, vi } from 'vitest'
import { createRedirectCreateTool, type RedirectWriter } from '../../../src/tools/core/redirects.js'
import type { ToolContext } from '../../../src/tools/types.js'

const CTX: ToolContext = {
  site: { name: 'acme-blog', locales: ['en'], defaultLocale: 'en' },
  actor: { id: 'agent:site-monitor', roles: ['agent'] },
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
  signal: new AbortController().signal,
}

function fakeStore(overrides: Partial<RedirectWriter> = {}): RedirectWriter {
  return {
    add: vi.fn(async (input) => ({
      id: 'redirect-1',
      from: input.from,
      to: input.to,
      status: input.status ?? 301,
      createdAt: 1000,
    })),
    remove: vi.fn(async () => true),
    ...overrides,
  }
}

describe('redirects.create', () => {
  it('creates a redirect, always with reason "agent"', async () => {
    const store = fakeStore()
    const tool = createRedirectCreateTool(store)

    const result = await tool.execute({ from: '/old-guide', to: '/guides/new-guide' }, CTX)

    expect(store.add).toHaveBeenCalledWith({
      from: '/old-guide',
      to: '/guides/new-guide',
      reason: 'agent',
    })
    expect(result).toEqual({
      id: 'redirect-1',
      from: '/old-guide',
      to: '/guides/new-guide',
      status: 301,
      createdAt: 1000,
    })
  })

  it('passes an explicit status through', async () => {
    const store = fakeStore()
    const tool = createRedirectCreateTool(store)

    await tool.execute({ from: '/a', to: '/b', status: 302 }, CTX)

    expect(store.add).toHaveBeenCalledWith({ from: '/a', to: '/b', status: 302, reason: 'agent' })
  })

  it('rejects a status other than 301/302/307/308 — 410 is not offered', async () => {
    const store = fakeStore()
    const tool = createRedirectCreateTool(store)
    expect(() => tool.input.parse({ from: '/a', to: '/b', status: 410 })).toThrow()
  })

  it('reverts by removing the redirect it created', async () => {
    const store = fakeStore()
    const tool = createRedirectCreateTool(store)
    const receipt = await tool.execute({ from: '/old-guide', to: '/guides/new-guide' }, CTX)

    await tool.revert?.(receipt, CTX)

    expect(store.remove).toHaveBeenCalledWith('/old-guide')
  })

  it('declares itself a reversible side effect, gated by redirects.write', () => {
    const tool = createRedirectCreateTool(fakeStore())
    expect(tool.sideEffects).toBe(true)
    expect(tool.reversible).toBe(true)
    expect(tool.permissions).toEqual(['redirects.write'])
    expect(tool.revert).toBeDefined()
  })
})
