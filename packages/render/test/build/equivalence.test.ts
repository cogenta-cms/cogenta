import { describe, expect, it } from 'vitest'
import { planBuild } from '../../src/build/plan.js'
import { runBuild } from '../../src/build/run-build.js'
import { BUILD_TARGETS, type BuildTarget } from '../../src/build/targets.js'
import {
  blocks,
  renderRoute,
  routesWithServerBlock,
  staticRoutes,
  staticTheme,
} from './fixtures.js'

describe('the three targets on the same content', () => {
  it('produces byte-identical HTML on static, Node SSR and edge', async () => {
    const outputs = new Map<BuildTarget, Map<string, string>>()

    for (const target of BUILD_TARGETS) {
      const result = await runBuild({
        target,
        routes: staticRoutes,
        blocks,
        theme: staticTheme,
        render: renderRoute,
      })
      const served = new Map<string, string>()
      for (const route of staticRoutes) served.set(route.path, await result.serve(route.path))
      outputs.set(target, served)
    }

    const reference = outputs.get('static')
    expect(reference).toBeDefined()
    if (reference === undefined) return

    for (const target of BUILD_TARGETS) {
      // Equality, not similarity: the renderer never learns which target it is
      // running under, so any difference here would be a bug in the build, not
      // a legitimate variation.
      expect([target, outputs.get(target)]).toEqual([target, reference])
    }
  })

  it('prerenders everything on static and leaves nothing for a request', async () => {
    const result = await runBuild({
      target: 'static',
      routes: staticRoutes,
      blocks,
      theme: staticTheme,
      render: renderRoute,
    })

    expect(result.pages.size).toBe(staticRoutes.length)
    expect(result.onDemand).toEqual([])
  })

  it('accepts the server block on Node SSR and on edge, and serves it identically', async () => {
    const node = await runBuild({
      target: 'node',
      routes: routesWithServerBlock,
      blocks,
      theme: staticTheme,
      render: renderRoute,
    })
    const edge = await runBuild({
      target: 'edge',
      routes: routesWithServerBlock,
      blocks,
      theme: staticTheme,
      render: renderRoute,
    })

    // The pages carrying `collectionList` wait for a request; the page that
    // does not is still built ahead of time. That is the hybrid both
    // request-time targets give, and it is the same split on both.
    expect(node.onDemand).toEqual(['/', '/blog'])
    expect(edge.onDemand).toEqual(['/', '/blog'])
    expect([...node.pages.keys()]).toEqual(['/about'])

    for (const route of routesWithServerBlock) {
      expect(await node.serve(route.path)).toBe(await edge.serve(route.path))
    }
  })

  it('renders every route the same whether it was prerendered or served on demand', async () => {
    const built = await runBuild({
      target: 'node',
      routes: routesWithServerBlock,
      blocks,
      theme: staticTheme,
      render: renderRoute,
    })

    for (const route of routesWithServerBlock) {
      expect(await built.serve(route.path)).toBe(renderRoute(route))
    }
  })

  it('puts every page on demand when the theme itself needs a server', () => {
    const plan = planBuild({
      target: 'node',
      routes: staticRoutes,
      blocks,
      theme: { name: 'shop', runtime: 'server' },
    })

    expect(plan.routes.every((route) => route.mode === 'on-demand')).toBe(true)
    expect(plan.routes[0]?.needs).toEqual(['theme shop'])
  })

  it('answers a path it never built with a 404-shaped error, not with an empty page', async () => {
    const built = await runBuild({
      target: 'static',
      routes: staticRoutes,
      blocks,
      theme: staticTheme,
      render: renderRoute,
    })

    await expect(built.serve('/nope')).rejects.toThrow('No route "/nope" in this build.')
  })

  it('refuses two routes claiming the same path', async () => {
    await expect(
      runBuild({
        target: 'static',
        routes: [
          { path: '/a', blocks: [] },
          { path: '/a', blocks: [] },
        ],
        blocks,
        render: renderRoute,
      }),
    ).rejects.toThrow('Two routes claim the path "/a".')
  })
})
