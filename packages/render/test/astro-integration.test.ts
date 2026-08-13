import { fileURLToPath } from 'node:url'
import type { AstroIntegration } from 'astro'
import { describe, expect, it } from 'vitest'
import {
  cogentaTheme,
  parseRenderConfig,
  THEME_ALIAS,
  THEME_VIRTUAL_MODULE,
  themeVirtualModule,
} from '../src/index.js'

type SetupHook = NonNullable<AstroIntegration['hooks']['astro:config:setup']>
type SetupOptions = Parameters<SetupHook>[0]

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url))

const config = parseRenderConfig({
  site: { name: 'Le blog', url: 'https://example.test', locales: ['fr'], defaultLocale: 'fr' },
  theme: { name: 'canonical-theme' },
  content: { url: 'https://api.example.test', token: 'read-only' },
})

interface Recorded {
  readonly updates: unknown[]
  readonly logs: string[]
  readonly options: SetupOptions
}

/**
 * Astro hands the hook a large object; the integration reads three of its
 * fields. The stand-in supplies those three and is cast once, rather than
 * spawning a real Astro build to observe two lines of configuration.
 */
function setupOptions(): Recorded {
  const updates: unknown[] = []
  const logs: string[] = []
  const options = {
    config: { root: new URL(`file://${fixtures.replace(/\\/gu, '/')}`) },
    updateConfig: (update: unknown) => {
      updates.push(update)
      return {}
    },
    logger: { info: (message: string) => logs.push(message) },
  } as unknown as SetupOptions

  return { updates, logs, options }
}

interface ViteUpdate {
  readonly vite: {
    readonly plugins: readonly { name: string }[]
    readonly resolve: { readonly alias: Readonly<Record<string, string>> }
  }
}

describe('the Astro integration', () => {
  it('resolves the active theme from the configuration and aliases its source', async () => {
    const recorded = setupOptions()
    const integration = cogentaTheme({ config })

    await integration.hooks['astro:config:setup']?.(recorded.options)

    const update = recorded.updates[0] as ViteUpdate
    expect(update.vite.resolve.alias[THEME_ALIAS]).toContain('canonical-theme')
    expect(update.vite.plugins.map((plugin) => plugin.name)).toContain('cogenta:theme')
    expect(recorded.logs[0]).toContain('canonical@1.0.0')
  })

  it('refuses to start on a theme that fails the installation check', async () => {
    const recorded = setupOptions()
    const integration = cogentaTheme({
      config: { ...config, theme: { name: 'hostile-theme' } },
      verify: true,
    })

    await expect(integration.hooks['astro:config:setup']?.(recorded.options)).rejects.toThrowError(
      /refused/u,
    )
  })
})

describe('the theme virtual module', () => {
  const module = themeVirtualModule({
    manifest: {
      name: 'canonical',
      version: '1.0.0',
      engine: '^1.0.0',
      blocks: '^1.0.0',
      implements: ['hero'],
      collections: '*',
      runtime: 'static',
      tokens: './tokens.json',
    },
    site: config.site,
  })

  it('serves the manifest and the site, and nothing else', () => {
    const code = module.load(module.resolveId(THEME_VIRTUAL_MODULE) ?? '') ?? ''

    expect(code).toContain('"name":"canonical"')
    expect(code).toContain('"defaultLocale":"fr"')
    // The read token stays out of Vite's module graph: everything in it is
    // reachable from theme code.
    expect(code).not.toContain('read-only')
  })

  it('ignores every other module id', () => {
    expect(module.resolveId('astro:content')).toBeUndefined()
    expect(module.load('astro:content')).toBeUndefined()
  })
})
