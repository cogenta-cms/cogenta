import { isCogentaError } from '@cogenta/core'
import type { AstroIntegration } from 'astro'
import { describe, expect, it } from 'vitest'
import { cogentaBuildTarget } from '../../src/build/integration.js'
import { collectRuntimeRequirements } from '../../src/build/requirements.js'
import { blocks, routesWithServerBlock, staticRoutes, staticTheme } from './fixtures.js'

type SetupHook = NonNullable<AstroIntegration['hooks']['astro:config:setup']>
type SetupOptions = Parameters<SetupHook>[0]
type DoneHook = NonNullable<AstroIntegration['hooks']['astro:config:done']>
type DoneOptions = Parameters<DoneHook>[0]

interface Recorded {
  readonly updates: { output?: string }[]
  readonly logs: string[]
  readonly options: SetupOptions
}

/** Astro hands the hook a large object; this integration reads two fields of it. */
function setupOptions(): Recorded {
  const updates: { output?: string }[] = []
  const logs: string[] = []
  const options = {
    updateConfig: (update: { output?: string }) => {
      updates.push(update)
      return {}
    },
    logger: { info: (message: string) => logs.push(message) },
  } as unknown as SetupOptions

  return { updates, logs, options }
}

function doneOptions(adapter: { name: string } | undefined): DoneOptions {
  return { config: { adapter } } as unknown as DoneOptions
}

const staticRequirements = collectRuntimeRequirements({
  routes: staticRoutes,
  blocks,
  theme: staticTheme,
})

const serverRequirements = collectRuntimeRequirements({
  routes: routesWithServerBlock,
  blocks,
  theme: staticTheme,
})

describe('the build-target integration', () => {
  it('sets Astro output to static for the static target', async () => {
    const recorded = setupOptions()
    const integration = cogentaBuildTarget({
      target: 'static',
      requirements: staticRequirements,
    })

    await integration.hooks['astro:config:setup']?.(recorded.options)

    expect(recorded.updates[0]?.output).toBe('static')
    expect(recorded.logs[0]).toContain('target static')
  })

  it('sets Astro output to server for Node SSR and for edge', async () => {
    for (const target of ['node', 'edge'] as const) {
      const recorded = setupOptions()
      await cogentaBuildTarget({ target, requirements: serverRequirements }).hooks[
        'astro:config:setup'
      ]?.(recorded.options)

      expect(recorded.updates[0]?.output).toBe('server')
    }
  })

  it('refuses the static build before Astro renders a single page', async () => {
    const recorded = setupOptions()
    const integration = cogentaBuildTarget({
      target: 'static',
      requirements: serverRequirements,
    })

    await expect(integration.hooks['astro:config:setup']?.(recorded.options)).rejects.toThrowError(
      /block "collectionList"/u,
    )
    expect(recorded.updates).toEqual([])
  })

  it('accepts requirements produced lazily, once the route list is known', async () => {
    const recorded = setupOptions()
    const integration = cogentaBuildTarget({
      target: 'static',
      requirements: async () => await Promise.resolve(staticRequirements),
    })

    await integration.hooks['astro:config:setup']?.(recorded.options)
    expect(recorded.updates[0]?.output).toBe('static')
  })

  it('names the adapter to install when a request-time target has none', () => {
    const integration = cogentaBuildTarget({ target: 'edge' })

    try {
      integration.hooks['astro:config:done']?.(doneOptions(undefined))
      expect.unreachable('a server output with no adapter must be refused')
    } catch (error) {
      expect(isCogentaError(error)).toBe(true)
      if (!isCogentaError(error)) return
      expect(error.message).toContain('needs an Astro adapter')
      expect(error.hint).toContain('@astrojs/cloudflare')
      expect(error.hint).toContain('@astrojs/vercel')
      expect(error.hint).toContain('--target static')
    }

    expect(() =>
      integration.hooks['astro:config:done']?.(doneOptions({ name: '@astrojs/cloudflare' })),
    ).not.toThrow()
  })

  it('asks for no adapter on the static target', () => {
    const integration = cogentaBuildTarget({ target: 'static' })
    expect(() => integration.hooks['astro:config:done']?.(doneOptions(undefined))).not.toThrow()
  })
})
