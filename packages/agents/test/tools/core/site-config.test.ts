import { describe, expect, it } from 'vitest'
import { createSiteConfigReadTool } from '../../../src/tools/core/site-config.js'
import type { ToolContext } from '../../../src/tools/types.js'

describe('site.config_read', () => {
  it('projects ctx.site, including an optional url when present', async () => {
    const ctx: ToolContext = {
      site: {
        name: 'acme-blog',
        url: 'https://acme.example',
        locales: ['en', 'fr'],
        defaultLocale: 'en',
      },
      actor: { id: null, roles: [] },
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
      signal: new AbortController().signal,
    }
    const tool = createSiteConfigReadTool()

    const result = await tool.execute({}, ctx)

    expect(result).toEqual({
      name: 'acme-blog',
      url: 'https://acme.example',
      locales: ['en', 'fr'],
      defaultLocale: 'en',
    })
  })

  it('omits url when ctx.site has none', async () => {
    const ctx: ToolContext = {
      site: { name: 'acme-blog', locales: ['en'], defaultLocale: 'en' },
      actor: { id: null, roles: [] },
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
      signal: new AbortController().signal,
    }
    const tool = createSiteConfigReadTool()

    const result = await tool.execute({}, ctx)

    expect(result).toEqual({ name: 'acme-blog', locales: ['en'], defaultLocale: 'en' })
    expect('url' in result).toBe(false)
  })

  it('declares no side effects', () => {
    const tool = createSiteConfigReadTool()
    expect(tool.sideEffects).toBe(false)
    expect(tool.permissions).toEqual(['site.config_read'])
  })
})
